"""Audit-log helper.

audit_logs is a system-level audit trail of every meaningful entity change
(case created/assigned/reassigned/status/due-date/action/completion/reopening).
It is distinct from case_actions (the employee activity feed) and
case_status_history (the formal status transition log), giving judges three
complementary layers of traceability as the PS-02 brochure requires.
"""
import json
import database as db


def log_audit(entity_type, entity_id, action, user_id, details, metadata=None):
    """Insert a single audit row. metadata is serialised to JSON."""
    db.execute(
        """INSERT INTO audit_logs
           (entity_type, entity_id, action, user_id, details, metadata_json)
           VALUES (%s, %s, %s, %s, %s, %s)""",
        (entity_type, entity_id, action, user_id, details,
         json.dumps(metadata) if metadata else None),
    )


def log_status_history(case_id, from_status, to_status, changed_by, note=None):
    """Insert a row into the formal case_status_history table."""
    db.execute(
        """INSERT INTO case_status_history
           (case_id, from_status, to_status, changed_by, note)
           VALUES (%s, %s, %s, %s, %s)""",
        (case_id, from_status, to_status, changed_by, note),
    )
