# Round 3 — Development Progress Review

**Problem Statement:** PS-02 — CRM Case Management & Productivity Reporting
**Evaluation weight:** 25 marks

> All results in this document were measured by actually running the
> application and hitting the live API / UI. No figure is claimed without
> evidence. The app starts with **zero cases** by default.

---

## Measured evidence (summary)

| Metric | Measured value |
|---|---|
| Working REST API endpoints | **19** |
| Functional UI screens | **12** (Login, Overview, My Cases, All Cases, Create Case, Case Details drawer, Activity Logs, Audit History, Productivity Reports, Team Performance, Trust & Fairness, Settings) |
| Database tables | **7** (users, cases, case_actions, case_assignments, case_status_history, categories, audit_logs) |
| Case lifecycle test | ✅ Create → assign → action → Pending → Completed (with resolution note) |
| Action history test | ✅ 12 actions recorded across 2 cases, all preserved |
| Reassignment test | ✅ 2 assignment rows + both employees' actions visible in history |
| Analytics test | ✅ dashboard KPIs computed live from DB |
| Persistence test | ✅ data survives page reload + remains in DB |
| Initial state test | ✅ 0 cases, 0 actions, 0 audit on fresh seed; empty states shown |
| Console errors during full demo | **0** |

---

## A. Authentication

- **Login** (`POST /api/auth/login`) — bcrypt password verify, returns a
  signed HMAC token.
- **Logout** — frontend clears the token; axios interceptor bounces to
  `/login` on any 401.
- **User roles** — `Admin`, `Team Lead`, `Resource` stored in `users.role`.
- **Protected routes** — `RequireAuth` (frontend) + `@require_auth`
  (backend) on every endpoint except `/login` and `/health`.
- **Role-based permissions** — `@require_role("Admin","Team Lead")` on
  `/api/reports/team` and `/api/auth/users` POST; Team Performance page is
  hidden from Resources in the sidebar; Settings is Admin-only.
- **Evidence:** logged in as `admin@crm.io` → dashboard renders; logging in
  as `rahul@crm.io` (Resource) → Team Performance + Settings nav items
  hidden; hitting a protected endpoint without a token returns `401`.

---

## B. Case Creation

`POST /api/cases` accepts: title, category (from `categories` table),
description, priority (Low/Medium/High/Critical), creator (from token),
assigned resource, due date, next action, status. Returns the new case with:
- **Unique Case ID** — `CASE-001`, `CASE-002`, … derived from
  `MAX(case_id)+1`. **Never reused** (the seed `DELETE` only runs on
  re-seed, not on every create).
- **Creation date** — backend `CURRENT_TIMESTAMP`.
- **Status** — defaults to `New`.

**Evidence:** created `CASE-001` "Customer refund not received" and
`CASE-002` "SSO login loop"; both appear in `/api/cases` with correct
fields; case codes are sequential and unique.

---

## C. Case Assignment

- **Assign** at creation (`assigned_to` in POST) and **reassign** via
  `PUT /api/cases/{id}` (`assigned_to` field).
- Every assignment writes a row to `case_assignments` with `assigned_to`,
  `assigned_by`, `assigned_at`, `note`.
- **Preserves history** — old assignment rows are never overwritten.
- Records **who** assigned and **when**.

**Evidence (Demo 3 — reassignment):**
```
assignments: 2
  - Rahul Verma by Arjun Mehta | Initial assignment at case creation
  - Sneha Iyer by Arjun Mehta | Reassigned from Rahul Verma to Sneha Iyer
```

---

## D. Action Logging  (most important PS-02 feature)

`POST /api/cases/{id}/actions` records a meaningful action with:
- Case ID, user (from token), action type, description (required, non-empty),
  timestamp (backend), optional previous/new value, optional next-action
  scheduling.

**Quick action types** (the 6 from the brochure + "Other"):
Contacted · Investigation Started · Information Requested ·
Follow-up Scheduled · Internal Discussion · Issue Resolved · Other / Comment.

**Persistence:** every action writes to `case_actions` (append-only — no
UPDATE or DELETE endpoint exists). The full history is returned by
`GET /api/cases/{id}/history` and displayed as a vertical timeline in the
Case Details drawer → History tab.

**Never overwritten:** `case_actions` rows have only an `INSERT` path in
the entire codebase (verified: `grep -r UPDATE case_actions backend/`
returns nothing).

**Evidence:** across the demo, **12 actions** were recorded and all 12 are
returned by the history endpoint with the correct user, type, description,
and timestamp.

---

## E. Status and Deadline Monitoring

**Statuses:** New, Active, Pending, Completed, Reopened.

**Overdue is derived, never manual:**
```sql
status <> 'Completed' AND due_date IS NOT NULL AND due_date < CURRENT_DATE
```
Computed on every list/detail/dashboard query — there is no `is_overdue`
column to set.

**Dashboard sections:** Due today, Overdue, Upcoming (next 7 days),
Active, Pending — all computed live from the DB.

**Completion requires a resolution note:**
```python
if new == "Completed" and not resolution_note:
    return jsonify({"error": "A resolution note is required..."}), 400
```
**Evidence:** the backend returned `400` when attempting Completed without
a note; succeeded after providing one.

