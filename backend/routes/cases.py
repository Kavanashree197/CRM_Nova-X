"""Case management routes.

Every mutating endpoint writes one or more immutable action-log rows
through activity.log_action(). Historical rows are never edited or deleted.

In addition, every meaningful change is recorded in:
  - audit_logs (system-level audit trail)
  - case_status_history (formal status transition log)
"""
from flask import Blueprint, request, jsonify
from datetime import date
import re

import database as db
from auth import require_auth, require_role, current_user
import activity
import audit
import assignment

cases_bp = Blueprint("cases", __name__)

VALID_STATUSES   = ["New", "Active", "Pending", "Completed", "Reopened"]
VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"]
VALID_COMPLEXITIES = ["Low", "Medium", "High"]

# Keyword → complexity mapping for automatic detection. Multi-word phrases
# are weighted higher. The detector analyses the title + description.
COMPLEXITY_KEYWORDS = {
    "High": [
        "crash", "crashes", "crashed", "security", "breach", "unauthorized",
        "suspicious", "hacked", "critical", "incident", "data loss",
        "corruption", "outage", "down", "production", "emergency",
        "vulnerability", "exploit", "malware", "ransomware",
        "application crashes", "security breach", "unauthorized access",
        "suspicious activity", "critical incident",
    ],
    "Medium": [
        "payment", "invoice", "billing", "transaction", "charge", "refund",
        "login", "log in", "password", "access", "account", "locked",
        "reset", "error", "timeout", "slow", "broken", "not working",
        "failed", "duplicate", "pending", "verification", "investigation",
        "multiple failed", "order not confirmed", "payment deducted",
        "transaction failed", "unable to log in", "cannot access",
        "unable to access",
    ],
    "Low": [
        "update", "change", "request", "information", "question",
        "mobile number", "email address", "general", "inquiry",
        "onboarding", "setup", "activate", "feature", "suggestion",
        "dark mode", "update registered", "general information",
    ],
}


def _detect_complexity_from_text(title, description=""):
    """Analyse title + description and return a complexity level + confidence.
    Uses weighted keyword matching (same approach as category detection).
    Returns {"complexity": "Low"/"Medium"/"High" or None, "confidence": "high"/"low"/"none"}.
    """
    text = _normalise_text(title + " " + (description or ""))
    if len(text.strip()) < 3:
        return {"complexity": None, "confidence": "none"}

    scores = {}
    for level, keywords in COMPLEXITY_KEYWORDS.items():
        score = 0
        for kw in keywords:
            if kw.lower() in text:
                weight = 2 if " " in kw else 1
                score += weight
        if score > 0:
            scores[level] = score

    if not scores:
        return {"complexity": None, "confidence": "none"}

    best = max(scores, key=scores.get)
    best_score = scores[best]
    confidence = "high" if best_score >= 2 else "low"
    return {"complexity": best, "confidence": confidence}


def _normalise_text(text):
    return re.sub(r"\s+", " ", (text or "").lower().strip())


# ---------------------------------------------------------------------------
# POST /api/cases/detect-complexity  — real-time complexity detection
# ---------------------------------------------------------------------------
@cases_bp.route("/detect-complexity", methods=["POST"])
@require_auth
def detect_complexity():
    """Analyse a case title (+ optional description) and return the detected
    complexity level. Used by the Create Case form for real-time display."""
    data = request.get_json(force=True) or {}
    title = (data.get("title") or "").strip()
    description = (data.get("description") or "").strip()
    result = _detect_complexity_from_text(title, description)
    return jsonify(result)


# Categories are validated against the `categories` table (DB-driven) so an
# Admin can add new categories at runtime without code changes. The legacy
# list is kept only as a fallback for tests that import this constant.
VALID_CATEGORIES_FALLBACK = [
    "Billing", "Technical Support", "Account Access", "Onboarding",
    "Feature Request", "Bug Report", "Data Migration", "Compliance",
]


def _is_valid_category(name):
    """Validate against the categories table (dynamic)."""
    if not name:
        return False
    row = db.fetch_one("SELECT category_id FROM categories WHERE name=%s", (name,))
    return row is not None


def _next_case_code():
    row = db.fetch_one("SELECT MAX(case_id) AS m FROM cases")
    n = (row["m"] or 0) + 1
    return "CASE-%03d" % n


