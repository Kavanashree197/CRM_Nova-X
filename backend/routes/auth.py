"""Authentication + user-management routes.

User management: Admin can manage skills + active status of any user via
PUT /api/auth/users/<id>. Availability is SELF-SERVICE — each user updates
their own via PUT /api/auth/me/availability. Admin CANNOT change another
user's availability (enforced by rejecting `availability` in update_user).

Changing a Resource's availability to Unavailable triggers the automatic
assignment engine to re-home their active cases; Available retries any
Awaiting-Assignment cases.
"""
from flask import Blueprint, request, jsonify

import database as db
from auth import make_token, require_auth, require_role, current_user, public_user_dict
import bcrypt
import assignment
import audit
import skills as sk

auth_bp = Blueprint("auth", __name__)

VALID_AVAILABILITY = ["Available", "Busy", "Unavailable"]


def _user_skill_names(user_id):
    return [r["name"] for r in sk.user_skills(user_id)]


def _apply_availability_change(user_id, avail, actor_id):
    """Shared helper: persist an availability change + run the assignment
    engine side-effects (re-home Unavailable; retry Available). Used by both
    the self-service endpoint (actor = self) and is reusable if Admin ever
    needs a system-level override in the future (not exposed in the UI)."""
    target = db.fetch_one("SELECT name, role FROM users WHERE user_id=%s", (user_id,))
    if not target:
        return None
    db.execute("UPDATE users SET availability=%s WHERE user_id=%s", (avail, user_id))
    audit.log_audit("user", user_id, "availability_updated", actor_id,
                    f"Availability for {target['name']} set to {avail}.",
                    {"availability": avail})
    # Resource-specific side-effects on the assignment engine
    if avail == "Unavailable" and target["role"] == "Resource":
        moved = assignment.reassign_away_from(user_id)
        if moved:
            audit.log_audit("user", user_id, "auto_reassignment_run", actor_id,
                            f"Availability set to Unavailable — {moved} active case(s) "
                            f"re-queued for automatic reassignment.",
                            {"moved": moved})
    elif avail == "Available" and target["role"] == "Resource":
        awaiting = db.fetch_all(
            """SELECT case_id, category FROM cases
               WHERE assigned_to IS NULL AND assignment_status='Awaiting Assignment'""")
        re_count = 0
        for c in awaiting:
            if assignment.assign_case(c["case_id"], c["category"]):
                re_count += 1
        if re_count:
            audit.log_audit("user", user_id, "awaiting_retried", actor_id,
                            f"Employee became Available — {re_count} Awaiting-Assignment "
                            f"case(s) re-evaluated and assigned.",
                            {"reassigned": re_count})
    return avail


@auth_bp.route("/login", methods=["POST"])
def login():
    data = request.get_json(force=True) or {}
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""
    if not email or not password:
        return jsonify({"error": "Email and password are required"}), 400

    user = db.fetch_one("SELECT * FROM users WHERE email=%s", (email,))
    if not user or not user["active"]:
        return jsonify({"error": "Invalid credentials"}), 401

    if not bcrypt.checkpw(password.encode(), user["password_hash"].encode()):
        return jsonify({"error": "Invalid credentials"}), 401

    token = make_token(user["user_id"], user["role"])
    return jsonify({
        "token": token,
        "user": public_user_dict(user),
    })


@auth_bp.route("/me", methods=["GET"])
@require_auth
def me():
    """Current user's full profile (including availability + skills) for the
    self-service availability control on the dashboard."""
    u = current_user()
    return jsonify({"user": {
        **public_user_dict(u),
        "availability": u["availability"],
        "skills": _user_skill_names(u["user_id"]) if u["role"] == "Resource" else [],
    }})


@auth_bp.route("/me/availability", methods=["PUT"])
@require_auth
def update_my_availability():
    """Self-service: the authenticated user updates ONLY their own
    availability. The user_id is taken from the JWT — the request body
    cannot target another user."""
    me = current_user()
    data = request.get_json(force=True) or {}
    avail = (data.get("availability") or "").strip()
    if avail not in VALID_AVAILABILITY:
        return jsonify({"error": f"availability must be one of {VALID_AVAILABILITY}"}), 400
    _apply_availability_change(me["user_id"], avail, me["user_id"])
    updated = db.fetch_one(
        "SELECT user_id, name, email, role, availability FROM users WHERE user_id=%s",
        (me["user_id"],))
    return jsonify({"user": updated})


