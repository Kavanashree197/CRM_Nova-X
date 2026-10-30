"""JWT authentication + role helpers.

Real JWT (PyJWT) signed with HS256. Tokens carry `uid`, `role`, and an `exp`
claim (24h). Expired / invalid / missing tokens are rejected with 401.

Password hashing uses bcrypt. Password hashes are never sent to the client
(see public_user_dict). Role is read from the DB on every request — the
frontend cannot elevate itself by editing the token.
"""
from functools import wraps
from flask import request, jsonify, g
import jwt  # PyJWT
from datetime import datetime, timedelta, timezone

import config
import database as db


# HS256 secret + 24h token lifetime
_SECRET = config.SECRET_KEY
_TOKEN_TTL = timedelta(hours=24)


def make_token(user_id: int, role: str) -> str:
    """Issue a signed JWT containing uid, role, iat, exp."""
    now = datetime.now(timezone.utc)
    payload = {
        "uid": user_id,
        "role": role,
        "iat": int(now.timestamp()),
        "exp": int((now + _TOKEN_TTL).timestamp()),
    }
    return jwt.encode(payload, _SECRET, algorithm="HS256")


def read_token(token: str):
    """Verify signature + expiry. Returns {uid, role} or None."""
    try:
        payload = jwt.decode(token, _SECRET, algorithms=["HS256"])
    except jwt.ExpiredSignatureError:
        return None  # expired
    except jwt.InvalidTokenError:
        return None  # malformed / bad signature
    if "uid" not in payload or "role" not in payload:
        return None
    return {"uid": payload["uid"], "role": payload["role"]}


def current_user():
    """Resolve the authenticated user for this request, or None.

    The token only carries uid + role; the user record (including the
    *current* role) is always re-read from the DB so a frontend cannot
    elevate privileges by tampering with the token.
    """
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
            # Role is read from the DB, not the token, so it cannot be
            # spoofed by editing frontend data.
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
