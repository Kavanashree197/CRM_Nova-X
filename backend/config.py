"""Central configuration for the CRM backend.

DB_TYPE can be 'mysql' or 'sqlite'.
- 'mysql'  uses a real MySQL/MariaDB server (production / student setup).
- 'sqlite' uses a local file (zero-setup demo, falls back automatically).

Switch by setting environment variables, e.g.:
    DB_TYPE=mysql DB_HOST=localhost DB_USER=crm_user DB_PASSWORD=crm_pass DB_NAME=crm_db python app.py
or simply edit the defaults below.
"""
import os

# ---------------------------------------------------------------------------
# Database selection
# ---------------------------------------------------------------------------
DB_TYPE = os.environ.get("DB_TYPE", "sqlite").lower()  # 'mysql' or 'sqlite'

# MySQL connection (used only when DB_TYPE == 'mysql')
MYSQL_CONFIG = {
    "host": os.environ.get("DB_HOST", "localhost"),
    "port": int(os.environ.get("DB_PORT", "3306")),
    "user": os.environ.get("DB_USER", "crm_user"),
    "password": os.environ.get("DB_PASSWORD", "crm_pass"),
    "database": os.environ.get("DB_NAME", "crm_db"),
    "charset": "utf8mb4",
    "cursorclass": None,  # set in database.py (needs pymysql import)
}

# SQLite file (used only when DB_TYPE == 'sqlite')
SQLITE_PATH = os.environ.get("SQLITE_PATH", os.path.join(os.path.dirname(__file__), "crm.db"))

# ---------------------------------------------------------------------------
# Flask
# ---------------------------------------------------------------------------
FLASK_HOST = os.environ.get("FLASK_HOST", "0.0.0.0")
FLASK_PORT = int(os.environ.get("FLASK_PORT", "5000"))
FLASK_DEBUG = os.environ.get("FLASK_DEBUG", "1") == "1"
SECRET_KEY = os.environ.get("SECRET_KEY", "crm-poc-secret-change-me")