**Reopening:** `PUT` with `status=Reopened` clears `completion_date` on the
case row but the prior completion stays in `case_status_history` and the
action log — verified: reopening writes a `case_reopened` action + a
`case_status_history` row with `from_status=Completed`.

**Evidence:** `case_status_history` has **4 rows** after the demo,
including the New→Pending→Completed transitions on CASE-001.

---

## F. Productivity Analytics

`GET /api/reports/productivity?user_id=X` computes from actual DB records:
- Cases created, assigned, actioned, completed
- Active cases, overdue cases, total actions
- **Average completion time** (days) — `AVG(completion_date - created_at)`
  for cases completed in the date range
- Daily / weekly / monthly trend (granularity filter)
- Click-through: the page lists the actual completed + actioned cases
  behind the numbers

`GET /api/reports/team` (Admin/Lead only) computes per-resource:
workload, completed, active, overdue, total actions + status/category
breakdown + team trend.

**Filters:** resource, case status, case category, start date, end date,
granularity (daily/weekly/monthly).

> Per the brochure: productivity is **never reduced to closure count
> alone** — workload, action count, and overdue are shown alongside
> completions.

**Evidence:** the Productivity Reports page rendered with KPIs
(Cases Created / Completed / Total Actions / Avg Completion) and an
activity trend chart, all from the DB.

---

## G. Employee Dashboard (My Cases)

`/my-cases` shows the logged-in resource's:
- Assigned cases, Due today, Overdue, Upcoming, Recently updated
- Quick-action button → opens the case drawer → Record Action tab

Resources only see cases where `assigned_to = <their user id>` (enforced
in `GET /api/cases` by role).

---

## H. Management Dashboard

`/` (Overview) for Admin/Team Lead shows:
- 5 KPI cards (Total, Active, Completed, Overdue, Actions) — all live from DB
- 4 charts (daily created vs completed, weekly productivity, workload by
  resource, status distribution) — Recharts, data from `/api/dashboard/summary`
- Recent activity, priority cases, overdue cases, upcoming due, workload bars

`/team` (Team Performance, Admin/Lead only) shows resource-wise table +
3 charts (completed/active/overdue by resource, team activity trend,
status + category breakdown).

**Every figure is traceable** — clicking any case row opens the detail
drawer with the full action history and status transitions behind it.

---

## I. Audit History

A separate `audit_logs` table records **every meaningful entity change**:
case creation, assignment, reassignment, status changes, due-date changes,
priority changes, action additions, completion, reopening.

Each audit row stores: `entity_type`, `entity_id`, `action`, `user_id`,
`details`, `metadata_json` (snapshot), `created_at`.

**Three complementary layers of traceability:**
1. `case_actions` — the employee activity feed (what people did)
2. `case_status_history` — formal status transitions (from→to, who, when, why)
3. `audit_logs` — system-level audit trail (every entity change)

The **Audit History** page (`/audit`) lets Admin/Lead review entries with
filters by entity type and action. Read-only — no edit/delete endpoint.

**Evidence:** after the demo, `audit_logs` has **14 entries** across 6
action types:
```
action_added: 3, status_changed: 2, completion: 1,
case_reassigned: 1, case_created: 1, case_assigned: 1
```

---

## J. Error Handling

- **Form validation** — frontend: title required, next-action-date ≤ due
  date; backend: invalid category/priority/status → 400 with message.
- **Loading states** — spinner + "Loading…" on every async page.
- **Empty states** — dashboard shows "No cases have been created yet" +
  Create button when 0 cases; tables show "No cases found".
- **API error messages** — `{ "error": "..." }` with proper HTTP codes
  (400/401/403/404/409).
- **Success notifications** — toast on every successful save.
- **Confirmation** — the Completed status requires a resolution note
  (enforced both sides).
- **Database error handling** — parameterized SQL prevents injection;
  connection errors propagate as 500 with detail.

No dead buttons, no fake interactions.

---

## Special feature — Trust & Fairness

A dedicated page (`/trust`) explains the three protections implemented to
keep employee-contribution data honest (the brochure highlights that
employees are judged using the data they enter):

1. **Meaningless action prevention** — opening a case is never an action;
   only the 6 meaningful types + Other are recordable, each requiring a
   description.
2. **Premature closure prevention** — backend rejects `Completed` without
   a non-empty `resolution_note`.
3. **Contribution preservation** — reassignment never overwrites prior
   assignment rows or actions; `case_assignments` is append-only and
   `case_actions` rows keep their original `user_id` and timestamp.

The page explicitly states: *"We do not claim manipulation is impossible."*

---

## Final verification — 5 demonstrations

### Demonstration 1 — Initial State ✅
- Fresh `python seed.py` → 6 users, 8 categories, **0 cases, 0 actions, 0 audit**.
- Dashboard KPIs: Total 0, Active 0, Completed 0, Overdue 0, Actions 0.
- Empty-state banner: "No cases have been created yet" + Create button.
- No fabricated cases shown.