def _case_row(case_id):
    return db.fetch_one(
        """SELECT c.*,
                  uc.name AS created_by_name,
                  ua.name AS assigned_to_name,
                  ua.email AS assigned_to_email,
                  ucl.name AS closed_by_name
           FROM cases c
           LEFT JOIN users uc ON uc.user_id = c.created_by
           LEFT JOIN users ua ON ua.user_id = c.assigned_to
           LEFT JOIN users ucl ON ucl.user_id = c.closed_by_user_id
           WHERE c.case_id = %s""",
        (case_id,),
    )


def _user_can_see_all_cases(user):
    """Admin/Team Lead see all cases; Resources see only their assigned ones."""
    return user["role"] in ("Admin", "Team Lead")


# ---------------------------------------------------------------------------
# GET /api/cases  - list + filter
# ---------------------------------------------------------------------------
@cases_bp.route("", methods=["GET"])
@require_auth
def list_cases():
    user = current_user()
    where = []
    params = []

    # Filters from query string
    status   = request.args.get("status")
    priority = request.args.get("priority")
    category = request.args.get("category")
    assignee = request.args.get("assigned_to")
    search   = request.args.get("q")
    overdue  = request.args.get("overdue") == "1"

    if not _user_can_see_all_cases(user):
        where.append("c.assigned_to = %s")
        params.append(user["user_id"])
    if status:
        where.append("c.status = %s"); params.append(status)
    if priority:
        where.append("c.priority = %s"); params.append(priority)
    if category:
        where.append("c.category = %s"); params.append(category)
    if assignee:
        where.append("c.assigned_to = %s"); params.append(assignee)
    if search:
        where.append("(c.title LIKE %s OR c.case_code LIKE %s)")
        params += [f"%{search}%", f"%{search}%"]
    if overdue:
        where.append("c.status NOT IN ('Completed')")
        where.append("c.due_date IS NOT NULL")
        where.append("c.due_date < %s"); params.append(date.today().isoformat())

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"""SELECT c.case_id, c.case_code, c.title, c.category, c.priority,
                     c.status, c.due_date, c.next_action_date, c.completion_date,
                     c.assigned_to, ua.name AS assigned_to_name,
                     c.assignment_status,
                     c.created_at, c.updated_at
              FROM cases c
              LEFT JOIN users ua ON ua.user_id = c.assigned_to
              {where_sql}
              ORDER BY c.created_at DESC"""
    rows = db.fetch_all(sql, params)
    # Compute is_overdue on the fly
    today = date.today().isoformat()
    for r in rows:
        r["is_overdue"] = (
            r["due_date"] and r["status"] != "Completed" and r["due_date"] < today
        )
    return jsonify({"cases": rows, "count": len(rows)})


