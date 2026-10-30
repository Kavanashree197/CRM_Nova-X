"""Activity feed - the global, real-time action log.

GET /api/activities  -> most recent N actions across all cases (with filters).
GET /api/activities/since/<last_id> -> lightweight poll for new rows since last_id.
"""
from flask import Blueprint, request, jsonify

import database as db
from auth import require_auth, require_role, current_user

activities_bp = Blueprint("activities", __name__)


@activities_bp.route("", methods=["GET"])
@require_auth
def list_activities():
    user = current_user()
    limit  = min(int(request.args.get("limit", 50)), 500)
    offset = int(request.args.get("offset", 0))
    case_id = request.args.get("case_id")
    user_id = request.args.get("user_id")
    action_type = request.args.get("action_type")

    where = []
    params = []
    if case_id:
        where.append("ac.case_id = %s"); params.append(int(case_id))
    if user_id:
        where.append("ac.user_id = %s"); params.append(int(user_id))
    if action_type:
        where.append("ac.action_type = %s"); params.append(action_type)

    # Resources see only actions on cases they are assigned to
    if user["role"] == "Resource":
        where.append("ac.case_id IN (SELECT case_id FROM cases WHERE assigned_to = %s)")
        params.append(user["user_id"])

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    sql = f"""SELECT ac.action_id, ac.case_id, ac.user_id, ac.action_type,
                     ac.description, ac.previous_value, ac.new_value, ac.created_at,
                     u.name AS user_name,
                     c.case_code, c.title AS case_title
              FROM case_actions ac
              LEFT JOIN users u ON u.user_id = ac.user_id
              LEFT JOIN cases c ON c.case_id = ac.case_id
              {where_sql}
              ORDER BY ac.action_id DESC
              LIMIT %s OFFSET %s"""
    rows = db.fetch_all(sql, params + [limit, offset])
    return jsonify({"activities": rows, "count": len(rows)})


@activities_bp.route("/since/<int:last_id>", methods=["GET"])
@require_auth
def activities_since(last_id):
    """Lightweight poll endpoint for the auto-refresh mechanism.
    Returns actions with action_id > last_id, newest last."""
    user = current_user()
    where = ["ac.action_id > %s"]
    params = [last_id]
    if user["role"] == "Resource":
        where.append("ac.case_id IN (SELECT case_id FROM cases WHERE assigned_to = %s)")
        params.append(user["user_id"])
    sql = f"""SELECT ac.action_id, ac.case_id, ac.user_id, ac.action_type,
                     ac.description, ac.previous_value, ac.new_value, ac.created_at,
                     u.name AS user_name,
                     c.case_code, c.title AS case_title
              FROM case_actions ac
              LEFT JOIN users u ON u.user_id = ac.user_id
              LEFT JOIN cases c ON c.case_id = ac.case_id
              WHERE {' AND '.join(where)}
              ORDER BY ac.action_id ASC
              LIMIT 200"""
    rows = db.fetch_all(sql, params)
    return jsonify({"activities": rows, "latest_id": rows[-1]["action_id"] if rows else last_id})
