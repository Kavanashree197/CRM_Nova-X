"""Authentication routes: login, whoami, users list (admin only)."""
from flask import Blueprint, request, jsonify

import database as db
from auth import make_token, require_auth, require_role, current_user, public_user_dict
import bcrypt

auth_bp = Blueprint("auth", __name__)


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
    return jsonify({"user": public_user_dict(current_user())})


@auth_bp.route("/users", methods=["GET"])
@require_auth
def list_users():
    """Anyone logged in can see the resource list (needed for the assignee
    dropdown). We strip password hashes either way."""
    rows = db.fetch_all(
        "SELECT user_id, name, email, role, active FROM users ORDER BY name"
    )
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
        "INSERT INTO users (name, email, password_hash, role) VALUES (%s,%s,%s,%s)",
        (name, email, pw_hash, role),
    )
    user = db.fetch_one("SELECT * FROM users WHERE user_id=%s", (uid,))
    return jsonify({"user": public_user_dict(user)}), 201
