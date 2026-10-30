"""Safe migration: add closed-case attribution + complexity columns.

Adds to the `cases` table:
  - closed_by_user_id  (FK -> users, NULL until the case is closed)
  - closed_at          (timestamp of closure)
  - complexity         (Low/Medium/High, or NULL = "Not assessed")

Adds to the `categories` table:
  - complexity          (baseline complexity per category)

This migration is IDEMPOTENT — it checks each column exists before adding.
It preserves all existing cases, actions, assignments, audit logs, users.
Run it on an existing database; on a fresh `seed.py` the columns are created
by schema_sqlite.sql so this migration is a no-op.

Run:  python migrate_closed_cases.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import config
import database as db


def _sqlite_columns(table):
    return {r["name"] for r in db.fetch_all(f"PRAGMA table_info({table})")}


def _add_column_if_missing_sqlite(table, col, ddl):
    cols = _sqlite_columns(table)
    if col in cols:
        print(f"  [skip] {table}.{col} already exists")
        return
    db.execute(f"ALTER TABLE {table} ADD COLUMN {ddl}")
    print(f"  [ok]   added {table}.{col}")


def _add_index_if_missing_sqlite(index_name, ddl):
    try:
        db.execute(f"CREATE INDEX IF NOT EXISTS {index_name} {ddl}")
        print(f"  [ok]   index {index_name}")
    except Exception as e:
        print(f"  [warn] index {index_name}: {e}")


def main():
    print(f"[migrate] backend: {config.DB_TYPE}")
    if config.DB_TYPE != "sqlite":
        # For MySQL the schema.sql already has the columns; running this
        # migration against MySQL is a no-op (the ALTER would need a different
        # syntax). Re-run `backend/schema.sql` on MySQL to create the columns.
        print("[migrate] MySQL: re-run `mysql -u root -p < backend/schema.sql`")
        print("[migrate]        (the schema.sql already contains the new columns).")
        return

    # Ensure the tables exist (no-op if they do)
    db.init_schema()

    print("[migrate] adding cases.closed_by_user_id / closed_at / complexity …")
    _add_column_if_missing_sqlite("cases", "closed_by_user_id",
                                  "closed_by_user_id INTEGER REFERENCES users(user_id)")
    _add_column_if_missing_sqlite("cases", "closed_at", "closed_at TEXT")
    _add_column_if_missing_sqlite("cases", "complexity",
                                  "complexity TEXT CHECK (complexity IS NULL OR complexity IN ('Low','Medium','High'))")
    _add_index_if_missing_sqlite("idx_cases_closed_by", "ON cases(closed_by_user_id)")
    _add_index_if_missing_sqlite("idx_cases_complexity", "ON cases(complexity)")

    print("[migrate] adding categories.complexity …")
    _add_column_if_missing_sqlite("categories", "complexity",
                                  "complexity TEXT CHECK (complexity IS NULL OR complexity IN ('Low','Medium','High'))")

    # Backfill: copy category.complexity (if set) onto existing Completed cases
    # so historical closures display a value. Cases with no category complexity
    # stay NULL -> dashboards show "Not assessed" (per the brief).
    print("[migrate] backfilling complexity onto existing Completed cases …")
    rows = db.fetch_all(
        """SELECT c.case_id, c.category, cat.complexity AS cat_complexity
           FROM cases c LEFT JOIN categories cat ON cat.name = c.category
           WHERE c.status = 'Completed'""")
    updated = 0
    for r in rows:
        if r["cat_complexity"] and not db.fetch_one(
                "SELECT complexity FROM cases WHERE case_id=%s", (r["case_id"],))["complexity"]:
            db.execute("UPDATE cases SET complexity=%s WHERE case_id=%s",
                       (r["cat_complexity"], r["case_id"]))
            updated += 1
    print(f"  [ok]   backfilled {updated} Completed case(s) with their category complexity")
    print("[migrate] done.")


if __name__ == "__main__":
    main()