@auth_bp.route("/users", methods=["GET"])
@require_auth
def list_users():
    """Anyone logged in can see the user list with skills + availability
    (needed for Settings + dashboards). Password hashes are stripped.
    Skills come from the normalized user_skills junction table.
    Availability is shown read-only here — only the owner can change it."""
    rows = db.fetch_all(
        "SELECT user_id, name, email, role, active, availability "
        "FROM users ORDER BY name"
    )
    for r in rows:
        r["skills"] = _user_skill_names(r["user_id"])
    return jsonify({"users": rows})


@auth_bp.route("/users", methods=["POST"])
@require_role("Admin")
def create_user():
    data = request.get_json(force=True) or {}
    name  = (data.get("name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    role  = (data.get("role") or "Resource").strip()
    password = data.get("password") or ""
    if not name or not email or not password:
        return jsonify({"error": "name, email, password are required"}), 400
    if role not in ("Admin", "Team Lead", "Resource"):
        return jsonify({"error": "Invalid role"}), 400
    if db.fetch_one("SELECT user_id FROM users WHERE email=%s", (email,)):
        return jsonify({"error": "Email already registered"}), 409

    pw_hash = bcrypt.hashpw(password.encode(), bcrypt.gensalt(rounds=10)).decode()
    uid, _ = db.execute(
        "INSERT INTO users (name, email, password_hash, role, availability) "
        "VALUES (%s,%s,%s,%s,'Available')",
        (name, email, pw_hash, role),
    )
    # Optional initial skills (list of names) — resolved through the catalog
    if "skills" in data and isinstance(data["skills"], list):
        sk.set_user_skills(uid, data["skills"])
    user = db.fetch_one("SELECT * FROM users WHERE user_id=%s", (uid,))
    return jsonify({"user": public_user_dict(user)}), 201


# ---------------------------------------------------------------------------
# PUT /api/auth/users/<id>  (Admin only) — manage skills + active status.
# NOTE: availability changes are REJECTED here. Availability is self-service
# only (PUT /api/auth/me/availability). Admin sees availability read-only.
# ---------------------------------------------------------------------------
@auth_bp.route("/users/<int:user_id>", methods=["PUT"])
@require_role("Admin")
def update_user(user_id):
    me = current_user()
    data = request.get_json(force=True) or {}
    target = db.fetch_one("SELECT * FROM users WHERE user_id=%s", (user_id,))
    if not target:
        return jsonify({"error": "User not found"}), 404

    # Admin cannot change another user's availability — reject explicitly.
    if "availability" in data:
        audit.log_audit("user", user_id, "availability_change_rejected", me["user_id"],
                        f"Admin {me['name']} attempted to change {target['name']}'s "
                        f"availability — rejected (self-service only).",
                        {"attempted": data.get("availability")})
        return jsonify({"error": "Availability is self-service only. Each user updates "
                                 "their own availability via PUT /api/auth/me/availability."}), 403

    changes = []

    # Skills (list of names) — written to the normalized user_skills table.
    if "skills" in data:
        skill_names = data.get("skills")
        if skill_names is None:
            skill_names = []
        if not isinstance(skill_names, list):
            return jsonify({"error": "skills must be a list of strings"}), 400
        stored = sk.set_user_skills(user_id, skill_names)
        audit.log_audit("user", user_id, "skills_updated", me["user_id"],
                        f"Skills for {target['name']} updated to {stored or '(none)'}.",
                        {"skills": stored})
        changes.append("skills")

    # Active toggle (Admin can deactivate a user)
    if "active" in data:
        new_active = 1 if data.get("active") else 0
        db.execute("UPDATE users SET active=%s WHERE user_id=%s", (new_active, user_id))
        audit.log_audit("user", user_id, "active_toggled", me["user_id"],
                        f"{target['name']} {'activated' if new_active else 'deactivated'}.",
                        {"active": new_active})
        changes.append("active")

    updated = db.fetch_one(
        "SELECT user_id, name, email, role, active, availability FROM users WHERE user_id=%s",
        (user_id,))
    updated["skills"] = _user_skill_names(user_id)
    return jsonify({"user": updated, "changed": changes})
