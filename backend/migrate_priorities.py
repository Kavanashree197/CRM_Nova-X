"""Safe migration: re-align existing case priorities to their category's
default_priority.

This is idempotent and non-destructive:
  - Only updates the `cases.priority` column.
  - Preserves every other column (title, status, dates, assignee, etc.).
  - Preserves all case_actions, case_assignments, case_status_history,
    audit_logs rows (they are never touched).
  - Does NOT delete any case.
  - Logs every change it makes to the audit trail so the migration itself
    is traceable.

Run:  python migrate_priorities.py
"""
import os
import sys
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import database as db


def main():
    # Ensure the default_priority column exists (it does on fresh schema; this
    # is a no-op guard for older databases created before the column was added).
    if db.config.DB_TYPE == "sqlite":
        cols = [r["name"] for r in db.fetch_all("PRAGMA table_info(categories)")]
    else:
        cols = [r["Field"] for r in db.fetch_all("SHOW COLUMNS FROM categories")]
    if "default_priority" not in cols:
        print("[migrate] categories.default_priority column missing — run `python seed.py` first.")
        return

    rows = db.fetch_all(
        """SELECT c.case_id, c.case_code, c.category, c.priority AS current_priority,
                  cat.default_priority
           FROM cases c
           LEFT JOIN categories cat ON cat.name = c.category""")
    updated = 0
    skipped = 0
    for r in rows:
        target = r["default_priority"] or "Medium"
        if r["current_priority"] != target:
            db.execute("UPDATE cases SET priority=%s WHERE case_id=%s",
                       (target, r["case_id"]))
            db.execute(
                """INSERT INTO audit_logs
                   (entity_type, entity_id, action, user_id, details, metadata_json)
                   VALUES ('case', %s, 'priority_auto_migrated', NULL,
                           %s, %s)""",
                (r["case_id"],
                 f"Priority auto-migrated from {r['current_priority']} to {target} (category={r['category']}) during migration.",
                 '{"from": "%s", "to": "%s", "reason": "migration"}' % (r["current_priority"], target)))
            updated += 1
            print(f"  [migrate] {r['case_code']}: {r['current_priority']} -> {target} (category={r['category']})")
        else:
            skipped += 1
    print(f"[migrate] done. updated={updated}, already-aligned={skipped}, total={len(rows)}.")


if __name__ == "__main__":
    main()
