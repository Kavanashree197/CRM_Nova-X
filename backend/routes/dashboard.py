"""Dashboard summary endpoints - org-wide + team-specific."""
from flask import Blueprint, jsonify
from datetime import date, timedelta

import database as db
from auth import require_auth, require_role

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

    # ---- Closed-case analytics (PS-02 — closed-case visibility) ----
    # Closed = status 'Completed' (the project's case lifecycle uses Completed
    # as the closure state; Reopened cases are no longer closed).
    closed_by_complexity = {}
    for r in db.fetch_all(
            """SELECT COALESCE(complexity, 'Not assessed') AS complexity,
                      COUNT(*) AS c FROM cases
               WHERE status='Completed' GROUP BY complexity"""):
        closed_by_complexity[r["complexity"]] = r["c"]

    closed_by_priority = {}
    for r in db.fetch_all(
            """SELECT priority, COUNT(*) AS c FROM cases
               WHERE status='Completed' GROUP BY priority"""):
        closed_by_priority[r["priority"]] = r["c"]

    closed_by_employee = []
    for r in db.fetch_all(
            """SELECT ucl.name AS closed_by_name, COUNT(*) AS c
               FROM cases c
               LEFT JOIN users ucl ON ucl.user_id = c.closed_by_user_id
               WHERE c.status='Completed' AND c.closed_by_user_id IS NOT NULL
               GROUP BY c.closed_by_user_id ORDER BY c DESC"""):
        closed_by_employee.append({"closed_by_name": r["closed_by_name"], "count": r["c"]})

    # Closure trend: last 14 days, by day
    closure_trend = []
    for i in range(13, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        # SQLite stores closed_at as 'YYYY-MM-DD HH:MM:SS'; DATE() truncates.
        n = db.fetch_one(
            "SELECT COUNT(*) AS c FROM cases WHERE status='Completed' AND DATE(closed_at) = %s",
            (d,))["c"]
        closure_trend.append({"date": d, "closed": n})

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
            "closed_cases": completed,
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
        # Closed-case analytics (PS-02)
        "closed_analytics": {
            "total_closed": completed,
            "by_complexity": closed_by_complexity,
            "by_priority": closed_by_priority,
            "by_employee": closed_by_employee,
            "trend": closure_trend,
        },
    })


