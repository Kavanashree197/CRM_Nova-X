"""Flask application factory + blueprint registration.

Run:  python app.py
"""
import sys
import os
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import database as db
from flask import Flask, jsonify
from flask_cors import CORS

from routes.auth import auth_bp
from routes.cases import cases_bp
from routes.activities import activities_bp
from routes.reports import reports_bp
from routes.dashboard import dashboard_bp
from routes.audit import audit_bp
from routes.categories import categories_bp
from routes.skills import skills_bp
from routes.issue_reports import issue_reports_bp


def create_app():
    app = Flask(__name__, static_folder=None)
    app.config["SECRET_KEY"] = config.SECRET_KEY
    CORS(app, supports_credentials=True)  # allow the Vite dev server to call us

    app.register_blueprint(auth_bp,       url_prefix="/api/auth")
    app.register_blueprint(cases_bp,      url_prefix="/api/cases")
    app.register_blueprint(activities_bp, url_prefix="/api/activities")
    app.register_blueprint(reports_bp,    url_prefix="/api/reports")
    app.register_blueprint(dashboard_bp,  url_prefix="/api/dashboard")
    app.register_blueprint(audit_bp,      url_prefix="/api/audit")
    app.register_blueprint(categories_bp, url_prefix="/api/categories")
    app.register_blueprint(skills_bp,     url_prefix="/api/skills")
    app.register_blueprint(issue_reports_bp, url_prefix="/api/issue-reports")

    @app.route("/api/health")
    def health():
        return jsonify({
            "status": "ok",
            "db": db.db_info(),
        })

    # ---- Optional: serve the built React frontend (production-style) ----
    # If ../frontend/dist exists, Flask serves the SPA so the whole app runs
    # from a single process (`python app.py`). The Vite dev server is still the
    # recommended dev workflow (see README).
    import os.path as _op
    _dist = _op.abspath(_op.join(_op.dirname(__file__), "..", "frontend", "dist"))
    if _op.isdir(_dist):
        from flask import send_from_directory

        @app.route("/", defaults={"path": ""})
        @app.route("/<path:path>")
        def spa(path):
            full = _op.join(_dist, path)
            if path and _op.isfile(full):
                return send_from_directory(_dist, path)
            return send_from_directory(_dist, "index.html")

    @app.errorhandler(404)
    def not_found(_):
        return jsonify({"error": "Not found"}), 404

    @app.errorhandler(500)
    def server_error(e):
        return jsonify({"error": "Internal server error", "detail": str(e)}), 500

    return app


if __name__ == "__main__":
    # Make sure the SQLite schema exists (no-op if already created)
    if config.DB_TYPE == "sqlite" and not os.path.exists(config.SQLITE_PATH):
        db.init_schema()
    app = create_app()
    # use_reloader=False so a single process stays alive when backgrounded
    app.run(host=config.FLASK_HOST, port=config.FLASK_PORT,
            debug=config.FLASK_DEBUG, use_reloader=False)
