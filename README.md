# CaseFlow CRM — Case Management & Productivity Reporting (Round 2 POC)

A clean, modern **CRM Case Management System** built for a hackathon Round 2 proof
of concept. Operational resources manage customer cases, team leads monitor
workloads, and management views accurate productivity reports — all backed by an
**immutable, real-time action log** that records every meaningful operation.

> Priority: **Functionality > Code simplicity > UI quality > Unnecessary features.**

---

## Tech Stack (exactly as required)

| Layer      | Technology                                   |
|------------|----------------------------------------------|
| Frontend   | React.js, HTML, CSS, JavaScript, Recharts   |
| Backend    | Python, Flask, REST API                      |
| Database   | MySQL (production) — **SQLite fallback for zero-setup demo** |

The database layer supports **both** MySQL and SQLite behind one identical
code path. By default the app runs on SQLite so judges can launch it with **zero
database setup**. Switching to real MySQL is a one-line config change (see below).
All SQL is portable; only `DATEDIFF`/`julianday` differs and is handled per-backend.

---

## Quick Start (zero setup — SQLite)

```bash
# 1. Backend
cd backend
python -m venv venv && source venv/bin/activate
pip install -r requirements.txt
python seed.py            # creates schema + 6 users + 18 cases + ~55 actions
python app.py             # http://127.0.0.1:5000

# 2. Frontend (new terminal)
cd frontend
npm install
npm run dev               # http://127.0.0.1:5173  (proxies /api to Flask)
```

Open **http://localhost:5173** and sign in with the demo account (pre-filled):

```
Admin:      admin@crm.io   / admin123
Team Lead:  lead@crm.io    / lead123
Resource:   rahul@crm.io   / rahul123   (also sneha / vikram / anita + 123)
```

### One-process mode (no Vite)

After `npm run build` in `frontend/`, Flask automatically serves the built SPA too,
so the **whole app runs from a single process**:

```bash
cd frontend && npm install && npm run build     # produces frontend/dist
cd ../backend && python seed.py && python app.py
# open http://127.0.0.1:5000
```

---

## Switching to real MySQL

1. Create the database + tables:
   ```bash
   mysql -u root -p < backend/schema.sql
   ```
2. (Optional) create a dedicated user:
   ```sql
   CREATE USER 'crm_user'@'localhost' IDENTIFIED BY 'crm_pass';
   GRANT ALL ON crm_db.* TO 'crm_user'@'localhost'; FLUSH PRIVILEGES;
   ```
3. Run with environment variables (no code change needed):
   ```bash
   DB_TYPE=mysql DB_USER=crm_user DB_PASSWORD=crm_pass DB_NAME=crm_db \
     python seed.py
   DB_TYPE=mysql DB_USER=crm_user DB_PASSWORD=crm_pass DB_NAME=crm_db \
     python app.py
   ```

---

## Project Structure

```
.
├── backend/
│   ├── app.py              # Flask app factory + serves built SPA (optional)
│   ├── config.py           # DB + Flask config (env vars)
│   ├── database.py         # MySQL/SQLite connection + query helpers
│   ├── auth.py             # token auth + role guards
│   ├── activity.py         # immutable action-log writer
│   ├── schema.sql          # MySQL schema (creates crm_db + 4 tables)
│   ├── schema_sqlite.sql   # SQLite schema (mirror)
│   ├── seed.py             # sample data: 6 users, 18 cases, ~55 actions
│   ├── requirements.txt
│   └── routes/
│       ├── auth.py         # /api/auth/*  (login, me, users)
│       ├── cases.py        # /api/cases/* (CRUD, assign, status, actions, history)
│       ├── activities.py   # /api/activities + /since/<id> (auto-refresh poll)
│       ├── reports.py      # /api/reports/productivity + /team
│       └── dashboard.py     # /api/dashboard/summary (KPIs + charts)
├── frontend/
│   ├── package.json
│   ├── vite.config.js      # proxies /api -> Flask:5000
│   ├── index.html
│   └── src/
│       ├── main.jsx, App.jsx, auth.jsx, api.js, styles.css
│       ├── components/   (Sidebar, TopNav, Layout, KpiCard, CaseTable,
│       │                  CaseDetailDrawer, Badge, Feedback, icons)
│       └── pages/        (Login, Overview, MyCases, AllCases, CreateCase,
│                          ActivityLogs, ProductivityReports,
│                          TeamPerformance, Settings)
└── README.md
```

---

## REST API

| Method | Endpoint                          | Purpose                                  |
|--------|-----------------------------------|------------------------------------------|
| POST   | `/api/auth/login`                 | Sign in, returns signed token            |
| GET    | `/api/auth/me`                    | Current user                             |
| GET    | `/api/auth/users`                 | User list (assignee dropdown)            |
| POST   | `/api/auth/users`                 | Create user (Admin only)                 |
| GET    | `/api/cases`                      | List/filter cases (status, priority, category, assignee, search, overdue) |
| POST   | `/api/cases`                      | Create case (+ auto action log)          |
| GET    | `/api/cases/{id}`                 | Case detail                              |
| PUT    | `/api/cases/{id}`                  | Edit / assign / priority / status (+action log per change) |
| POST   | `/api/cases/{id}/actions`         | Record a comment / schedule next action  |
| GET    | `/api/cases/{id}/history`         | Full assignment + action timeline        |
| GET    | `/api/activities`                 | Global activity feed (filter by user/type) |
| GET    | `/api/activities/since/{last_id}` | Lightweight poll for new actions         |
| GET    | `/api/dashboard/summary`         | KPIs + 4 chart datasets + priority/overdue/upcoming |
| GET    | `/api/reports/productivity`       | Individual productivity (filters)        |
| GET    | `/api/reports/team`               | Team performance (Admin/Lead only)       |

