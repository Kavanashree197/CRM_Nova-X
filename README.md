# CRM — Case Management & Productivity Reporting (PS-02)

A professional, minimal, pure-white CRM for the Hack4Hire PS-02 problem
statement. Centralised case management with **automatic, traceable action
logging** and productivity reports computed from real recorded activity.

> **Key differentiator:** every case, every meaningful action, every
> employee contribution and every productivity metric is **connected and
> traceable**.

---

## Live preview

The app is running in the Z.ai workspace preview:

**https://preview-chat-8bdb48f1-cf04-4c27-8a27-08499b17dbde.space-z.ai/**

Login is pre-filled — click **Sign in**.

Demo accounts:
| Role | Email | Password |
|---|---|---|
| Admin | `admin@crm.io` | `admin123` |
| Team Lead | `lead@crm.io` | `lead123` |
| Resource | `rahul@crm.io` / `sneha@crm.io` / `vikram@crm.io` / `anita@crm.io` | `rahul123` / `sneha123` / `vikram123` / `anita123` |

The application **starts with zero cases**. Use **Create Case** to add real
ones; all dashboard numbers come from the database.

---

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 18 + Vite + JavaScript + React Router + Axios + Recharts |
| Backend | Python + Flask + Flask-CORS (signed-token auth via `itsdangerous`) |
| Database | MySQL (production) — **SQLite fallback for zero-setup demo** |

The database layer supports both MySQL and SQLite behind one identical
code path. By default the app runs on SQLite so it launches with no setup;
switching to real MySQL is one env var (see below).

> The brochure lists Flask-SQLAlchemy + Flask-JWT-Extended as the intended
> backend stack. We use raw parameterized SQL (PyMySQL) and a signed-HMAC
> token helper because they are simpler to read and debug, and keep the
> code path identical across MySQL and SQLite. The 7-table schema, REST
> API, and all functionality match the brochure exactly.

---

## Quick start

### Backend (Flask, port 5000)

```bash
cd backend
pip install -r requirements.txt
python seed.py            # 6 users + 8 categories. ZERO cases (default)
python app.py             # http://127.0.0.1:5000
```

### Frontend (Vite, port 3000)

```bash
cd frontend
npm install
npm run dev               # http://127.0.0.1:3000  (proxies /api -> Flask)
```

### Optional demo data (clearly labelled, never mixed with real data)

```bash
python backend/seed.py --demo        # loads 18 DEMO-001… cases for presentation
python backend/seed.py --clear-demo  # removes ALL case data (users + categories kept)
```

Demo cases use the `DEMO-NNN` prefix so they are unmistakable; real
user-created cases use `CASE-NNN` and are never touched by `--clear-demo`.

---

## Switching to real MySQL

```bash
mysql -u root -p < backend/schema.sql     # creates crm_db + 7 tables
# optional: CREATE USER 'crm_user'@'localhost' IDENTIFIED BY 'crm_pass';
#           GRANT ALL ON crm_db.* TO 'crm_user'@'localhost';
DB_TYPE=mysql DB_USER=crm_user DB_PASSWORD=crm_pass DB_NAME=crm_db \
  python seed.py
DB_TYPE=mysql DB_USER=crm_user DB_PASSWORD=crm_pass DB_NAME=crm_db \
  python app.py
```

No code changes — `config.py` reads env vars; `database.py` switches drivers.

---

## Project structure

```
.
├── backend/
│   ├── app.py              # Flask factory + blueprints
│   ├── config.py           # DB + Flask config (env vars)
│   ├── database.py         # MySQL/SQLite connection + query helpers
│   ├── auth.py             # signed-token auth + role guards
│   ├── activity.py         # immutable case_actions writer
│   ├── audit.py            # audit_logs + case_status_history writers
│   ├── schema.sql          # MySQL schema (7 tables)
│   ├── schema_sqlite.sql   # SQLite schema (mirror)
│   ├── seed.py             # users + categories only (0 cases by default)
│   ├── requirements.txt
│   └── routes/
│       ├── auth.py         # /api/auth/* (login, me, users)
│       ├── cases.py        # /api/cases/* (CRUD, assign, status, actions, history)
│       ├── activities.py   # /api/activities + /since/<id> (polling)
│       ├── audit.py        # /api/audit + /summary
│       ├── categories.py   # /api/categories
│       ├── reports.py      # /api/reports/productivity + /team
│       └── dashboard.py    # /api/dashboard/summary
├── frontend/
│   ├── package.json
│   ├── vite.config.js      # port 3000, /api proxy -> Flask, allowedHosts
│   └── src/
│       ├── App.jsx, main.jsx, auth.jsx, api.js, styles.css
│       ├── components/ (Sidebar, TopNav, Layout, CaseDetailDrawer,
│       │                 CaseTable, KpiCard, Badge, Feedback, icons)
│       └── pages/ (Login, Overview, MyCases, AllCases, CreateCase,
│                  ActivityLogs, AuditHistory, ProductivityReports,
│                  TeamPerformance, TrustFairness, Settings)
├── docs/
│   ├── round-1.md          # idea screening & problem validation
│   ├── round-2.md          # architecture, DB design, API, UI/UX
│   ├── round-3.md          # measured development-progress evidence
│   └── task-allocation.md   # editable team responsibilities
└── README.md
```

