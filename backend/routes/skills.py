"""Skills catalog endpoints.

GET  /api/skills                 - list all skills (+ aliases)
POST /api/skills                 - create a skill (Admin only)
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