---

## Database Schema

4 tables with foreign keys + indexes. `schema.sql` (MySQL) and `schema_sqlite.sql`
are mirror images.

- **users** — `user_id`, name, email, password_hash, role (Admin/Team Lead/Resource), active
- **cases** — `case_id`, case_code (CASE-001…), title, category, description, priority,
  status (New/Active/Pending/Completed/Reopened), created_by, assigned_to, due_date,
  next_action_date, next_action, completion_date, resolution_note, created_at, updated_at
- **case_assignments** — full reassignment history (case_id, assigned_to, assigned_by, assigned_at, note)
- **case_actions** — **immutable** activity log (action_id, case_id, user_id, action_type,
  description, previous_value, new_value, created_at)

Overdue status is **calculated** (`due_date < today AND status <> Completed`), never a
manual flag.

---

## The 5 Round 2 Demonstrations

### Demo 1 — Create a case
1. Sign in as Admin → **Create Case** in the sidebar.
2. Fill the form (title, category, priority, assignee, due/next-action dates, description).
3. Click **Create case**. The case detail drawer opens with the new case code
   (e.g. `CASE-019`) and a `Case Created` action is automatically written to the log.

### Demo 2 — Record actions
1. In the drawer, click the **Record Action** tab.
2. Add a comment / schedule a next action → click **Record action**.
3. Switch to the **History** tab — every action appears as an immutable timeline
   entry with timestamp, user, and previous → new values.

### Demo 3 — Update case status
1. In the drawer, click **Edit**.
2. Change Status → **Pending**, save.
3. Change Status → **Completed** — the form now **requires a Resolution note**
   (validation blocks completion without one). Fill it and save.
4. Reopen the case (Status → **Reopened**) — the prior completion history is
   preserved in the timeline.

### Demo 4 — Dashboard update
After Demos 1–3, return to **Overview**. The KPI cards (Total / Active / Completed /
Overdue / Actions Recorded) and all four charts now reflect the real database
state — e.g. Total Cases went 18 → 19 and Completed 2 → 3. Nothing is hardcoded.

### Demo 5 — Productivity reporting
1. Go to **Productivity Reports**.
2. Pick a resource (Admin/Lead can pick anyone; a Resource sees only themselves).
3. The report shows Cases Created / Assigned / Actioned / Completed, Active,
   Overdue, **Total Actions**, and **Average Completion (days)** — productivity is
   **never reduced to closure count alone**, per the brief. A trend chart and the
   click-through case lists (completed / actioned) are included.

---

## Role-Based Access

| Capability                          | Admin | Team Lead | Resource |
|-------------------------------------|:-----:|:---------:|:--------:|
| View all cases                      |  ✓    |  ✓       | own only |
| Create / edit / assign cases        |  ✓    |  ✓       | assigned |
| Record actions / comments           |  ✓    |  ✓       | assigned |
| Productivity report (self)          |  ✓    |  ✓       |  ✓       |
| Team Performance page               |  ✓    |  ✓       |    —     |
| Settings (manage users)             |  ✓    |   —      |    —     |

---

## Key Implementation Notes

- **Real-time action logging** is the central feature. Every mutating endpoint
  writes one or more rows to `case_actions` through `activity.log_action()`.
  Historical rows are **never updated or deleted**. Timestamps are generated on
  the backend.
- **Auto-refresh**: the Activity Logs page polls `/api/activities/since/<last_id>`
  every 5 seconds (lightweight, no WebSockets) and prepends new actions with a
  live indicator.
- **Completed requires a resolution note** — enforced both in the backend
  (`routes/cases.py`) and the frontend edit form.
- **Reopening preserves history** — completion date/resolution note stay visible
  in the timeline; the case row's status moves to `Reopened`.
- **Overdue** is computed, never manually set.
- **Parameterized SQL** everywhere (no string interpolation) — `database.q()`
  translates `%s` placeholders to `?` for SQLite.
- **Loading & empty states**, form validation, and API error handling are
  implemented throughout.

---

## Sample Data

`seed.py` inserts:
- 1 Admin, 1 Team Lead, 4 Resources
- 18 cases (mix of New / Active / Pending / Completed / Reopened, several overdue)
- ~55 action records spread across the last ~14 days (for realistic charts)
- Reassignment history preserved in `case_assignments`

Re-seed any time with `python seed.py` (resets the SQLite file so case codes
restart at CASE-001).

---

## Design

Pure white enterprise theme — `#FFFFFF` background, dark charcoal text, subtle
light-grey borders, soft-grey secondary surfaces, **one** restrained blue accent
(`#2563EB`) for primary actions. No dark mode, no gradients, no glassmorphism.
Status/priority colours are used sparingly as soft badges. Inspired by modern
SaaS dashboards (Stripe / Vercel admin style).
