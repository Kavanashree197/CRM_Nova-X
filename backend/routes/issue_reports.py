"""Customer Issue Reports — the first step in the CRM workflow.

Resource submits a report → Team Lead reviews → converts to official case
(or rejects). The report preserves the original reporter + customer info
so the full chain is traceable.

Endpoints:
  POST   /api/issue-reports              — Resource submits a report
  GET    /api/issue-reports              — Team Lead: all; Resource: own only
  GET    /api/issue-reports/<id>         — detail
  POST   /api/issue-reports/<id>/convert — Team Lead converts to official case
  POST   /api/issue-reports/<id>/reject — Team Lead rejects (with reason)
"""
from flask import Blueprint, request, jsonify
from datetime import date
import database as db
from auth import require_auth, require_role, current_user
import audit
import assignment

issue_reports_bp = Blueprint("issue_reports", __name__)

VALID_CONTACT_METHODS = ["Email", "Phone Call"]
VALID_REPORT_STATUSES = ["Pending Review", "Reviewed", "Converted to Case", "Rejected"]
VALID_CATEGORIES = [
    "Billing", "Technical Support", "Account Access", "Onboarding",
    "Feature Request", "Bug Report", "Data Migration", "Compliance",
]


def _is_valid_category(name):
    if not name:
        return False
    return db.fetch_one("SELECT category_id FROM categories WHERE name=%s", (name,)) is not None


def _serialize_report(r):
    if not r:
        return None
    return {
        "report_id": r["report_id"],
        "customer_name": r["customer_name"],
        "customer_email": r.get("customer_email"),
        "customer_phone": r.get("customer_phone"),
        "contact_method": r["contact_method"],
        "issue_title": r["issue_title"],
        "category": r["category"],
        "description": r.get("description"),
        "reference_info": r.get("reference_info"),
        "reported_date": r["reported_date"],
        "reported_by": r["reported_by"],
        "reported_by_name": r.get("reported_by_name"),
        "submitted_at": str(r["submitted_at"]),
        "status": r["status"],
        "reviewed_by": r.get("reviewed_by"),
        "reviewed_by_name": r.get("reviewed_by_name"),
        "reviewed_at": str(r["reviewed_at"]) if r.get("reviewed_at") else None,
        "rejection_reason": r.get("rejection_reason"),
        "converted_case_id": r.get("converted_case_id"),
        "converted_case_code": r.get("converted_case_code"),
    }


# ---------------------------------------------------------------------------
# POST /api/issue-reports  — Resource submits a customer issue report
# ---------------------------------------------------------------------------
@issue_reports_bp.route("", methods=["POST"])
@require_role("Resource")
def submit_report():
    """Only Resources submit issue reports (they're the ones receiving
    customer calls/emails). The reported_by is taken from the JWT — never
    from the request body."""
    me = current_user()
    data = request.get_json(force=True) or {}

    customer_name  = (data.get("customer_name") or "").strip()
    customer_email = (data.get("customer_email") or "").strip() or None
    customer_phone = (data.get("customer_phone") or "").strip() or None
    contact_method = (data.get("contact_method") or "").strip()
    issue_title    = (data.get("issue_title") or "").strip()
    category       = (data.get("category") or "").strip()
    description    = (data.get("description") or "").strip() or None
    reference_info = (data.get("reference_info") or "").strip() or None
    reported_date  = (data.get("reported_date") or date.today().isoformat()).strip()

    if not customer_name:
        return jsonify({"error": "Customer name is required"}), 400
    if contact_method not in VALID_CONTACT_METHODS:
        return jsonify({"error": "Contact method must be Email or Phone Call"}), 400
    if not issue_title:
        return jsonify({"error": "Issue title is required"}), 400
    if not _is_valid_category(category):
        return jsonify({"error": "Invalid category"}), 400

    rid, _ = db.execute(
        """INSERT INTO issue_reports
           (customer_name, customer_email, customer_phone, contact_method,
            issue_title, category, description, reference_info, reported_date,
            reported_by, status)
           VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Pending Review')""",
        (customer_name, customer_email, customer_phone, contact_method,
         issue_title, category, description, reference_info, reported_date,
         me["user_id"]))

    audit.log_audit("issue_report", rid, "issue_report_submitted", me["user_id"],
                    f"Issue report #{rid} submitted by {me['name']} for customer '{customer_name}'.",
                    {"customer_name": customer_name, "category": category})

    row = db.fetch_one(
        """SELECT ir.*, u.name AS reported_by_name
           FROM issue_reports ir LEFT JOIN users u ON u.user_id = ir.reported_by
           WHERE ir.report_id = %s""", (rid,))
    return jsonify({"report": _serialize_report(row)}), 201


