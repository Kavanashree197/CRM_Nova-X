"""Categories endpoints — lookup table for case categories (PS-02 Round 2).

The `default_priority` column is the source of truth for category-based
automatic priority assignment. The frontend reads it to display the
auto-calculated priority in the Create Case form; the backend reads it on
case create/update to set the priority (the client cannot set priority).
"""
from flask import Blueprint, request, jsonify
import database as db
from auth import require_auth, require_role

categories_bp = Blueprint("categories", __name__)

VALID_PRIORITIES = ["Low", "Medium", "High", "Critical"]


@categories_bp.route("", methods=["GET"])
@require_auth
def list_categories():
    rows = db.fetch_all(
        "SELECT category_id, name, default_priority, description FROM categories ORDER BY name")
    return jsonify({"categories": rows})


@categories_bp.route("", methods=["POST"])
@require_role("Admin")
def create_category():
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    desc = (data.get("description") or "").strip() or None
    default_priority = (data.get("default_priority") or "Medium").strip()
    if not name:
        return jsonify({"error": "Category name is required"}), 400
    if default_priority not in VALID_PRIORITIES:
        return jsonify({"error": "Invalid default_priority"}), 400
    if db.fetch_one("SELECT category_id FROM categories WHERE name=%s", (name,)):
        return jsonify({"error": "Category already exists"}), 409
    cid, _ = db.execute(
        "INSERT INTO categories (name, default_priority, description) VALUES (%s, %s, %s)",
        (name, default_priority, desc))
    return jsonify({"category_id": cid, "name": name, "default_priority": default_priority, "description": desc}), 201
