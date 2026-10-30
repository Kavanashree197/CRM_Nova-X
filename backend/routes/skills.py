"""Skills catalog endpoints.

GET  /api/skills                 - list all skills (+ aliases)
POST /api/skills                 - create a skill (Admin only)
GET  /api/skills/me               - the authenticated user's own skill profile
PUT  /api/skills/me               - add a skill to OWN profile (self-service)
DELETE /api/skills/me/<skill_name> - remove a skill from OWN profile
GET  /api/skills/users/<id>      - a user's skill profile (canonical names)
PUT  /api/skills/users/<id>      - replace a user's skill set (Admin only)
GET  /api/skills/categories/<cat> - required skills for a category
"""
from flask import Blueprint, request, jsonify
import database as db
from auth import require_auth, require_role, current_user
import skills as sk
import audit

skills_bp = Blueprint("skills", __name__)


@skills_bp.route("", methods=["GET"])
@require_auth
def list_skills():
    rows = sk.list_skills()
    return jsonify({"skills": rows})


@skills_bp.route("", methods=["POST"])
@require_role("Admin")
def create_skill():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    aliases = (data.get("aliases") or "").strip() or None
    if not name:
        return jsonify({"error": "Skill name is required"}), 400
    existing = sk.resolve_skill(name)
    if existing:
        return jsonify({"error": "Skill already exists (or is an alias of one)"}), 409
    sid = sk.get_or_create_skill(name, aliases)
    audit.log_audit("skill", sid, "skill_created", current_user()["user_id"],
                    f"Skill '{name}' created.", {"aliases": aliases})
    return jsonify({"skill_id": sid, "name": name, "aliases": aliases}), 201


# ---------------------------------------------------------------------------
# Self-service: the authenticated user manages ONLY their own skills.
# The user_id is taken from the JWT — the request body/URL cannot target
# another user. Available to any logged-in user; Admin/Team Lead simply
# have no assigned cases so they don't appear in the assignment engine.
# ---------------------------------------------------------------------------
@skills_bp.route("/me", methods=["GET"])
@require_auth
def my_skills():
    me = current_user()
    rows = sk.user_skills(me["user_id"])
    return jsonify({"user_id": me["user_id"], "skills": [r["name"] for r in rows]})


@skills_bp.route("/me", methods=["PUT"])
@require_auth
def add_my_skill():
    """Add a single skill to the authenticated user's OWN profile.
    The skill is resolved through the catalog (alias-aware); if it doesn't
    exist it is auto-created so employees can self-add brand-new skills.
    Audit-logged so the change is traceable."""
    me = current_user()
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    try:
        canonical, created_skill = sk.add_user_skill(me["user_id"], name)
    except ValueError as e:
        return jsonify({"error": str(e)}), 400
    audit.log_audit("user", me["user_id"], "skills_self_added", me["user_id"],
                    f"{me['name']} self-added skill '{canonical}'"
                    + (" (new skill created in catalog)." if created_skill else " (existing skill)."),
                    {"skill": canonical, "new_skill_created": created_skill})
    rows = sk.user_skills(me["user_id"])
    return jsonify({"user_id": me["user_id"],
                    "added": canonical,
                    "new_skill_created": created_skill,
                    "skills": [r["name"] for r in rows]})


@skills_bp.route("/me/<skill_name>", methods=["DELETE"])
@require_auth
def remove_my_skill(skill_name):
    """Remove a single skill from the authenticated user's OWN profile.
    Never deletes the skill from the catalog (other employees may have it)."""
    me = current_user()
    removed = sk.remove_user_skill(me["user_id"], skill_name)
    if removed is None:
        return jsonify({"error": "You don't have that skill"}), 404
    audit.log_audit("user", me["user_id"], "skills_self_removed", me["user_id"],
                    f"{me['name']} self-removed skill '{removed}'.",
                    {"skill": removed})
    rows = sk.user_skills(me["user_id"])
    return jsonify({"user_id": me["user_id"],
                    "removed": removed,
                    "skills": [r["name"] for r in rows]})


@skills_bp.route("/users/<int:user_id>", methods=["GET"])
@require_auth
def get_user_skills(user_id):
    rows = sk.user_skills(user_id)
    return jsonify({"user_id": user_id, "skills": [r["name"] for r in rows]})


@skills_bp.route("/users/<int:user_id>", methods=["PUT"])
@require_role("Admin")
def set_user_skills(user_id):
    data = request.get_json(force=True) or {}
    names = data.get("skills") or []
    if not isinstance(names, list):
        return jsonify({"error": "skills must be a list of strings"}), 400
    target = db.fetch_one("SELECT name, role FROM users WHERE user_id=%s", (user_id,))
    if not target:
        return jsonify({"error": "User not found"}), 404
    stored = sk.set_user_skills(user_id, names)
    audit.log_audit("user", user_id, "skills_updated", current_user()["user_id"],
                    f"Skills for {target['name']} updated to {stored or '(none)'}.",
                    {"skills": stored})
    return jsonify({"user_id": user_id, "skills": stored})


@skills_bp.route("/categories/<cat_name>", methods=["GET"])
@require_auth
def category_required(cat_name):
    return jsonify({"category": cat_name, "required_skills": sk.category_required_skills(cat_name)})
