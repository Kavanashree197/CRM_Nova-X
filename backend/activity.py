"""Helpers for writing immutable action-log records.

Every meaningful operation in the routes/ folder should call log_action().
The function is intentionally tiny: it writes a row into case_actions and
returns. It never updates, deletes or overwrites existing rows.
"""
import database as db


def log_action(case_id, user_id, action_type, description,
               previous_value=None, new_value=None):
    """Insert a single action row. Returns the new action_id."""
    aid, _ = db.execute(
        """INSERT INTO case_actions
           (case_id, user_id, action_type, description, previous_value, new_value)
           VALUES (%s,%s,%s,%s,%s,%s)""",
        (case_id, user_id, action_type, description,
         str(previous_value) if previous_value is not None else None,
         str(new_value) if new_value is not None else None),
    )
    return aid
