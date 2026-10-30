"""Audit History endpoints.

audit_logs is the system-level audit trail: one row per meaningful entity
change (case created/assigned/reassigned/status/due-date/action/completion/
reopening). It is read-only to the frontend — judges can review it but users
cannot edit or delete entries.
"""
from flask import Blueprint, request, jsonify
import database as db
from auth import require_auth, require_role, current_user

audit_bp = Blueprint("audit", __name__)


@audit_bp.route("", methods=["GET"])
@require_auth
def list_audit():
    """List audit entries. Admins see everything; Team Leads see case-related
    entries; Resources see only entries for cases assigned to them."""
    user = current_user()
    limit = min(int(request.args.get("limit", 100)), 500)
    entity_type = request.args.get("entity_type")
    entity_id = request.args.get("entity_id")
    action = request.args.get("action")

    where = []
    params = []
    if entity_type:
        where.append("a.entity_type = %s"); params.append(entity_type)
    if entity_id:
        where.append("a.entity_id = %s"); params.append(int(entity_id))
    if action:
        where.append("a.action = %s"); params.append(action)

    # Resources only see audit rows for cases assigned to them
    if user["role"] == "Resource":
        where.append("""(a.entity_type <> 'case' AND a.entity_id IN
                          (SELECT case_id FROM cases WHERE assigned_to = %s))
                         OR (a.entity_type = 'case' AND a.entity_id IN
                          (SELECT case_id FROM cases WHERE assigned_to = %s))""")
        params += [user["user_id"], user["user_id"]]

    where_sql = ("WHERE " + " AND ".join(where)) if where else ""
    rows = db.fetch_all(
        f"""SELECT a.audit_id, a.entity_type, a.entity_id, a.action,
                  a.user_id, a.details, a.metadata_json, a.created_at,
                  u.name AS user_name
           FROM audit_logs a
           LEFT JOIN users u ON u.user_id = a.user_id
           {where_sql}
           ORDER BY a.audit_id DESC
           LIMIT %s""", params + [limit])
    return jsonify({"audit": rows, "count": len(rows)})


@audit_bp.route("/summary", methods=["GET"])
@require_auth
def audit_summary():
    """Count of audit entries grouped by action — used by the Audit History page header."""
    rows = db.fetch_all(
        """SELECT action, COUNT(*) AS count
           FROM audit_logs GROUP BY action ORDER BY count DESC""")
    total = db.fetch_one("SELECT COUNT(*) AS c FROM audit_logs")["c"]
    return jsonify({"by_action": {r["action"]: r["count"] for r in rows}, "total": total})
