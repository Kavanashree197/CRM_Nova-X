"""Intelligent automatic case-assignment engine.

Rule-based (no AI / no external services). Factors, in priority order:

  1. Skills match   — only Resources whose `skills` include the case category
  2. Availability    — only `Available` employees (Admins/Leads never get cases)
  3. Workload        — fewest active (non-Completed) assigned cases wins
  4. Round-robin     — tie broken by least-recently-assigned (oldest
                       case_assignments.assigned_at among the tied employees,
                       or never-assigned beats anyone)

For Critical/High priority cases the same rules apply — the skill match is
the gatekeeper, so an unqualified employee is never assigned a critical case.

Returns a dict describing the decision (used both to perform the assignment
and to write a human-readable `assignment_reason`).
"""
import database as db


ACTIVE_STATUSES = ("New", "Active", "Pending", "Reopened")


def _parse_skills(skills_csv):
    if not skills_csv:
        return set()
    return {s.strip() for s in skills_csv.split(",") if s.strip()}


def _active_workload(user_id):
    return db.fetch_one(
        """SELECT COUNT(*) AS c FROM cases
           WHERE assigned_to = %s AND status NOT IN ('Completed')""",
        (user_id,))["c"]


def _last_assigned_at(user_id):
    """Timestamp of the most recent assignment to this user, or NULL."""
    row = db.fetch_one(
        """SELECT MAX(assigned_at) AS last FROM case_assignments
           WHERE assigned_to = %s""",
        (user_id,))
    return row["last"] if row else None


def pick_assignee(category):
    """Choose the best eligible employee for a case of the given category.

    Returns None when no eligible employee is available (case stays
    'Awaiting Assignment'). Otherwise returns a dict:
      { user_id, name, reason, method }
    """
    # 1. Candidate pool: active Resources only (Admins/Leads never get cases)
    candidates = db.fetch_all(
        """SELECT user_id, name, skills, availability
           FROM users
           WHERE role = 'Resource' AND active = 1""")

    # 2. Skills match + availability
    eligible = []
    for c in candidates:
        skills = _parse_skills(c["skills"])
        if category not in skills:
            continue
        if c["availability"] != "Available":
            continue
        eligible.append(c)

    if not eligible:
        return None  # Awaiting Assignment

    # 3. Workload — fewest active cases
    weighted = []
    for c in eligible:
        weighted.append({
            "user_id": c["user_id"],
            "name": c["name"],
            "workload": _active_workload(c["user_id"]),
            "last_assigned": _last_assigned_at(c["user_id"]),
        })

    min_wl = min(w["workload"] for w in weighted)
    tied = [w for w in weighted if w["workload"] == min_wl]

    # 4. Round-robin — least-recently-assigned (None beats any timestamp)
    def sort_key(w):
        # (0, ...) for never-assigned sorts first; (1, timestamp) after
        return (0, "") if w["last_assigned"] is None else (1, w["last_assigned"])

    tied.sort(key=sort_key)
    chosen = tied[0]

    reason = (
        f"Automatically assigned to {chosen['name']} — matches '{category}' skills, "
        f"Available, lowest eligible active workload ({chosen['workload']} active case"
        f"{'s' if chosen['workload'] != 1 else ''})"
        + (", least-recently-assigned (round-robin)." if len(tied) > 1 else ".")
    )
    return {
        "user_id": chosen["user_id"],
        "name": chosen["name"],
        "reason": reason,
        "method": "Automatic",
    }


def assign_case(case_id, category, previous_assignee_id=None):
    """Run the engine and persist the assignment for a given case.

    Sets cases.assigned_to + cases.assignment_status, inserts a
    case_assignments row with method/reason/previous_assignee_id, and writes
    an audit_logs entry. Returns the chosen user_id or None.

    `previous_assignee_id` is set when this is an automatic reassignment
    (e.g. the previous assignee became Unavailable); the method becomes
    'Automatic Reassignment'.
    """
    decision = pick_assignee(category)
    method = "Automatic Reassignment" if previous_assignee_id else "Automatic"

    if decision is None:
        # Keep the case unassigned — Awaiting Assignment
        db.execute(
            "UPDATE cases SET assigned_to=NULL, assignment_status='Awaiting Assignment' WHERE case_id=%s",
            (case_id,))
        audit_details = (
            f"Case {case_id} (category={category}) — no eligible Available employee "
            f"with matching skills; left Awaiting Assignment."
        )
        db.execute(
            """INSERT INTO audit_logs
               (entity_type, entity_id, action, user_id, details, metadata_json)
               VALUES ('case', %s, 'assignment_awaiting', NULL, %s, %s)""",
            (case_id, audit_details,
             '{"category": "%s", "reason": "no_eligible_employee"}' % category))
        return None

    uid = decision["user_id"]
    db.execute(
        """UPDATE cases
           SET assigned_to=%s, assignment_status='Assigned' WHERE case_id=%s""",
        (uid, case_id))

    prev_note = ""
    if previous_assignee_id:
        prev_name = db.fetch_one(
            "SELECT name FROM users WHERE user_id=%s", (previous_assignee_id,))
        prev_note = f" (previous assignee: {prev_name['name']})" if prev_name else ""

    db.execute(
        """INSERT INTO case_assignments
           (case_id, assigned_to, assigned_by, note,
            assignment_method, assignment_reason, previous_assignee_id)
           VALUES (%s, %s, NULL, %s, %s, %s, %s)""",
        (case_id, uid,
         f"Automatic assignment{prev_note}",
         method, decision["reason"],
         previous_assignee_id))

    db.execute(
        """INSERT INTO audit_logs
           (entity_type, entity_id, action, user_id, details, metadata_json)
           VALUES ('case', %s, %s, NULL, %s, %s)""",
        (case_id,
         "case_auto_assigned" if not previous_assignee_id else "case_auto_reassigned",
         decision["reason"] + prev_note,
         '{"assigned_to": %d, "method": "%s"}' % (uid, method)))
    return uid


def reassign_away_from(user_id):
    """When an employee becomes Unavailable, move their non-completed cases
    back through the engine. Preserves the previous assignment record.
    Returns the number of cases re-queued/reassigned."""
    cases = db.fetch_all(
        """SELECT case_id, category FROM cases
           WHERE assigned_to = %s AND status NOT IN ('Completed')""",
        (user_id,))
    moved = 0
    for c in cases:
        assign_case(c["case_id"], c["category"], previous_assignee_id=user_id)
        moved += 1
    return moved
