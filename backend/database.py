"""Database access layer.

Supports two backends selected by config.DB_TYPE:
  * 'mysql'  -> PyMySQL (real MySQL/MariaDB server)
  * 'sqlite' -> sqlite3 (zero-setup local file)

Every query in the codebase is written with '%s' placeholders (MySQL style).
`q()` rewrites them to '?' when running on SQLite, so route code stays identical
on both backends.
"""
import os
from contextlib import contextmanager

import config


# ---------------------------------------------------------------------------
# Connection helpers
# ---------------------------------------------------------------------------
@contextmanager
def get_conn():
    """Yield a raw DB connection. Caller is responsible for commit/rollback."""
    if config.DB_TYPE == "mysql":
        import pymysql
        from pymysql.cursors import DictCursor
        conn = pymysql.connect(
            host=config.MYSQL_CONFIG["host"],
            port=config.MYSQL_CONFIG["port"],
            user=config.MYSQL_CONFIG["user"],
            password=config.MYSQL_CONFIG["password"],
            database=config.MYSQL_CONFIG["database"],
            charset=config.MYSQL_CONFIG["charset"],
            cursorclass=DictCursor,
            autocommit=False,
        )
    else:
        import sqlite3
        conn = sqlite3.connect(config.SQLITE_PATH)
        conn.row_factory = sqlite3.Row          # rows behave like dicts
        conn.execute("PRAGMA foreign_keys = ON")
        conn.execute("PRAGMA journal_mode = WAL")
    try:
        yield conn
    finally:
        conn.close()


def q(sql):
    """Translate '%s' placeholders to '?' for SQLite. MySQL keeps '%s'."""
    if config.DB_TYPE == "sqlite":
        return sql.replace("%s", "?")
    return sql


# ---------------------------------------------------------------------------
# Query helpers - always return plain Python dicts
# ---------------------------------------------------------------------------
def fetch_all(sql, params=None):
    with get_conn() as conn:
        cur = conn.execute(q(sql), params or [])
        rows = cur.fetchall()
        return [dict(r) for r in rows]


def fetch_one(sql, params=None):
    with get_conn() as conn:
        cur = conn.execute(q(sql), params or [])
        row = cur.fetchone()
        return dict(row) if row else None


def execute(sql, params=None):
    """Run a write query and return (lastrowid, rowcount)."""
    with get_conn() as conn:
        cur = conn.execute(q(sql), params or [])
        conn.commit()
        return cur.lastrowid, cur.rowcount


def execute_many(sql, seq_params):
    with get_conn() as conn:
        cur = conn.executemany(q(sql), seq_params)
        conn.commit()
        return cur.rowcount


# ---------------------------------------------------------------------------
# Schema + seed bootstrap (only used on first run)
# ---------------------------------------------------------------------------
def init_schema():
    """Create all tables. Idempotent."""
    here = os.path.dirname(__file__)
    if config.DB_TYPE == "sqlite":
        schema_file = os.path.join(here, "schema_sqlite.sql")
    else:
        # The MySQL schema creates the database + tables together.
        # Run it via the mysql client, not from Python. See README.
        raise RuntimeError("For MySQL, run `mysql -u root -p < schema.sql` first.")
    with open(schema_file, "r", encoding="utf-8") as f:
        script = f.read()
    with get_conn() as conn:
        conn.executescript(script)
        conn.commit()


def db_info():
    return {"type": config.DB_TYPE, "sqlite_path": config.SQLITE_PATH,
            "mysql": config.MYSQL_CONFIG}