# ---------------------------------------------------------------------------
# POST /api/cases  - create
# ---------------------------------------------------------------------------
@cases_bp.route("", methods=["POST"])
@require_role("Team Lead")
def create_case():
    """Only Team Leads create official cases. Resources submit customer issue
    reports (which the Team Lead converts). Admin monitors. The role is
    verified from the JWT, never trusted from the client."""
    user = current_user()
    data = request.get_json(force=True) or {}

    title       = (data.get("title") or "").strip()
    category    = (data.get("category") or "").strip()
    description = (data.get("description") or "").strip()
    # Priority is NEVER read from the client. It is derived from the
    # category's default_priority (source of truth = the categories table).
    # Any client-supplied priority is silently ignored.
    # assigned_to is NEVER read from the client — assignment is fully automatic.
    # Any client-supplied assigned_to is silently ignored.
    if "assigned_to" in data or "assignee" in data:
        # Explicit rejection so manual-assignment attempts are logged + visible.
        audit.log_audit("case", None, "manual_assignment_rejected", user["user_id"],
                        f"User {user['name']} ({user['role']}) attempted manual assignment "
                        f"on case creation — rejected.",
                        {"client_field": "assigned_to" if "assigned_to" in data else "assignee"})
        return jsonify({"error":
            "Manual assignment is not allowed. Cases are assigned automatically "
            "by the system based on skills, workload and availability."}), 403
    due_date    = data.get("due_date") or None
    next_action_date = data.get("next_action_date") or None
    next_action       = (data.get("next_action") or "").strip() or None

    # Date validation: next_action_date must be on or before due_date
    if due_date and next_action_date and next_action_date > due_date:
        return jsonify({"error": "Next action date must be on or before the due date"}), 400

    # Optional customer info (Team Lead may include when creating directly)
    customer_name  = (data.get("customer_name") or "").strip() or None
    customer_email = (data.get("customer_email") or "").strip() or None
    customer_phone = (data.get("customer_phone") or "").strip() or None
    contact_method = (data.get("contact_method") or "").strip() or None
    if contact_method and contact_method not in ("Email", "Phone Call"):
        return jsonify({"error": "Contact method must be Email or Phone Call"}), 400

    if not title:
        return jsonify({"error": "Title is required"}), 400
    if not _is_valid_category(category):
        return jsonify({"error": "Invalid category"}), 400
    # Look up the category's default_priority — the backend decides priority.
    cat_row = db.fetch_one("SELECT default_priority FROM categories WHERE name=%s", (category,))
    if not cat_row:
        return jsonify({"error": "Invalid category"}), 400
    priority = cat_row["default_priority"]
    if priority not in VALID_PRIORITIES:
        priority = "Medium"  # defensive fallback

    # --- Determine complexity from the title + description (keyword-based) ---
    # If the client sent a complexity, validate it; otherwise detect from text.
    # Fallback to the category's baseline complexity if detection fails.
    client_complexity = (data.get("complexity") or "").strip()
    if client_complexity and client_complexity in VALID_COMPLEXITIES:
        case_complexity = client_complexity
    else:
        detection = _detect_complexity_from_text(title, description)
        if detection["complexity"]:
            case_complexity = detection["complexity"]
        else:
            # Fallback to the category's baseline complexity
            cat_cx_row = db.fetch_one("SELECT complexity FROM categories WHERE name=%s", (category,))
            case_complexity = cat_cx_row["complexity"] if cat_cx_row and cat_cx_row["complexity"] else "Medium"
    if case_complexity not in VALID_COMPLEXITIES:
        case_complexity = "Medium"  # defensive fallback — never save NULL

    case_code = _next_case_code()
    created_by = user["user_id"]
    cid, _ = db.execute(
        """INSERT INTO cases
           (case_code, title, category, description, priority, status,
            created_by, assigned_to, assignment_status, due_date,
            next_action_date, next_action, complexity,
            customer_name, customer_email, customer_phone, contact_method)
           VALUES (%s,%s,%s,%s,%s,'New',%s,NULL,'Awaiting Assignment',%s,%s,%s,%s,%s,%s,%s,%s)""",
        (case_code, title, category, description, priority,
         created_by, due_date, next_action_date, next_action, case_complexity,
         customer_name, customer_email, customer_phone, contact_method),
    )

    # --- Automatic assignment engine (workload + complexity based) ---
    assigned_uid = assignment.assign_case(cid, category, complexity=case_complexity)

    if assigned_uid:
        assignee_name = db.fetch_one("SELECT name FROM users WHERE user_id=%s",
                                      (assigned_uid,))["name"]
        activity.log_action(
            cid, user["user_id"], "case_created",
            f"Case {case_code} created and automatically assigned to {assignee_name}.",
            None, "New")
        audit.log_audit("case", cid, "case_created", user["user_id"],
                        f"Case {case_code} created and automatically assigned to {assignee_name}.",
                        {"case_code": case_code, "assigned_to": assigned_uid,
                         "assignment_method": "Automatic"})
    else:
        activity.log_action(
            cid, user["user_id"], "case_created",
            f"Case {case_code} created — Awaiting Assignment (no eligible employee).",
            None, "New")
        audit.log_audit("case", cid, "case_created", user["user_id"],
                        f"Case {case_code} created — Awaiting Assignment.",
                        {"case_code": case_code})
    # Formal status history: initial New state
    audit.log_status_history(cid, None, "New", user["user_id"], "Case created")

    return jsonify({"case": _case_row(cid)}), 201


# ---------------------------------------------------------------------------
# GET /api/cases/<id>  - detail
# ---------------------------------------------------------------------------
@cases_bp.route("/<int:case_id>", methods=["GET"])
@require_auth
def get_case(case_id):
    user = current_user()
    case = _case_row(case_id)
    if not case:
        return jsonify({"error": "Case not found"}), 404
    if not _user_can_see_all_cases(user) and case["assigned_to"] != user["user_id"]:
        return jsonify({"error": "Forbidden"}), 403
    return jsonify({"case": case})