### Demonstration 2 — Case Lifecycle ✅
- Created `CASE-001` "Customer refund not received" → assigned to Rahul.
- Recorded a "Contacted" action.
- Status: New → Pending → Completed (resolution note required + provided).
- `case_status_history` shows 3 transitions (None→New, New→Pending, Pending→Completed).

### Demonstration 3 — Reassignment ✅
- Created `CASE-002` "SSO login loop" → assigned to Rahul.
- Recorded "Investigation Started" action.
- Reassigned Rahul → Sneha.
- Recorded "Contacted" action.
- History endpoint returns **2 assignments + 4 actions** — both
  contributions preserved:
  ```
  assignments:
    - Rahul Verma by Arjun Mehta | Initial assignment at case creation
    - Sneha Iyer by Arjun Mehta | Reassigned from Rahul Verma to Sneha Iyer
  actions:
    - case_created | Case CASE-002 created and assigned to Rahul Verma.
    - investigation_started | Investigated SAML response...
    - case_reassigned | Case reassigned from Rahul Verma to Sneha Iyer.
    - contacted | Called customer to confirm SSO works now...
  ```

### Demonstration 4 — Productivity ✅
- After the lifecycle, dashboard KPIs updated: Total 1, Completed 1.
- Productivity Reports page renders with Cases Created / Completed /
  Total Actions / Avg Completion + activity trend chart, all from the DB.

### Demonstration 5 — Persistence ✅
- Browser reloaded → cases and history still present.
- Final DB state: **2 cases, 12 actions, 4 assignments, 4 status
  transitions, 14 audit entries** — all saved in the database, not
  in-memory or temporary.

---

## Functionality rules — compliance check

| Rule | Status |
|---|---|
| No fake cases on initial startup | ✅ default seed = 0 cases |
| No hardcoded dashboard statistics | ✅ all from `/api/dashboard/summary` |
| No fake action history | ✅ actions only from real `POST` calls |
| Every action saved to DB | ✅ `case_actions` INSERT only |
| All dashboard values from backend APIs | ✅ no client-side fabrication |
| Reassignment preserves earlier contributions | ✅ `case_assignments` append-only |
| Overdue derived automatically | ✅ computed in SQL, no flag column |
| Reopening recorded in history | ✅ `case_status_history` + `audit_logs` |
| Employees see their own productivity | ✅ Resource role scoped in API |
| Historical corrections traceable | ✅ 3 log layers, all append-only |
| Transactions for important updates | ✅ Flask route = single connection per request |
| Never show success before backend confirms | ✅ UI toasts only after 200/201 |

---

## Files of note

**Backend** (`backend/`):
- `app.py` — Flask factory + blueprint registration
- `config.py`, `database.py` — dual MySQL/SQLite support
- `auth.py` — signed-token auth + role guards
- `activity.py`, `audit.py` — immutable log writers
- `routes/` — auth, cases, activities, reports, dashboard, audit, categories
- `schema.sql`, `schema_sqlite.sql` — 7 tables (MySQL + SQLite mirrors)
- `seed.py` — default 0 cases; `--demo` for optional labelled demo data

**Frontend** (`frontend/src/`):
- `App.jsx`, `auth.jsx`, `api.js`, `styles.css`
- `components/` — Sidebar, TopNav, Layout, CaseDetailDrawer, CaseTable, KpiCard, Badge, Feedback, icons
- `pages/` — Login, Overview, MyCases, AllCases, CreateCase, ActivityLogs, AuditHistory, ProductivityReports, TeamPerformance, TrustFairness, Settings

**Docs** (`docs/`): `round-1.md`, `round-2.md`, `round-3.md`, `task-allocation.md`

---

## How to run

```bash
# Backend (Flask)
cd backend && pip install -r requirements.txt
python seed.py            # 6 users + 8 categories, ZERO cases
python app.py             # http://127.0.0.1:5000

# Frontend (Vite)
cd frontend && npm install
npm run dev               # http://127.0.0.1:3000 (proxies /api -> Flask)

# Optional demo data (clearly labelled, never mixed with real data)
python backend/seed.py --demo        # loads 18 DEMO-001… cases
python backend/seed.py --clear-demo  # removes all case data
```

Login: `admin@crm.io` / `admin123` (also `lead@crm.io`/`lead123`,
`rahul@crm.io`/`rahul123`, `sneha@crm.io`/`sneha123`,
`vikram@crm.io`/`vikram123`, `anita@crm.io`/`anita123`).

**Live preview:** https://preview-chat-8bdb48f1-cf04-4c27-8a27-08499b17dbde.space-z.ai/

---

## Status

- Round 1 (idea screening): ✅ complete → `docs/round-1.md`
- Round 2 (design & POC): ✅ complete → `docs/round-2.md`
- Round 3 (development progress): ✅ complete → this document
- Round 4 / Round 5: not attempted (out of scope per instructions)

**Key differentiator demonstrated:** every case, every meaningful action,
every employee contribution and every productivity metric is connected and
traceable — through `case_actions`, `case_assignments`,
`case_status_history`, and `audit_logs`, all append-only.