# ---------------------------------------------------------------------------
# GET /api/issue-reports  — list (Team Lead: all; Resource: own only)
# ---------------------------------------------------------------------------
@issue_reports_bp.route("", methods=["GET"])
@require_auth
def list_reports():
    me = current_user()
    status_filter = request.args.get("status")

    where = []
    params = []
    # Resources see only their own reports; Team Lead + Admin see all
    if me["role"] == "Resource":
        where.append("ir.reported_by = %s"); params.append(me["user_id"])
    if status_filter:
        where.append("ir.status = %s"); params.append(status_filter)

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db.fetch_all(
        f"""SELECT ir.*, u.name AS reported_by_name,
                   u2.name AS reviewed_by_name,
                   c.case_code AS converted_case_code
           FROM issue_reports ir
           LEFT JOIN users u  ON u.user_id  = ir.reported_by
           LEFT JOIN users u2 ON u2.user_id = ir.reviewed_by
           LEFT JOIN cases c  ON c.case_id  = ir.converted_case_id
           {where_sql}
           ORDER BY ir.report_id DESC""", params)
    return jsonify({"reports": [_serialize_report(r) for r in rows], "count": len(rows)})


# ---------------------------------------------------------------------------
# GET /api/issue-reports/<id>  — detail
# ---------------------------------------------------------------------------
@issue_reports_bp.route("/<int:report_id>", methods=["GET"])
@require_auth
def get_report(report_id):
    me = current_user()
    row = db.fetch_one(
        """SELECT ir.*, u.name AS reported_by_name, u2.name AS reviewed_by_name,
                  c.case_code AS converted_case_code
           FROM issue_reports ir
           LEFT JOIN users u  ON u.user_id  = ir.reported_by
           LEFT JOIN users u2 ON u2.user_id = ir.reviewed_by
           LEFT JOIN cases c  ON c.case_id  = ir.converted_case_id
           WHERE ir.report_id = %s""", (report_id,))
    if not row:
        return jsonify({"error": "Report not found"}), 404
    # Resources can only see their own reports
    if me["role"] == "Resource" and row["reported_by"] != me["user_id"]:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({"report": _serialize_report(row)})


