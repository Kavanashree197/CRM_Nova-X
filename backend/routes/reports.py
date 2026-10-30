"""Productivity & team performance reports.

These views never reduce a resource to "closure count alone": they also surface
workload, action history, overdue counts and average completion time, as the
project brief explicitly requires.
"""
from flask import Blueprint, request, jsonify
from datetime import date, timedelta

import database as db
from auth import require_auth, require_role, current_user

reports_bp = Blueprint("reports", __name__)


def _date_range():
    """Resolve (start, end) iso strings from query string or default to 30 days."""
    today = date.today()
    start = request.args.get("start_date") or (today - timedelta(days=30)).isoformat()
    end   = request.args.get("end_date")   or today.isoformat()
    return start, end


# ---------------------------------------------------------------------------
# GET /api/reports/productivity
# Individual productivity for one (or all) resource(s) within a date range.
# ---------------------------------------------------------------------------
@reports_bp.route("/productivity", methods=["GET"])
@require_auth
def productivity():
    user = current_user()
    start, end = _date_range()
    granularity = request.args.get("granularity", "daily")  # daily/weekly/monthly

    # Resources can only see their own productivity unless they're lead/admin
    target_user_id = request.args.get("user_id")
    if user["role"] == "Resource" and target_user_id and int(target_user_id) != user["user_id"]:
        return jsonify({"error": "Forbidden"}), 403
    if not target_user_id:
        target_user_id = user["user_id"]

    uid = int(target_user_id)
    target = db.fetch_one("SELECT user_id, name, email, role FROM users WHERE user_id=%s", (uid,))
    if not target:
        return jsonify({"error": "User not found"}), 404

    created_count = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE created_by=%s AND DATE(created_at) BETWEEN %s AND %s",
        (uid, start, end))["c"]
    assigned_count = db.fetch_one(
        """SELECT COUNT(*) AS c FROM case_assignments WHERE assigned_to=%s
           AND DATE(assigned_at) BETWEEN %s AND %s""", (uid, start, end))["c"]
    actioned_count = db.fetch_one(
        "SELECT COUNT(DISTINCT case_id) AS c FROM case_actions WHERE user_id=%s AND DATE(created_at) BETWEEN %s AND %s",
        (uid, start, end))["c"]
    actions_count = db.fetch_one(
        "SELECT COUNT(*) AS c FROM case_actions WHERE user_id=%s AND DATE(created_at) BETWEEN %s AND %s",
        (uid, start, end))["c"]
    completed_count = db.fetch_one(
        """SELECT COUNT(*) AS c FROM cases
           WHERE assigned_to=%s AND status='Completed'
           AND completion_date BETWEEN %s AND %s""", (uid, start, end))["c"]
    active_count = db.fetch_one(
        """SELECT COUNT(*) AS c FROM cases
           WHERE assigned_to=%s AND status IN ('New','Active','Pending','Reopened')""", (uid,))["c"]
    overdue_count = db.fetch_one(
        """SELECT COUNT(*) AS c FROM cases
           WHERE assigned_to=%s AND status<>'Completed'
           AND due_date IS NOT NULL AND due_date < %s""", (uid, date.today().isoformat()))["c"]

    # Average completion time (days) for cases completed in range.
    # Use DATE() on both sides so a case created at 13:45 and completed the
    # same day (date-only completion_date at midnight) counts as 0, not -0.6.
    if db.config.DB_TYPE == "sqlite":
        avg_row = db.fetch_one(
            """SELECT AVG(julianday(DATE(completion_date)) - julianday(DATE(created_at))) AS avg_days
               FROM cases WHERE assigned_to=%s AND status='Completed'
               AND completion_date BETWEEN %s AND %s""",
            (uid, start, end))
    else:
        avg_row = db.fetch_one(
            """SELECT AVG(DATEDIFF(DATE(completion_date), DATE(created_at))) AS avg_days
               FROM cases WHERE assigned_to=%s AND status='Completed'
               AND completion_date BETWEEN %s AND %s""",
            (uid, start, end))
    avg_completion_days = round(float(avg_row["avg_days"] or 0), 1)

    # Trend series within range (actions per day/week/month)
    if granularity == "weekly":
        series = db.fetch_all(
            """SELECT strftime('%Y-W%W', created_at) AS bucket, COUNT(*) AS actions
               FROM case_actions WHERE user_id=%s AND DATE(created_at) BETWEEN %s AND %s
               GROUP BY bucket ORDER BY bucket""", (uid, start, end))
    elif granularity == "monthly":
        series = db.fetch_all(
            """SELECT strftime('%Y-%m', created_at) AS bucket, COUNT(*) AS actions
               FROM case_actions WHERE user_id=%s AND DATE(created_at) BETWEEN %s AND %s
               GROUP BY bucket ORDER BY bucket""", (uid, start, end))
    else:
        series = db.fetch_all(
            """SELECT DATE(created_at) AS bucket, COUNT(*) AS actions
               FROM case_actions WHERE user_id=%s AND DATE(created_at) BETWEEN %s AND %s
               GROUP BY bucket ORDER BY bucket""", (uid, start, end))

    # Cases that contributed to the completed metric (click-through support)
    completed_cases = db.fetch_all(
        """SELECT case_id, case_code, title, status, priority, category,
                  due_date, completion_date, created_at
           FROM cases WHERE assigned_to=%s AND status='Completed'
           AND completion_date BETWEEN %s AND %s
           ORDER BY completion_date DESC""", (uid, start, end))

    # Cases contributing to actions count
    actioned_cases = db.fetch_all(
        """SELECT DISTINCT c.case_id, c.case_code, c.title, c.status,
                  c.priority, c.category, c.due_date
           FROM case_actions a JOIN cases c ON c.case_id = a.case_id
           WHERE a.user_id=%s AND DATE(a.created_at) BETWEEN %s AND %s
           ORDER BY c.case_id DESC""", (uid, start, end))

    return jsonify({
        "user": target,
        "range": {"start_date": start, "end_date": end, "granularity": granularity},
        "summary": {
            "cases_created": created_count,
            "cases_assigned": assigned_count,
            "cases_actioned": actioned_count,
            "cases_completed": completed_count,
            "active_cases": active_count,
            "overdue_cases": overdue_count,
            "total_actions": actions_count,
            "avg_completion_days": avg_completion_days,
        },
        "trend": [{"label": s["bucket"], "actions": s["actions"]} for s in series],
        "completed_cases": completed_cases,
        "actioned_cases": actioned_cases,
    })


