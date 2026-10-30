"""Lightweight token auth + role helpers.

Tokens are signed with itsdangerous (ships with Flask), so the frontend just
stores a string in localStorage and sends it as `Authorization: Bearer <token>`.
No external auth library needed - ideal for a student-readable POC.
"""
from functools import wraps
from flask import request, jsonify, g
from itsdangerous import URLSafeSerializer, BadSignature

import config
import database as db

_serializer = URLSafeSerializer(config.SECRET_KEY, salt="crm-auth")


def make_token(user_id, role):
    return _serializer.dumps({"uid": user_id, "role": role})


def read_token(token):
    try:
        return _serializer.loads(token)
    except BadSignature:
        return None


def current_user():
    """Return the user dict for the current request, or None."""
    if getattr(g, "user", None) is not None:
        return g.user
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        return None
    payload = read_token(auth[7:])
    if not payload:
        return None
    user = db.fetch_one("SELECT * FROM users WHERE user_id=%s", (payload["uid"],))
    if not user or not user["active"]:
        return None
    g.user = user
    return user


def require_auth(fn):
    @wraps(fn)
    def wrapper(*args, **kwargs):
        user = current_user()
        if not user:
            return jsonify({"error": "Authentication required"}), 401
        return fn(*args, **kwargs)
    return wrapper


def require_role(*roles):
    def decorator(fn):
        @wraps(fn)
        def wrapper(*args, **kwargs):
            user = current_user()
            if not user:
                return jsonify({"error": "Authentication required"}), 401
            if user["role"] not in roles:
                return jsonify({"error": "Forbidden: requires role %s" % ",".join(roles)}), 403
            return fn(*args, **kwargs)
        return wrapper
    return decorator


def public_user_dict(u):
    """Strip password_hash before sending to the frontend."""
    if u is None:
        return None
    return {
        "user_id": u["user_id"],
        "name": u["name"],
        "email": u["email"],
        "role": u["role"],
        "active": bool(u["active"]),
        "created_at": str(u["created_at"]),
    }