# ---------------------------------------------------------------------------
# PUT /api/cases/<id>  - edit details / assign / priority / status
# ---------------------------------------------------------------------------
@cases_bp.route("/<int:case_id>", methods=["PUT"])
@require_auth
def update_case(case_id):
    user = current_user()
    case = _case_row(case_id)
    if not case:
        return jsonify({"error": "Case not found"}), 404
    # Resources can only edit cases assigned to them
    if not _user_can_see_all_cases(user) and case["assigned_to"] != user["user_id"]:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json(force=True) or {}
    changes = []

    # Editable text fields
    for field in ("title", "category", "description", "next_action"):
        if field in data:
            new = (data.get(field) or "").strip() if field != "description" else (data.get(field) or "")
            old = case[field]
            if new != old:
                if field == "category" and not _is_valid_category(new):
                    return jsonify({"error": "Invalid category"}), 400
                db.execute(f"UPDATE cases SET {field}=%s WHERE case_id=%s",
                           (new, case_id))
                activity.log_action(case_id, user["user_id"], "case_updated",
                                    f"{field.replace('_',' ').title()} updated.",
                                    old, new)
                # When the category changes, priority is automatically
                # recomputed from the new category's default_priority.
                # The client cannot set priority directly.
                if field == "category":
                    cat_row = db.fetch_one("SELECT default_priority FROM categories WHERE name=%s", (new,))
                    new_pri = cat_row["default_priority"] if cat_row else "Medium"
                    if new_pri != case["priority"]:
                        old_pri = case["priority"]
                        db.execute("UPDATE cases SET priority=%s WHERE case_id=%s",
                                   (new_pri, case_id))
                        activity.log_action(case_id, user["user_id"], "priority_updated",
                                            f"Priority auto-updated from {old_pri} to {new_pri} (category changed).",
                                            old_pri, new_pri)
                        audit.log_audit("case", case_id, "priority_auto_changed", user["user_id"],
                                        f"Priority auto-updated from {old_pri} to {new_pri} because category changed to {new}.",
                                        {"from": old_pri, "to": new_pri, "reason": "category_change"})
                        changes.append("priority")
                    # Re-run the assignment engine for the new category — the
                    # previous assignee may not have the matching skill. The
                    # previous assignment is preserved in case_assignments.
                    prev_assignee = case["assigned_to"]
                    db.execute(
                        "UPDATE cases SET assigned_to=NULL, assignment_status='Awaiting Assignment' WHERE case_id=%s",
                        (case_id,))
                    new_uid = assignment.assign_case(case_id, new, previous_assignee_id=prev_assignee)
                    if new_uid:
                        nm = db.fetch_one("SELECT name FROM users WHERE user_id=%s", (new_uid,))["name"]
                        activity.log_action(case_id, user["user_id"], "case_reassigned",
                                            f"Case auto-reassigned to {nm} after category change to {new}.",
                                            None, nm)
                        changes.append("assigned_to")
                changes.append(field)

    # Date fields
    for field in ("due_date", "next_action_date"):
        if field in data:
            new = data.get(field) or None
            old = case[field]
            if new != old:
                db.execute(f"UPDATE cases SET {field}=%s WHERE case_id=%s",
                           (new, case_id))
                activity.log_action(case_id, user["user_id"], "case_updated",
                                    f"{field.replace('_',' ').title()} updated.",
                                    old, new)
                audit.log_audit("case", case_id, f"{field}_changed", user["user_id"],
                                f"{field.replace('_',' ').title()} changed from {old or '—'} to {new or '—'}.",
                                {"field": field, "from": old, "to": new})
                changes.append(field)

    # Priority is NOT settable by the client. It is always derived from the
    # category's default_priority (handled in the category-change block above).
    # Any client-supplied "priority" field is silently ignored so the backend
    # remains the source of truth. (No error returned — the request still
    # succeeds for the other fields, but priority is never overwritten by it.)

    # Assignment / reassignment — fully automatic. The client cannot set
    # assigned_to. Any attempt is rejected with 403 and logged to audit.
    if "assigned_to" in data or "assignee" in data:
        audit.log_audit("case", case_id, "manual_assignment_rejected", user["user_id"],
                        f"User {user['name']} ({user['role']}) attempted manual "
                        f"reassignment of case {case['case_code']} — rejected.",
                        {"client_field": "assigned_to" if "assigned_to" in data else "assignee"})
        return jsonify({"error":
            "Manual reassignment is not allowed. Assignment is automatic and "
            "based on skills, workload and availability. To reassign, an Admin "
            "can change an employee's availability in Settings."}), 403

    # When the category changes, the assignment engine re-runs automatically
    # (the case may need a different skilled employee). The previous assignment
    # is preserved in case_assignments with previous_assignee_id set.
    # (Handled in the category-change block above — see `assignment_status`.)

    # Status change
    if "status" in data:
        new = data["status"]
        if new not in VALID_STATUSES:
            return jsonify({"error": "Invalid status"}), 400
        old = case["status"]
        if new != old:
            # Business rule: cannot mark Completed without a resolution note
            resolution_note = (data.get("resolution_note") or "").strip()
            if new == "Completed":
                if not resolution_note:
                    return jsonify({"error":
                        "A resolution note is required to mark a case Completed"}), 400
                # Closure attribution: record the AUTHENTICATED user who actually
                # closed the case (from the JWT, never from the request body) +
                # the timestamp + the category's baseline complexity (so
                # dashboards show one consistent value across roles).
                cat_row = db.fetch_one(
                    "SELECT complexity FROM categories WHERE name=%s", (case["category"],))
                complexity = cat_row["complexity"] if cat_row else None
                # closed_at: backend-generated timestamp (portable expression).
                closed_at_expr = "datetime('now')" if db.config.DB_TYPE == "sqlite" else "CURRENT_TIMESTAMP"
                db.execute(
                    f"""UPDATE cases SET status=%s, completion_date=%s,
                       resolution_note=%s, closed_by_user_id=%s,
                       closed_at={closed_at_expr}, complexity=%s
                       WHERE case_id=%s""",
                    (new, date.today().isoformat(), resolution_note,
                     user["user_id"], complexity, case_id))
                activity.log_action(case_id, user["user_id"], "resolution_submitted",
                                    f"Resolution note submitted. Case closed.",
                                    old, new)
                activity.log_action(case_id, user["user_id"], "status_changed",
                                    f"Status changed from {old} to {new}.",
                                    old, new)
                audit.log_status_history(case_id, old, new, user["user_id"],
                                         f"Resolved by {user['name']}: {resolution_note[:120]}")
                audit.log_audit("case", case_id, "status_changed", user["user_id"],
                                f"Status changed from {old} to {new} (resolved by {user['name']}).",
                                {"from": old, "to": new})
                audit.log_audit("case", case_id, "case_closed", user["user_id"],
                                f"Case closed by {user['name']} (assigned to "
                                f"{case.get('assigned_to_name') or 'Unassigned'}).",
                                {"closed_by": user["user_id"],
                                 "assigned_to": case.get("assigned_to"),
                                 "complexity": complexity})
            elif new == "Reopened":
                # Reopening preserves prior completion history (we don't wipe
                # completion_date/resolution_note - they remain visible in the
                # history log). We clear closure attribution on the case row
                # because the case is no longer closed; the prior closure
                # remains in case_status_history + audit_logs.
                db.execute(
                    """UPDATE cases SET status=%s, completion_date=NULL,
                       closed_by_user_id=NULL, closed_at=NULL WHERE case_id=%s""",
                    (new, case_id))
                activity.log_action(case_id, user["user_id"], "case_reopened",
                                    f"Case reopened from {old}. Prior completion preserved.",
                                    old, new)
                audit.log_status_history(case_id, old, new, user["user_id"],
                                         f"Reopened by {user['name']}; prior closure preserved.")
                audit.log_audit("case", case_id, "case_reopened", user["user_id"],
                                f"Case reopened from {old} by {user['name']}. Prior closure preserved.",
                                {"from": old, "to": new})
            else:
                db.execute("UPDATE cases SET status=%s WHERE case_id=%s",
                           (new, case_id))
                activity.log_action(case_id, user["user_id"], "status_changed",
                                    f"Status changed from {old} to {new}.",
                                    old, new)
                audit.log_status_history(case_id, old, new, user["user_id"], None)
                audit.log_audit("case", case_id, "status_changed", user["user_id"],
                                f"Status changed from {old} to {new}.",
                                {"from": old, "to": new})
            changes.append("status")

    db.execute("UPDATE cases SET updated_at=%s WHERE case_id=%s",
               (date.today().isoformat(), case_id))

    return jsonify({"case": _case_row(case_id), "changed": changes})


