"""Automatic case-assignment engine — Workload & Complexity Based.

No skill matching. The engine considers:
  1. Availability — only `Available` Resources (Admins/Leads never get cases)
  2. Current workload score — sum of complexity weights for each active case
  3. Projected workload — current + new case's complexity weight
  4. Tie-breakers: fewest active cases, then least-recently-assigned

Complexity weights: Low=1, Medium=2, High=3, NULL/unknown=2 (treated as
Medium so unassessed cases don't skew the distribution).

Returns a dict describing the decision (used both to perform the assignment
and to write a human-readable `assignment_reason`).
"""
import database as db


# Complexity → weight. NULL/unknown defaults to Medium (2).
COMPLEXITY_WEIGHTS = {"Low": 1, "Medium": 2, "High": 3}
DEFAULT_WEIGHT = 2  # when complexity is NULL or not recognised

ACTIVE_STATUSES = ("New", "Active", "Pending", "Reopened")


def _complexity_weight(complexity):
    """Return the numeric weight for a complexity level."""
    return COMPLEXITY_WEIGHTS.get(complexity, DEFAULT_WEIGHT)


def _active_workload_score(user_id):
    """Sum of complexity weights for the user's active (non-Completed) cases.
    Uses the case row's `complexity` column (copied from the category at
    closure time, or set on creation). Active cases that haven't been closed
    yet may have NULL complexity — those count as Medium (2)."""
    rows = db.fetch_all(
        """SELECT complexity FROM cases
           WHERE assigned_to = %s AND status NOT IN ('Completed')""",
        (user_id,))
    return sum(_complexity_weight(r["complexity"]) for r in rows)


def _active_case_count(user_id):
    """Number of active (non-Completed) cases assigned to this user."""
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


def pick_assignee(category, new_case_complexity=None):
    """Choose the best eligible Resource for a new case.

    Args:
        category: the case's category name (used to look up complexity if
                  new_case_complexity is not provided).
        new_case_complexity: the complexity of the new case (Low/Medium/High),
                  or None — in which case the category's complexity is used.

    Returns None when no Available Resource exists (case stays Awaiting
    Assignment). Otherwise returns a dict:
      { user_id, name, reason, method, workload_score, projected_score }
    """
    # Determine the new case's complexity weight.
    if new_case_complexity:
        new_weight = _complexity_weight(new_case_complexity)
    else:
        # Look up the category's baseline complexity from the DB.
        cat_row = db.fetch_one(
            "SELECT complexity FROM categories WHERE name=%s", (category,))
        new_weight = _complexity_weight(cat_row["complexity"]) if cat_row else DEFAULT_WEIGHT

    # 1. Candidate pool: active Resources who are Available.
    candidates = db.fetch_all(
        """SELECT user_id, name, availability
           FROM users
           WHERE role = 'Resource' AND active = 1""")

    # 2. Filter by availability — only Available.
    eligible = [c for c in candidates if c["availability"] == "Available"]

    if not eligible:
        return None  # Awaiting Assignment

    # 3. Calculate current workload score + projected score for each eligible.
    scored = []
    for c in eligible:
        current = _active_workload_score(c["user_id"])
        projected = current + new_weight
        scored.append({
            "user_id": c["user_id"],
            "name": c["name"],
            "current_score": current,
            "projected_score": projected,
            "active_cases": _active_case_count(c["user_id"]),
            "last_assigned": _last_assigned_at(c["user_id"]),
        })

    # 4. Select the Resource with the lowest projected workload score.
    min_projected = min(s["projected_score"] for s in scored)
    tied = [s for s in scored if s["projected_score"] == min_projected]

    if len(tied) == 1:
        chosen = tied[0]
    else:
        # Tie-breaker 1: fewest active cases
        min_cases = min(s["active_cases"] for s in tied)
        tied2 = [s for s in tied if s["active_cases"] == min_cases]

        if len(tied2) == 1:
            chosen = tied2[0]
        else:
            # Tie-breaker 2: least-recently-assigned (None beats any timestamp)
            def sort_key(s):
                return (0, "") if s["last_assigned"] is None else (1, s["last_assigned"])
            tied2.sort(key=sort_key)
            chosen = tied2[0]

    # Build a human-readable assignment reason.
    complexity_label = {1: "Low", 2: "Medium", 3: "High"}.get(new_weight, "Medium")
    reason = (
        f"Assigned to {chosen['name']} because they were Available and had "
        f"the lowest projected workload score ({chosen['projected_score']} = "
        f"current {chosen['current_score']} + new {complexity_label}={new_weight})."
        + (f" Tie broken by fewer active cases ({chosen['active_cases']})." if len(tied) > 1 else "")
        + (f" Then by least-recently-assigned." if len(tied) > 1 and len(tied2) > 1 else "")
    )

    return {
        "user_id": chosen["user_id"],
        "name": chosen["name"],
        "reason": reason,
        "method": "Workload and Complexity Based",
        "workload_score": chosen["current_score"],
        "projected_score": chosen["projected_score"],
    }


def assign_case(case_id, category, previous_assignee_id=None, complexity=None):
    """Run the engine and persist the assignment for a given case.

    Sets cases.assigned_to + cases.assignment_status, inserts a
    case_assignments row with method/reason/previous_assignee_id, and writes
    an audit_logs entry. Returns the chosen user_id or None.

    `previous_assignee_id` is set when this is an automatic reassignment
    (e.g. the previous assignee became Unavailable); the method becomes
    'Automatic Reassignment'.
    `complexity` overrides the category's baseline complexity for the new
    case's weight (used when the case row already has a complexity value).
    """
    decision = pick_assignee(category, new_case_complexity=complexity)
    method = "Automatic Reassignment" if previous_assignee_id else decision["method"] if decision else "Automatic"

    if decision is None:
        # Keep the case unassigned — Awaiting Assignment
        db.execute(
            "UPDATE cases SET assigned_to=NULL, assignment_status='Awaiting Assignment' WHERE case_id=%s",
            (case_id,))
        audit_details = (
            f"Case {case_id} (category={category}) — no Available Resource; "
            f"left Awaiting Assignment."
        )
        db.execute(
            """INSERT INTO audit_logs
               (entity_type, entity_id, action, user_id, details, metadata_json)
               VALUES ('case', %s, 'assignment_awaiting', NULL, %s, %s)""",
            (case_id, audit_details,
             '{"category": "%s", "reason": "no_available_resource"}' % category))
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
         '{"assigned_to": %d, "method": "%s", "workload_score": %d, "projected_score": %d}'
         % (uid, method, decision["workload_score"], decision["projected_score"])))
    return uid


def reassign_away_from(user_id):
    """When an employee becomes Unavailable, move their non-completed cases
    back through the engine. Preserves the previous assignment record.
    Returns the number of cases re-queued/reassigned."""
    cases = db.fetch_all(
        """SELECT case_id, category, complexity FROM cases
           WHERE assigned_to = %s AND status NOT IN ('Completed')""",
        (user_id,))
    moved = 0
    for c in cases:
        assign_case(c["case_id"], c["category"],
                    previous_assignee_id=user_id,
                    complexity=c["complexity"])
        moved += 1
    return moved
