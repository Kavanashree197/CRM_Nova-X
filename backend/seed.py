"""Populate the database with realistic sample data.

Run:  python seed.py

Creates:
  1 Admin, 1 Team Lead, 4 Resources
  18 cases (mix of New / Active / Pending / Completed / Reopened, some overdue)
  ~70 action records across those cases
  Reassignment history preserved in case_assignments.
"""
import os
import sys
from datetime import date, timedelta

# Allow running as a script from the backend/ folder
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import bcrypt
import config
import database as db


TODAY = date.today()


def hash_pw(pw):
    return bcrypt.hashpw(pw.encode(), bcrypt.gensalt(rounds=10)).decode()


def seed_users():
    users = [
        ("Arjun Mehta",     "admin@crm.io",   "admin123",   "Admin"),
        ("Priya Sharma",    "lead@crm.io",    "lead123",    "Team Lead"),
        ("Rahul Verma",     "rahul@crm.io",   "rahul123",   "Resource"),
        ("Sneha Iyer",      "sneha@crm.io",  "sneha123",   "Resource"),
        ("Vikram Nair",     "vikram@crm.io", "vikram123",  "Resource"),
        ("Anita Desai",     "anita@crm.io",   "anita123",   "Resource"),
    ]
    # Wipe first so re-seeding is idempotent
    db.execute("DELETE FROM case_actions")
    db.execute("DELETE FROM case_assignments")
    db.execute("DELETE FROM cases")
    db.execute("DELETE FROM users")

    ids = []
    for name, email, pw, role in users:
        uid, _ = db.execute(
            "INSERT INTO users (name, email, password_hash, role) VALUES (%s, %s, %s, %s)",
            (name, email, hash_pw(pw), role),
        )
        ids.append(uid)
    return {role: uid for role, uid in zip(
        ["Admin", "Team Lead", "Resource", "Resource", "Resource", "Resource"], ids)}


