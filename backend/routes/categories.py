"""Categories endpoints — lookup table for case categories (PS-02 Round 2)."""
from flask import Blueprint, request, jsonify
import database as db
from auth import require_auth, require_role

categories_bp = Blueprint("categories", __name__)


@categories_bp.route("", methods=["GET"])
@require_auth
def list_categories():
    rows = db.fetch_all("SELECT category_id, name, description FROM categories ORDER BY name")
    return jsonify({"categories": rows})


@categories_bp.route("", methods=["POST"])
@require_role("Admin")
def create_category():
    from flask import current_app
    data = request.get_json(force=True) or {}
    name = (data.get("name") or "").strip()
    desc = (data.get("description") or "").strip() or None
    if not name:
        return jsonify({"error": "Category name is required"}), 400
    if db.fetch_one("SELECT category_id FROM categories WHERE name=%s", (name,)):
        return jsonify({"error": "Category already exists"}), 409
    cid, _ = db.execute(
        "INSERT INTO categories (name, description) VALUES (%s, %s)", (name, desc))
    return jsonify({"category_id": cid, "name": name, "description": desc}), 201