# ---------------------------------------------------------------------------
# POST /api/cases/<id>/actions  - add a comment / log a manual action
# ---------------------------------------------------------------------------
@cases_bp.route("/<int:case_id>/actions", methods=["POST"])
@require_auth
def add_action(case_id):
    user = current_user()
    case = _case_row(case_id)
    if not case:
        return jsonify({"error": "Case not found"}), 404
    if not _user_can_see_all_cases(user) and case["assigned_to"] != user["user_id"]:
        return jsonify({"error": "Forbidden"}), 403

    data = request.get_json(force=True) or {}
    action_type = (data.get("action_type") or "comment_added").strip()
    description = (data.get("description") or "").strip()
    previous_value = data.get("previous_value")
    new_value = data.get("new_value")
    if not description:
        return jsonify({"error": "Description is required"}), 400

    # Optional: schedule a next action in the same request
    next_action_date = data.get("next_action_date")
    next_action      = (data.get("next_action") or "").strip()
    if next_action_date or next_action:
        db.execute(
            "UPDATE cases SET next_action_date=%s, next_action=%s WHERE case_id=%s",
            (next_action_date, next_action or None, case_id))
        activity.log_action(case_id, user["user_id"], "next_action_scheduled",
                            f"Next action scheduled: {next_action or '(date only)'} "
                            f"for {next_action_date or 'N/A'}.",
                            None, next_action_date or next_action)

    aid = activity.log_action(case_id, user["user_id"], action_type,
                              description, previous_value, new_value)
    audit.log_audit("action", aid, "action_added", user["user_id"],
                    f"Action '{action_type}' recorded on case {case['case_code']}.",
                    {"case_id": case_id, "action_type": action_type,
                     "description": description[:200]})
    db.execute("UPDATE cases SET updated_at=%s WHERE case_id=%s",
               (date.today().isoformat(), case_id))
    return jsonify({"action_id": aid}), 201