def seed_cases(uids):
    # Resources list (id, name)
    resources = [
        (uids["Resource"], "Rahul Verma",  "rahul@crm.io"),
        (uids["Resource"], "Sneha Iyer",   "sneha@crm.io"),  # placeholder keys below
    ]
    # Build explicit resource id list for assignments
    res_ids = [
        db.fetch_one("SELECT user_id FROM users WHERE email=%s", ("rahul@crm.io",))["user_id"],
        db.fetch_one("SELECT user_id FROM users WHERE email=%s", ("sneha@crm.io",))["user_id"],
        db.fetch_one("SELECT user_id FROM users WHERE email=%s", ("vikram@crm.io",))["user_id"],
        db.fetch_one("SELECT user_id FROM users WHERE email=%s", ("anita@crm.io",))["user_id"],
    ]
    admin_id   = uids["Admin"]
    lead_id    = uids["Team Lead"]

    categories = [
        "Billing", "Technical Support", "Account Access", "Onboarding",
        "Feature Request", "Bug Report", "Data Migration", "Compliance",
    ]

    # (title, category, priority, status, assigned_idx, days_due_offset,
    #  next_action_days, created_days_ago, description)
    plan = [
        ("Invoice not reflecting GST discount",        "Billing",          "High",     "Active",    0, -3, 1, 1,
         "Customer reports the GST line item on the Sept invoice is double-counted after the manual discount."),
        ("Cannot reset password - email never arrives","Account Access",   "Critical", "Active",    1, -1, 0, 2,
         "User triggered reset 4 times, no email received. Confirmed not in spam."),
        ("Slack integration webhook failing",         "Technical Support","High",     "Pending",   2,  2, 3, 3,
         "Webhook returns 403 after the workspace token was rotated."),
        ("Bulk import of 5k contacts throws timeout", "Data Migration",  "High",     "Active",    3, -5, 1, 4,
         "CSV upload via the admin console times out at 60s for files > 2k rows."),
        ("Request: dark mode for the reports page",   "Feature Request", "Low",      "New",       0,  7, 2, 0,
         "Customer success team asking if dark mode can be added to the reports module."),
        ("Duplicate charge on card ending 4421",       "Billing",         "Critical", "Active",    1, -2, 0, 1,
         "Card charged twice within 90 seconds during a checkout retry storm."),
        ("SSO login loops back to login page",        "Account Access",  "High",     "Pending",   2,  4, 5, 5,
         "SAML response looks valid but the session cookie is not being set on the redirect."),
        ("Onboarding checklist for Acme Corp",        "Onboarding",       "Medium",  "Active",    3,  5, 2, 2,
         "Provision workspace, seed demo data, schedule kickoff call."),
        ("Bug: date picker shows wrong weekday",      "Bug Report",       "Medium",  "Active",    0,  3, 2, 3,
         "Date picker is off by one weekday for users in UTC-5 after DST change."),
        ("GDPR data export request - ticket #4471",   "Compliance",       "High",    "Active",    1,  6, 1, 4,
         "Subject access request; 30-day window. Need to export profile, billing and activity logs."),
        ("Mobile app crashes on profile screen",      "Bug Report",       "Critical","Active",   2, -1, 0, 2,
         "Crash log points to nil pointer in avatar rendering. Affects iOS 17.4 only."),
        ("Upgrade plan from Pro to Enterprise",      "Billing",          "Medium",  "Pending",   3,  8, 4, 5,
         "Customer wants prorated upgrade; needs contract amendment sent for signature."),
        ("Cannot download quarterly PDF report",     "Technical Support","Medium",  "Active",    0,  1, 1, 3,
         "Export button spins forever; network tab shows a 502 from the report service."),
        ("Forgot security question answers",          "Account Access",   "Low",     "New",       1, 10, 3, 0,
         "User locked out of the secondary verification step; needs identity verification call."),
        ("Migrate 3 years of tickets from Zendesk",  "Data Migration",   "High",    "Active",    2,  9, 2, 6,
         "Scope: 18k tickets, attachments excluded. Target completion in 2 weeks."),
        ("Reported: automated email contains typo",  "Bug Report",       "Low",     "Completed", 3,  6, 0, 13,
         "Welcome email said 'acount' instead of 'account'. Fixed in template v2.3."),
        ("Renewal questions before Dec renewal",      "Billing",          "Medium",  "Completed", 0,  2, 0, 22,
         "Answered pricing questions; customer renewed for 12 months."),
        ("Old ticket: refund never received - reopen","Billing",          "High",    "Reopened",  1, -7, 1, 20,
         "Customer says the refund promised 2 weeks ago never hit their bank account."),
    ]

    case_ids = []
    for i, (title, cat, prio, status, res_idx, due_off, na_off, created_off, desc) in enumerate(plan, start=1):
        assigned_to = res_ids[res_idx]
        due_date    = (TODAY + timedelta(days=due_off)).isoformat()
        na_date     = (TODAY + timedelta(days=na_off)).isoformat()
        created_dt  = (TODAY - timedelta(days=created_off)).isoformat() + " 09:00:00"
        completion  = None
        resolution  = None
        if status == "Completed":
            # Completed ~6 days after creation -> positive avg completion time
            completion = (TODAY - timedelta(days=created_off - 6)).isoformat()
            resolution = ("Typo fixed in email template v2.3 and redeployed; "
                          "verified by sending a test welcome email.")
            if "Renewal" in title:
                resolution = ("Answered all renewal pricing questions over a call; "
                              "customer signed a 12-month renewal.")

        case_code = "CASE-%03d" % i
        cid, _ = db.execute(
            """INSERT INTO cases
               (case_code, title, category, description, priority, status,
                created_by, assigned_to, due_date, next_action_date, next_action,
                completion_date, resolution_note, created_at, updated_at)
               VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (case_code, title, cat, desc, prio, status,
             admin_id, assigned_to, due_date, na_date,
             "Follow up with customer and verify fix.",
             completion, resolution, created_dt, created_dt),
        )
        # Initial assignment record (timestamp matches case creation)
        db.execute(
            """INSERT INTO case_assignments (case_id, assigned_to, assigned_by, assigned_at, note)
               VALUES (%s,%s,%s,%s,%s)""",
            (cid, assigned_to, admin_id, created_dt, "Initial assignment at case creation"),
        )
        # Helper: insert an action with a specific timestamp so the activity
        # feed / weekly trend chart shows realistic spread instead of one spike.
        def add_action(user, atype, desc, prev, newv, at_dt):
            db.execute(
                """INSERT INTO case_actions
                   (case_id, user_id, action_type, description,
                    previous_value, new_value, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)""",
                (cid, user, atype, desc, prev, newv, at_dt))

        created_day = created_dt  # e.g. '2026-10-17 09:00:00'
        # Spread subsequent actions across the case's life
        add_action(admin_id, "case_created",
                   f"Case {case_code} created and assigned to {resources_name(assigned_to)}.",
                   None, status, created_day)
        if status in ("Active", "Pending", "Completed", "Reopened"):
            add_action(assigned_to, "status_changed",
                       f"Status changed from New to {status}.",
                       "New", status, created_day.replace("09:00", "11:30"))
        if status == "Completed" and completion:
            add_action(assigned_to, "comment_added",
                       "Reviewed root cause with the customer over a call.",
                       None, None, (TODAY - timedelta(days=created_off - 3)).isoformat() + " 14:00:00")
            add_action(assigned_to, "resolution_submitted",
                       "Resolution note submitted and case marked Completed.",
                       None, "Completed", completion + " 16:00:00")
        if status == "Reopened":
            add_action(assigned_to, "comment_added",
                       "Customer reports the refund never hit their account.",
                       None, None, (TODAY - timedelta(days=created_off - 3)).isoformat() + " 14:00:00")
            add_action(assigned_to, "case_reopened",
                       "Case reopened by resource; prior completion preserved.",
                       "Completed", "Reopened",
                       (TODAY - timedelta(days=2)).isoformat() + " 10:00:00")
        if status in ("Active", "Pending"):
            # Vary the comment text so the activity feed reads realistically.
            _comments = [
                "Reached out to customer for additional logs and a screen recording.",
                "Confirmed the issue reproduces in the staging environment.",
                "Escalated to the engineering on-call for a second opinion.",
                "Awaiting customer reply with the affected account ID.",
                "Pinged the customer success manager to coordinate a call.",
                "Reviewed the latest logs; no obvious error spike found yet.",
            ]
            add_action(assigned_to, "comment_added",
                       _comments[i % len(_comments)],
                       None, None,
                       (TODAY - timedelta(days=max(0, created_off - 1))).isoformat() + " 15:00:00")
        case_ids.append((cid, case_code, assigned_to, status, title))
    return case_ids


def resources_name(uid):
    row = db.fetch_one("SELECT name FROM users WHERE user_id=%s", (uid,))
    return row["name"] if row else "Unassigned"


def main():
    # For SQLite: start from a clean file so case codes begin at CASE-001 every run
    if config.DB_TYPE == "sqlite" and os.path.exists(config.SQLITE_PATH):
        os.remove(config.SQLITE_PATH)
    db.init_schema()
    print(f"[seed] Using {config.DB_TYPE} backend")
    uids = seed_users()
    print(f"[seed] inserted users: {uids}")
    cases = seed_cases(uids)
    print(f"[seed] inserted {len(cases)} cases with action history")
    print("[seed] done. Login -> admin@crm.io / admin123  (lead@crm.io / lead123, *_@crm.io / *123)")


if __name__ == "__main__":
    main()