# ---------------------------------------------------------------------------
# GET /api/reports/team
# Aggregated team performance with role-based scoping.
# ---------------------------------------------------------------------------
@reports_bp.route("/team", methods=["GET"])
@require_role("Admin", "Team Lead")
def team_report():
    start, end = _date_range()
    granularity = request.args.get("granularity", "daily")
    status = request.args.get("status")
    category = request.args.get("category")

    today_iso = date.today().isoformat()

    case_filter = ["DATE(c.created_at) BETWEEN %s AND %s"]
    params = [start, end]
    if status:
        case_filter.append("c.status = %s"); params.append(status)
    if category:
        case_filter.append("c.category = %s"); params.append(category)
    where_sql = "WHERE " + " AND ".join(case_filter)

    # Resource-wise productivity
    resources = db.fetch_all(
        f"""SELECT u.user_id, u.name,
               SUM(CASE WHEN c.created_by=u.user_id THEN 1 ELSE 0 END) AS cases_created,
               SUM(CASE WHEN c.assigned_to=u.user_id THEN 1 ELSE 0 END) AS cases_assigned,
               SUM(CASE WHEN c.assigned_to=u.user_id AND c.status='Completed' THEN 1 ELSE 0 END) AS cases_completed,
               SUM(CASE WHEN c.assigned_to=u.user_id AND c.status IN ('New','Active','Pending','Reopened') THEN 1 ELSE 0 END) AS active_count,
               SUM(CASE WHEN c.assigned_to=u.user_id AND c.status<>'Completed'
                        AND c.due_date IS NOT NULL AND c.due_date < %s THEN 1 ELSE 0 END) AS overdue_count
            FROM users u
            LEFT JOIN cases c ON (c.assigned_to=u.user_id OR c.created_by=u.user_id)
              AND DATE(c.created_at) BETWEEN %s AND %s
            WHERE u.role='Resource' AND u.active=1
            GROUP BY u.user_id, u.name
            ORDER BY cases_completed DESC, overdue_count DESC""",
        [today_iso, start, end])

    # Action counts per resource
    action_counts = db.fetch_all(
        """SELECT u.user_id, COUNT(a.action_id) AS total_actions
           FROM users u
           LEFT JOIN case_actions a ON a.user_id=u.user_id
             AND DATE(a.created_at) BETWEEN %s AND %s
           WHERE u.role='Resource' AND u.active=1
           GROUP BY u.user_id""", (start, end))
    amap = {r["user_id"]: r["total_actions"] for r in action_counts}
    for r in resources:
        r["total_actions"] = amap.get(r["user_id"], 0)

    # Daily/weekly/monthly team activity series
    if granularity == "weekly":
        series = db.fetch_all(
            """SELECT strftime('%Y-W%W', created_at) AS bucket, COUNT(*) AS actions
               FROM case_actions WHERE DATE(created_at) BETWEEN %s AND %s
               GROUP BY bucket ORDER BY bucket""", (start, end))
    elif granularity == "monthly":
        series = db.fetch_all(
            """SELECT strftime('%Y-%m', created_at) AS bucket, COUNT(*) AS actions
               FROM case_actions WHERE DATE(created_at) BETWEEN %s AND %s
               GROUP BY bucket ORDER BY bucket""", (start, end))
    else:
        series = db.fetch_all(
            """SELECT DATE(created_at) AS bucket, COUNT(*) AS actions
               FROM case_actions WHERE DATE(created_at) BETWEEN %s AND %s
               GROUP BY bucket ORDER BY bucket""", (start, end))

    # Status breakdown within range
    status_break = db.fetch_all(
        f"""SELECT c.status, COUNT(*) AS count FROM cases c {where_sql}
            GROUP BY c.status""", params)
    category_break = db.fetch_all(
        f"""SELECT c.category, COUNT(*) AS count FROM cases c {where_sql}
            GROUP BY c.category ORDER BY count DESC""", params)

    return jsonify({
        "range": {"start_date": start, "end_date": end, "granularity": granularity,
                  "status": status, "category": category},
        "resources": resources,
        "trend": [{"label": s["bucket"], "actions": s["actions"]} for s in series],
        "status_breakdown": {r["status"]: r["count"] for r in status_break},
        "category_breakdown": {r["category"]: r["count"] for r in category_break},
    })