# ---------------------------------------------------------------------------
# GET /api/cases/<id>/history  - assignments + actions + status history (timeline)
# ---------------------------------------------------------------------------
@cases_bp.route("/<int:case_id>/history", methods=["GET"])
@require_auth
def case_history(case_id):
    user = current_user()
    case = _case_row(case_id)
    if not case:
        return jsonify({"error": "Case not found"}), 404
    if not _user_can_see_all_cases(user) and case["assigned_to"] != user["user_id"]:
        return jsonify({"error": "Forbidden"}), 403

    assignments = db.fetch_all(
        """SELECT a.assignment_id, a.case_id, a.assigned_to, a.assigned_by,
                  a.assigned_at, a.note,
                  a.assignment_method, a.assignment_reason, a.previous_assignee_id,
                  ut.name AS assigned_to_name, ub.name AS assigned_by_name,
                  up.name AS previous_assignee_name
           FROM case_assignments a
           LEFT JOIN users ut ON ut.user_id = a.assigned_to
           LEFT JOIN users ub ON ub.user_id = a.assigned_by
           LEFT JOIN users up ON up.user_id = a.previous_assignee_id
           WHERE a.case_id = %s
           ORDER BY a.assigned_at ASC""", (case_id,))

    actions = db.fetch_all(
        """SELECT ac.action_id, ac.case_id, ac.user_id, ac.action_type,
                  ac.description, ac.previous_value, ac.new_value, ac.created_at,
                  u.name AS user_name
           FROM case_actions ac
           LEFT JOIN users u ON u.user_id = ac.user_id
           WHERE ac.case_id = %s
           ORDER BY ac.created_at ASC, ac.action_id ASC""", (case_id,))

    status_history = db.fetch_all(
        """SELECT h.history_id, h.case_id, h.from_status, h.to_status,
                  h.changed_by, h.note, h.changed_at,
                  u.name AS changed_by_name
           FROM case_status_history h
           LEFT JOIN users u ON u.user_id = h.changed_by
           WHERE h.case_id = %s
           ORDER BY h.changed_at ASC, h.history_id ASC""", (case_id,))

    return jsonify({
        "case": case,
        "assignments": assignments,
        "actions": actions,
        "status_history": status_history,
        "summary": {
            "assignments_count": len(assignments),
            "actions_count": len(actions),
            "status_history_count": len(status_history),
        },
    })