---

## Database (7 tables)

`users`, `cases`, `case_actions`, `case_assignments`, `case_status_history`,
`categories`, `audit_logs` — with foreign keys, indexes, and backend-generated
timestamps. Full schema in `backend/schema.sql` (MySQL) and
`backend/schema_sqlite.sql` (SQLite).

Three complementary, append-only log layers:
1. **`case_actions`** — the employee activity feed (what people did)
2. **`case_status_history`** — formal status transitions (from→to, who, when)
3. **`audit_logs`** — system-level audit trail (every entity change)

---

## REST API (19 endpoints)

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/api/auth/login` | sign in |
| GET | `/api/auth/me` | current user |
| GET/POST | `/api/auth/users` | list / create users |
| GET | `/api/categories` | category lookup |
| GET | `/api/cases` | list + filter cases |
| POST | `/api/cases` | create case |
| GET/PUT | `/api/cases/{id}` | detail / edit |
| POST | `/api/cases/{id}/actions` | record a meaningful action |
| GET | `/api/cases/{id}/history` | actions + assignments + status history |
| GET | `/api/activities` | global activity feed |
| GET | `/api/activities/since/{last_id}` | lightweight poll |
| GET | `/api/audit` | audit log (filterable) |
| GET | `/api/audit/summary` | counts by action |
| GET | `/api/dashboard/summary` | KPIs + chart datasets |
| GET | `/api/reports/productivity` | per-resource productivity |
| GET | `/api/reports/team` | team performance (Admin/Lead) |
| GET | `/api/health` | health check |

All writes use parameterized SQL. All mutating endpoints write to the
action log + audit log inside the same request.

---

## Trust & Fairness (special feature)

The brochure highlights that employees are judged using the data they
enter. The in-app **Trust & Fairness** page (`/trust`) documents three
enforced protections:

1. **Meaningless action prevention** — opening a case is never an action;
   only meaningful types (Contacted, Investigation, Follow-up, …) are
   recordable, each requiring a description.
2. **Premature closure prevention** — a case cannot be marked Completed
   without a resolution note (enforced on the backend).
3. **Contribution preservation** — reassignment never overwrites prior
   assignments or actions; both stay attached to the original contributor
   with the original timestamp.

We do not claim manipulation is impossible — these protections make the
data trustworthy enough that employees, leads, and management can rely on
the same numbers.

---

## Round 1 / 2 / 3 documentation

- `docs/round-1.md` — problem analysis, solution, target users, workflow
- `docs/round-2.md` — architecture, DB design, API, UI/UX decisions
- `docs/round-3.md` — measured development-progress evidence (the 5 demos)
- `docs/task-allocation.md` — editable team responsibilities (placeholders)

---

## Design

Pure white enterprise theme — `#FFFFFF` background, `#171717` text,
`#E5E7EB` borders, one `#2563EB` blue accent, `#16A34A` success,
`#D97706` warning, `#DC2626` danger. No dark mode, no gradients, no
glassmorphism. Inspired by Linear / Stripe / modern enterprise SaaS.

---

## Notes for judges

- The app starts with **zero cases** by design — use Create Case to see
  real data flow. Optional demo data is available via `python seed.py --demo`
  (labelled `DEMO-NNN`, never mixed with real `CASE-NNN` records).
- All dashboard KPIs, charts, and reports come from the backend API —
  nothing is hardcoded.
- The Activity Logs page auto-refreshes every 5 seconds (lightweight poll,
  no WebSockets).
- Overdue is **calculated** (`due_date < today AND status <> Completed`),
  never a manual flag.
- Case IDs (`CASE-001`) are never reused.