# ---------------------------------------------------------------------------
# POST /api/issue-reports/<id>/convert  — Team Lead converts to official case
# ---------------------------------------------------------------------------
@issue_reports_bp.route("/<int:report_id>/convert", methods=["POST"])
@require_role("Team Lead")
def convert_to_case(report_id):
    """Team Lead converts a reviewed issue report into an official CRM case.
    The case inherits the customer info, category, and reported_by from the
    report. Priority is auto-derived from the category. Assignment is
    automatic (skills + availability + workload). The report's status becomes
    'Converted to Case' and is linked to the new case_id. Prevents double
    conversion."""
    me = current_user()
    data = request.get_json(force=True) or {}

    report = db.fetch_one("SELECT * FROM issue_reports WHERE report_id=%s", (report_id,))
    if not report:
        return jsonify({"error": "Report not found"}), 404
    if report["status"] == "Converted to Case":
        return jsonify({"error": "This report has already been converted to a case"}), 409
    if report["status"] == "Rejected":
        return jsonify({"error": "This report has been rejected and cannot be converted"}), 409

    # Optional overrides from the Team Lead
    title_override = (data.get("title") or "").strip()
    due_date       = data.get("due_date") or None
    next_action_date = data.get("next_action_date") or None
    next_action      = (data.get("next_action") or "").strip() or None

    # Date validation: next_action_date <= due_date
    if due_date and next_action_date and next_action_date > due_date:
        return jsonify({"error": "Next action date must be on or before the due date"}), 400

    title = title_override or report["issue_title"]
    category = report["category"]

    # Auto-derive priority from the category
    cat_row = db.fetch_one("SELECT default_priority FROM categories WHERE name=%s", (category,))
    if not cat_row:
        return jsonify({"error": "Invalid category"}), 400
    priority = cat_row["default_priority"]

    # Generate case code
    count = db.fetch_one("SELECT COUNT(*) AS c FROM cases")["c"]
    case_code = f"CASE-{count + 1:03d}"

    # Create the official case — created_by = Team Lead, reported_by = the
    # employee who reported the issue, issue_report_id links back to the report.
    # --- Determine complexity from the issue title + description ---
    from routes.cases import _detect_complexity_from_text, VALID_COMPLEXITIES
    detection = _detect_complexity_from_text(title, report.get("description") or "")
    if detection["complexity"]:
        case_complexity = detection["complexity"]
    else:
        cat_cx_row = db.fetch_one("SELECT complexity FROM categories WHERE name=%s", (category,))
        case_complexity = cat_cx_row["complexity"] if cat_cx_row and cat_cx_row["complexity"] else "Medium"
    if case_complexity not in VALID_COMPLEXITIES:
        case_complexity = "Medium"

    cid, _ = db.execute(
        """INSERT INTO cases
           (case_code, title, category, description, priority, status,
            created_by, due_date, next_action_date, next_action, complexity,
            customer_name, customer_email, customer_phone, contact_method,
            reported_by, issue_report_id, assignment_status)
           VALUES (%s,%s,%s,%s,%s,'New',%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'Awaiting Assignment')""",
        (case_code, title, category, report.get("description") or "",
         priority, me["user_id"], due_date, next_action_date, next_action, case_complexity,
         report["customer_name"], report.get("customer_email"),
         report.get("customer_phone"), report["contact_method"],
         report["reported_by"], report_id))

    # Action log + audit
    import activity
    reporter_name = db.fetch_one("SELECT name FROM users WHERE user_id=%s",
                                  (report["reported_by"],))["name"]
    activity.log_action(cid, me["user_id"], "case_created",
                       f"Case {case_code} created from issue report #{report_id} "
                       f"(reported by {reporter_name}).",
                       None, "New")
    audit.log_audit("case", cid, "case_created", me["user_id"],
                    f"Case {case_code} created from issue report #{report_id}.",
                    {"report_id": report_id, "reported_by": report["reported_by"]})
    audit.log_status_history(cid, None, "New", me["user_id"], "Case created from issue report")

    # Automatic assignment (workload + complexity based)
    assigned_uid = assignment.assign_case(cid, category, complexity=case_complexity)

    # Update the report
    closed_at_expr = "datetime('now')" if db.config.DB_TYPE == "sqlite" else "CURRENT_TIMESTAMP"
    db.execute(
        f"""UPDATE issue_reports SET status='Converted to Case',
            reviewed_by=%s, reviewed_at={closed_at_expr},
            converted_case_id=%s WHERE report_id=%s""",
        (me["user_id"], cid, report_id))
    audit.log_audit("issue_report", report_id, "report_converted", me["user_id"],
                    f"Report #{report_id} converted to case {case_code} by {me['name']}.",
                    {"case_id": cid})

    case_row = db.fetch_one(
        """SELECT c.*, ua.name AS assigned_to_name
           FROM cases c LEFT JOIN users ua ON ua.user_id = c.assigned_to
           WHERE c.case_id = %s""", (cid,))
    return jsonify({
        "case": {
            "case_id": case_row["case_id"], "case_code": case_row["case_code"],
            "title": case_row["title"], "category": case_row["category"],
            "priority": case_row["priority"], "status": case_row["status"],
            "assigned_to": case_row["assigned_to"],
            "assigned_to_name": case_row.get("assigned_to_name"),
            "assignment_status": case_row["assignment_status"],
            "customer_name": case_row.get("customer_name"),
            "reported_by": case_row.get("reported_by"),
            "issue_report_id": case_row.get("issue_report_id"),
        },
        "report_id": report_id,
    }), 201


# ---------------------------------------------------------------------------
# POST /api/issue-reports/<id>/reject  — Team Lead rejects (with reason)
# ---------------------------------------------------------------------------
@issue_reports_bp.route("/<int:report_id>/reject", methods=["POST"])
@require_role("Team Lead")
def reject_report(report_id):
    me = current_user()
    data = request.get_json(force=True) or {}
    reason = (data.get("reason") or "").strip()
    if not reason:
        return jsonify({"error": "A rejection reason is required"}), 400

    report = db.fetch_one("SELECT * FROM issue_reports WHERE report_id=%s", (report_id,))
    if not report:
        return jsonify({"error": "Report not found"}), 404
    if report["status"] in ("Converted to Case", "Rejected"):
        return jsonify({"error": f"Report is already {report['status']}"}), 409

    closed_at_expr = "datetime('now')" if db.config.DB_TYPE == "sqlite" else "CURRENT_TIMESTAMP"
    db.execute(
        f"""UPDATE issue_reports SET status='Rejected',
            reviewed_by=%s, reviewed_at={closed_at_expr},
            rejection_reason=%s WHERE report_id=%s""",
        (me["user_id"], reason, report_id))
    audit.log_audit("issue_report", report_id, "report_rejected", me["user_id"],
                    f"Report #{report_id} rejected by {me['name']}: {reason}",
                    {"reason": reason})
    return jsonify({"report_id": report_id, "status": "Rejected", "reason": reason})