# ---------------------------------------------------------------------------
# Closed-case endpoints (PS-02 — closed-case visibility across dashboards)
#
# These enforce role-based access in Flask (not just frontend filtering):
#   /closed/my          -> the authenticated user's OWN closures (cases they
#                         actually closed, regardless of assignment)
#   /closed/team        -> Team Lead: closed cases assigned to any Resource
#                         (the "team"). Resources get 403.
#   /closed/organization -> Admin: all closures org-wide. Lead/Resource 403.
#
# Each row carries: case_id, case_code, title, category, priority, complexity,
# created_at, assigned_to_name, closed_by_name, closed_at, status.
# `complexity` is NULL -> the frontend shows "Not assessed".
# ---------------------------------------------------------------------------

CLOSED_CASE_FIELDS = """SELECT
    c.case_id, c.case_code, c.title, c.category, c.priority, c.complexity,
    c.created_at, c.completion_date, c.closed_at, c.status,
    ua.name AS assigned_to_name,
    ucl.name AS closed_by_name
"""


def _serialize_closed(row):
    return {
        "case_id": row["case_id"],
        "case_code": row["case_code"],
        "title": row["title"],
        "category": row["category"],
        "priority": row["priority"],
        "complexity": row["complexity"],  # None -> "Not assessed" in UI
        "created_at": str(row["created_at"]),
        "closed_at": str(row["closed_at"]) if row["closed_at"] else None,
        "completion_date": str(row["completion_date"]) if row["completion_date"] else None,
        "status": row["status"],
        "assigned_to_name": row["assigned_to_name"] or "Unassigned",
        "closed_by_name": row["closed_by_name"] or "—",
    }


@cases_bp.route("/closed/my", methods=["GET"])
@require_auth
def closed_my():
    """Cases the authenticated user actually closed (closed_by_user_id = them),
    regardless of who the case was assigned to. A Resource sees only their
    own closures; an Admin/Lead who closes a case also sees it here."""
    user = current_user()
    rows = db.fetch_all(
        f"""{CLOSED_CASE_FIELDS}
           FROM cases c
           LEFT JOIN users ua ON ua.user_id = c.assigned_to
           LEFT JOIN users ucl ON ucl.user_id = c.closed_by_user_id
           WHERE c.status = 'Completed' AND c.closed_by_user_id = %s
           ORDER BY c.closed_at DESC, c.case_id DESC""", (user["user_id"],))
    return jsonify({"closed": [_serialize_closed(r) for r in rows], "count": len(rows)})


@cases_bp.route("/closed/team", methods=["GET"])
@require_role("Admin", "Team Lead")
def closed_team():
    """Closed cases assigned to any Resource — the team's closures.
    Admin sees them too (org-wide is /closed/organization; this is the team
    view a Lead uses). Could be extended to a Lead's specific team if teams
    are modelled; today every Resource is in the org's pool."""
    rows = db.fetch_all(
        f"""{CLOSED_CASE_FIELDS}
           FROM cases c
           LEFT JOIN users ua ON ua.user_id = c.assigned_to
           LEFT JOIN users ucl ON ucl.user_id = c.closed_by_user_id
           WHERE c.status = 'Completed'
             AND c.assigned_to IS NOT NULL
             AND EXISTS (SELECT 1 FROM users u2
                          WHERE u2.user_id = c.assigned_to
                            AND u2.role = 'Resource')
           ORDER BY c.closed_at DESC, c.case_id DESC""")
    return jsonify({"closed": [_serialize_closed(r) for r in rows], "count": len(rows)})


@cases_bp.route("/closed/organization", methods=["GET"])
@require_role("Admin")
def closed_organization():
    """All closed cases across the organization. Admin-only."""
    rows = db.fetch_all(
        f"""{CLOSED_CASE_FIELDS}
           FROM cases c
           LEFT JOIN users ua ON ua.user_id = c.assigned_to
           LEFT JOIN users ucl ON ucl.user_id = c.closed_by_user_id
           WHERE c.status = 'Completed'
           ORDER BY c.closed_at DESC, c.case_id DESC""")
    return jsonify({"closed": [_serialize_closed(r) for r in rows], "count": len(rows)})
