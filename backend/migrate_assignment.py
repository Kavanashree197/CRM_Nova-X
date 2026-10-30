"""Safe, idempotent migration to add automatic-assignment columns.

Adds:
  users.skills             TEXT (comma-separated category names)
  users.availability        TEXT ('Available' | 'Busy' | 'Unavailable')
  cases.assignment_status   TEXT ('Assigned' | 'Awaiting Assignment')
  case_assignments.assignment_method  TEXT ('Automatic' | 'Automatic Reassignment')
  case_assignments.assignment_reason  TEXT (human-readable)
  case_assignments.previous_assignee_id INTEGER NULL

Preserves every existing row, column, action, assignment, status history,
audit log and user record. Re-running is a no-op.

Run:  python migrate_assignment.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import database as db


def col_exists(table, col):
    if db.config.DB_TYPE == "sqlite":
        rows = db.fetch_all(f"PRAGMA table_info({table})")
        return any(r["name"] == col for r in rows)
    # MySQL
    rows = db.fetch_all(f"SHOW COLUMNS FROM {table}")
    return any(r["Field"] == col for r in rows)


def add_col(table, col, ddl):
    if col_exists(table, col):
        print(f"  [skip] {table}.{col} already exists")
        return
    db.execute(f"ALTER TABLE {table} ADD COLUMN {col} {ddl}")
    print(f"  [add]  {table}.{col}")


def main():
    print("[migrate] automatic-assignment columns")
    add_col("users", "skills", "TEXT")
    add_col("users", "availability", "TEXT DEFAULT 'Available'")
    add_col("cases", "assignment_status", "TEXT DEFAULT 'Awaiting Assignment'")
    add_col("case_assignments", "assignment_method", "TEXT")
    add_col("case_assignments", "assignment_reason", "TEXT")
    add_col("case_assignments", "previous_assignee_id", "INTEGER")

    # Backfill: any existing assigned case becomes 'Assigned'; unassigned stays 'Awaiting Assignment'
    db.execute("UPDATE cases SET assignment_status='Assigned' WHERE assigned_to IS NOT NULL AND assignment_status IS NULL")
    db.execute("UPDATE cases SET assignment_status='Awaiting Assignment' WHERE assigned_to IS NULL AND assignment_status IS NULL")
    # Backfill: existing assignment rows are tagged as 'Automatic' (system-managed)
    db.execute("UPDATE case_assignments SET assignment_method='Automatic' WHERE assignment_method IS NULL")
    print("[migrate] backfill complete")
    print("[migrate] done.")


if __name__ == "__main__":
    main()
