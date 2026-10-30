"""Dashboard summary endpoint - all KPIs and chart datasets in one call."""
from flask import Blueprint, jsonify
from datetime import date, timedelta

import database as db
from auth import require_auth

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.route("/summary", methods=["GET"])
@require_auth
def summary():
    today_iso = date.today().isoformat()

    # KPI counts
    total      = db.fetch_one("SELECT COUNT(*) AS c FROM cases")["c"]
    active     = db.fetch_one("SELECT COUNT(*) AS c FROM cases WHERE status IN ('New','Active','Pending','Reopened')")["c"]
    completed  = db.fetch_one("SELECT COUNT(*) AS c FROM cases WHERE status='Completed'")["c"]
    overdue    = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE status<>'Completed' AND due_date IS NOT NULL AND due_date < %s",
        (today_iso,))["c"]
    actions_total = db.fetch_one("SELECT COUNT(*) AS c FROM case_actions")["c"]

    # Status distribution
    status_rows = db.fetch_all(
        """SELECT status, COUNT(*) AS count FROM cases GROUP BY status""")
    status_dist = {row["status"]: row["count"] for row in status_rows}

    # Workload distribution by resource (active cases)
    workload = db.fetch_all(
        """SELECT u.user_id, u.name,
                  SUM(CASE WHEN c.status IN ('New','Active','Pending','Reopened') THEN 1 ELSE 0 END) AS active_count,
                  SUM(CASE WHEN c.status='Completed' THEN 1 ELSE 0 END) AS completed_count,
                  SUM(CASE WHEN c.status<>'Completed' AND c.due_date < %s THEN 1 ELSE 0 END) AS overdue_count,
                  COUNT(c.case_id) AS total_count
           FROM users u
           LEFT JOIN cases c ON c.assigned_to = u.user_id
           WHERE u.role='Resource' AND u.active=1
           GROUP BY u.user_id, u.name
           ORDER BY active_count DESC""",
        (today_iso,))

    # Daily created vs completed (last 14 days)
    days = 14
    daily = []
    for i in range(days - 1, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        day_created = db.fetch_one(
            "SELECT COUNT(*) AS c FROM cases WHERE DATE(created_at) = %s", (d,))["c"]
        day_completed = db.fetch_one(
            "SELECT COUNT(*) AS c FROM cases WHERE completion_date = %s", (d,))["c"]
        day_actions = db.fetch_one(
            "SELECT COUNT(*) AS c FROM case_actions WHERE DATE(created_at) = %s", (d,))["c"]
        daily.append({"date": d, "created": day_created, "completed": day_completed, "actions": day_actions})

    # Weekly productivity trend (actions per day, last 7 days)
    weekly = []
    for i in range(6, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        wk_actions = db.fetch_one(
            "SELECT COUNT(*) AS c FROM case_actions WHERE DATE(created_at) = %s", (d,))["c"]
        weekly.append({"date": d, "actions": wk_actions})

    # Recent activities (latest 12)
    recent = db.fetch_all(
        """SELECT ac.action_id, ac.case_id, ac.user_id, ac.action_type,
                  ac.description, ac.previous_value, ac.new_value, ac.created_at,
                  u.name AS user_name, c.case_code, c.title AS case_title
           FROM case_actions ac
           LEFT JOIN users u ON u.user_id = ac.user_id
           LEFT JOIN cases c ON c.case_id = ac.case_id
           ORDER BY ac.action_id DESC LIMIT 12""")

    # Priority cases (High / Critical, not completed)
    priority_cases = db.fetch_all(
        """SELECT case_id, case_code, title, priority, status, due_date,
                  assigned_to, ua.name AS assigned_to_name
           FROM cases
           LEFT JOIN users ua ON ua.user_id = cases.assigned_to
           WHERE priority IN ('High','Critical') AND status <> 'Completed'
           ORDER BY CASE priority WHEN 'Critical' THEN 0 WHEN 'High' THEN 1 END,
                    due_date ASC LIMIT 10""")

    # Overdue cases detail (days_overdue computed in Python for portability)
    overdue_cases = db.fetch_all(
        """SELECT case_id, case_code, title, status, due_date, assigned_to,
                  ua.name AS assigned_to_name
           FROM cases
           LEFT JOIN users ua ON ua.user_id = cases.assigned_to
           WHERE status <> 'Completed' AND due_date < %s
           ORDER BY due_date ASC LIMIT 15""",
        (today_iso,))
    today = date.today()
    for c in overdue_cases:
        try:
            dd = date.fromisoformat(c["due_date"])
            c["days_overdue"] = (today - dd).days
        except Exception:
            c["days_overdue"] = None

    # Upcoming due dates (next 7 days, not completed)
    upcoming = db.fetch_all(
        """SELECT case_id, case_code, title, status, due_date,
                  assigned_to, ua.name AS assigned_to_name
           FROM cases
           LEFT JOIN users ua ON ua.user_id = cases.assigned_to
           WHERE status <> 'Completed' AND due_date >= %s AND due_date <= %s
           ORDER BY due_date ASC LIMIT 15""",
        (today_iso, (date.today() + timedelta(days=7)).isoformat()))

    audit_total = db.fetch_one("SELECT COUNT(*) AS c FROM audit_logs")["c"]
    awaiting_assignment = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE assignment_status='Awaiting Assignment'")["c"]
    auto_assigned_total = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE assignment_status='Assigned'")["c"]
    available_employees = db.fetch_all(
        """SELECT user_id, name, skills FROM users
           WHERE role='Resource' AND active=1 AND availability='Available'
           ORDER BY name""")
    unavailable_employees = db.fetch_all(
        """SELECT user_id, name, availability FROM users
           WHERE role='Resource' AND active=1 AND availability<>'Available'
           ORDER BY name""")

    return jsonify({
        "kpis": {
            "total_cases": total,
            "active_cases": active,
            "completed_cases": completed,
            "overdue_cases": overdue,
            "total_actions": actions_total,
            "total_audit_entries": audit_total,
            "is_empty": total == 0,
            "awaiting_assignment": awaiting_assignment,
            "auto_assigned": auto_assigned_total,
        },
        "status_distribution": status_dist,
        "workload": workload,
        "available_employees": available_employees,
        "unavailable_employees": unavailable_employees,
        "daily": daily,
        "weekly": weekly,
        "recent_activities": recent,
        "priority_cases": priority_cases,
        "overdue_cases": overdue_cases,
        "upcoming_due": upcoming,
    })