# ---------------------------------------------------------------------------
# GET /api/dashboard/team  (Team Lead + Admin)
# Returns team-specific dashboard data: employee workload table, cases
# requiring attention, follow-ups, team KPIs. All from real DB records.
# ---------------------------------------------------------------------------
@dashboard_bp.route("/team", methods=["GET"])
@require_role("Admin", "Team Lead")
def team_dashboard():
    today_iso = date.today().isoformat()
    today = date.today()

    # ---- Team KPIs (cases assigned to Resources = "the team") ----
    team_total    = db.fetch_one("SELECT COUNT(*) AS c FROM cases WHERE assigned_to IS NOT NULL")["c"]
    team_active   = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE assigned_to IS NOT NULL AND status IN ('New','Active','Pending','Reopened')")["c"]
    team_pending  = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE assigned_to IS NOT NULL AND status='Pending'")["c"]
    team_closed   = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE assigned_to IS NOT NULL AND status='Completed'")["c"]
    team_overdue  = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE assigned_to IS NOT NULL AND status<>'Completed' AND due_date IS NOT NULL AND due_date < %s",
        (today_iso,))["c"]
    team_due_today = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE assigned_to IS NOT NULL AND status<>'Completed' AND due_date = %s",
        (today_iso,))["c"]
    team_awaiting  = db.fetch_one(
        "SELECT COUNT(*) AS c FROM cases WHERE assignment_status='Awaiting Assignment'")["c"]

    # ---- Employee workload table (detailed per-Resource) ----
    employees = db.fetch_all(
        """SELECT u.user_id, u.name, u.availability,
                  SUM(CASE WHEN c.status IN ('New','Active','Pending','Reopened') THEN 1 ELSE 0 END) AS active_count,
                  SUM(CASE WHEN c.status='Completed' THEN 1 ELSE 0 END) AS closed_count,
                  SUM(CASE WHEN c.status<>'Completed' AND c.due_date IS NOT NULL AND c.due_date < %s THEN 1 ELSE 0 END) AS overdue_count,
                  SUM(CASE WHEN c.status<>'Completed' AND c.due_date = %s THEN 1 ELSE 0 END) AS due_today_count,
                  COUNT(c.case_id) AS total_count
           FROM users u
           LEFT JOIN cases c ON c.assigned_to = u.user_id
           WHERE u.role='Resource' AND u.active=1
           GROUP BY u.user_id, u.name, u.availability
           ORDER BY active_count DESC, overdue_count DESC""", (today_iso, today_iso))

    # ---- Cases requiring attention (awaiting + overdue + due-today) ----
    awaiting_cases = db.fetch_all(
        """SELECT case_id, case_code, title, category, priority, status, due_date
           FROM cases WHERE assignment_status='Awaiting Assignment'
           ORDER BY case_id DESC LIMIT 10""")
    overdue_cases = db.fetch_all(
        """SELECT case_id, case_code, title, category, priority, status, due_date,
                  assigned_to, ua.name AS assigned_to_name
           FROM cases LEFT JOIN users ua ON ua.user_id = cases.assigned_to
           WHERE status <> 'Completed' AND due_date IS NOT NULL AND due_date < %s
           ORDER BY due_date ASC LIMIT 15""", (today_iso,))
    for c in overdue_cases:
        try:
            dd = date.fromisoformat(c["due_date"])
            c["days_overdue"] = (today - dd).days
        except Exception:
            c["days_overdue"] = None

    due_today_cases = db.fetch_all(
        """SELECT case_id, case_code, title, category, priority, status,
                  assigned_to, ua.name AS assigned_to_name
           FROM cases LEFT JOIN users ua ON ua.user_id = cases.assigned_to
           WHERE status <> 'Completed' AND due_date = %s
           ORDER BY case_id DESC LIMIT 15""", (today_iso,))

    upcoming_cases = db.fetch_all(
        """SELECT case_id, case_code, title, category, priority, status, due_date,
                  assigned_to, ua.name AS assigned_to_name
           FROM cases LEFT JOIN users ua ON ua.user_id = cases.assigned_to
           WHERE status <> 'Completed' AND due_date > %s AND due_date <= %s
           ORDER BY due_date ASC LIMIT 15""",
        (today_iso, (today + timedelta(days=7)).isoformat()))

    recent_team_cases = db.fetch_all(
        """SELECT c.case_id, c.case_code, c.title, c.category, c.priority, c.status,
                  c.assigned_to, ua.name AS assigned_to_name, c.created_at
           FROM cases c LEFT JOIN users ua ON ua.user_id = c.assigned_to
           WHERE c.assigned_to IS NOT NULL
           ORDER BY c.case_id DESC LIMIT 10""")

    # ---- Team closed cases (with closer attribution + complexity) ----
    team_closed = db.fetch_all(
        """SELECT c.case_id, c.case_code, c.title, c.category, c.priority, c.complexity,
                  c.created_at, c.closed_at, c.status,
                  ua.name AS assigned_to_name, ucl.name AS closed_by_name
           FROM cases c
           LEFT JOIN users ua ON ua.user_id = c.assigned_to
           LEFT JOIN users ucl ON ucl.user_id = c.closed_by_user_id
           WHERE c.status = 'Completed' AND c.assigned_to IS NOT NULL
           ORDER BY c.closed_at DESC LIMIT 20""")

    # ---- Team productivity summary ----
    by_employee_closed = []
    for r in db.fetch_all(
            """SELECT ucl.name AS closed_by_name, COUNT(*) AS c
               FROM cases c LEFT JOIN users ucl ON ucl.user_id = c.closed_by_user_id
               WHERE c.status='Completed' AND c.closed_by_user_id IS NOT NULL
               GROUP BY c.closed_by_user_id ORDER BY c DESC"""):
        by_employee_closed.append({"closed_by_name": r["closed_by_name"], "count": r["c"]})

    by_complexity = {}
    for r in db.fetch_all(
            """SELECT COALESCE(complexity, 'Not assessed') AS complexity, COUNT(*) AS c
               FROM cases WHERE status='Completed' GROUP BY complexity"""):
        by_complexity[r["complexity"]] = r["c"]

    # Closure trend (14 days)
    trend = []
    for i in range(13, -1, -1):
        d = (date.today() - timedelta(days=i)).isoformat()
        n = db.fetch_one(
            "SELECT COUNT(*) AS c FROM cases WHERE status='Completed' AND DATE(closed_at) = %s",
            (d,))["c"]
        trend.append({"date": d, "closed": n})

    return jsonify({
        "kpis": {
            "team_total": team_total,
            "team_active": team_active,
            "team_pending": team_pending,
            "team_closed": team_closed,
            "team_overdue": team_overdue,
            "team_due_today": team_due_today,
            "team_awaiting": team_awaiting,
        },
        "employees": employees,
        "awaiting_cases": awaiting_cases,
        "overdue_cases": overdue_cases,
        "due_today_cases": due_today_cases,
        "upcoming_cases": upcoming_cases,
        "recent_team_cases": recent_team_cases,
        "team_closed": [{"case_id": r["case_id"], "case_code": r["case_code"],
                          "title": r["title"], "category": r["category"],
                          "priority": r["priority"], "complexity": r["complexity"],
                          "created_at": str(r["created_at"]),
                          "closed_at": str(r["closed_at"]) if r["closed_at"] else None,
                          "status": r["status"],
                          "assigned_to_name": r["assigned_to_name"] or "Unassigned",
                          "closed_by_name": r["closed_by_name"] or "—"}
                         for r in team_closed],
        "productivity": {
            "by_employee_closed": by_employee_closed,
            "by_complexity": by_complexity,
            "trend": trend,
        },
    })
