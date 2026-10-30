# Round 2 — Design & Proof of Concept

**Problem Statement:** PS-02 — CRM Case Management & Productivity Reporting
**Evaluation weight:** 15 marks

---

## 1. System architecture

```
┌──────────────────────┐        ┌─────────────────────────┐        ┌─────────────┐
│  React + Vite (JS)   │  HTTP  │  Python Flask REST API   │  SQL   │   MySQL     │
│  Frontend            │ ─────> │  (Flask-CORS, signed     │ ─────> │  Database   │
│  Recharts, Axios     │ <────  │   token auth)            │ <────  │             │
└──────────────────────┘  JSON  └─────────────────────────┘  rows  └─────────────┘
                                        │
                                        └─> PyMySQL (production MySQL)
                                        └─> sqlite3 (zero-setup local demo,
                                                     same schema + same code path)
```

### How information moves through the layers

1. **User action** in the React UI → `axios` sends a JSON request to a
   relative `/api/...` path.
2. Vite dev server **proxies** `/api` to the Flask backend on port 5000.
3. Flask route validates input, **writes to the database** through
   parameterized SQL, and writes one or more **immutable** rows to the
   action log / audit log / status history tables inside the same logical
   operation.
4. Flask returns JSON; the React component re-fetches the affected views
   (dashboard, case history, activity feed).
5. The **Activity Logs** page polls `/api/activities/since/<last_id>` every
   5 seconds to surface newly recorded actions without a manual refresh.

---

## 2. Technology selection and reasons

| Layer | Chosen | Reason |
|---|---|---|
| Frontend framework | **React 18 + Vite** | Fast dev server, simple SPA, beginner-friendly |
| Routing | **React Router v6** | Standard, well-documented |
| HTTP | **Axios** | Interceptors for auth token + 401 handling |
| Charts | **Recharts** | Clean, declarative, matches the minimal design |
| Icons | **Lucide-style inline SVGs** | No extra dependency, consistent stroke weight |
| Backend | **Python + Flask** | Minimal, readable, easy to explain to judges |
| Auth | **Signed HMAC token** (`itsdangerous`) | Ships with Flask; no extra library |
| DB driver | **PyMySQL** | Pure-Python MySQL client, also has a SQLite fallback |
| Database | **MySQL** (prod) / **SQLite** (demo) | Identical schema + identical SQL; switch via one env var |

> **Note on Flask-SQLAlchemy / Flask-JWT-Extended:** the brochure lists them
> as the intended stack. We chose raw parameterized SQL (via PyMySQL) and
> a signed-token helper instead because they are simpler to read and debug
> for a hackathon prototype, and they keep the code path identical across
> MySQL and SQLite. Migrating to SQLAlchemy/JWT would be a low-risk upgrade
> but is not necessary for the proof of concept.

---

## 3. Database design

Seven relational tables (mirrored in `backend/schema.sql` for MySQL and
`backend/schema_sqlite.sql` for SQLite):

### users
| Column | Type | Notes |
|---|---|---|
| user_id | INT AI PK | |
| name, email | VARCHAR | email UNIQUE |
| password_hash | VARCHAR | bcrypt |
| role | ENUM | Admin / Team Lead / Resource |
| active | BOOL | |
| created_at | TIMESTAMP | |

### cases
| Column | Type | Notes |
|---|---|---|
| case_id | INT AI PK | |
| case_code | VARCHAR(20) UNIQUE | `CASE-001`, never reused |
| title, category, description, priority, status | | priority ENUM Low/Med/High/Critical; status ENUM New/Active/Pending/Completed/Reopened |
| created_by → users | FK | |
| assigned_to → users | FK NULL | |
| due_date, next_action_date, next_action | | deadline monitoring |
| completion_date, resolution_note | | required for Completed |
| created_at, updated_at | TIMESTAMP | |

### case_actions (the employee activity feed — immutable, append-only)
| Column | Type | Notes |
|---|---|---|
| action_id | INT AI PK | |
| case_id → cases | FK CASCADE | |
| user_id → users | FK | who recorded the action |
| action_type | VARCHAR(50) | `contacted`, `investigation_started`, … |
| description | VARCHAR(500) | required, non-empty |
| previous_value, new_value | VARCHAR | for status/priority transitions |
| created_at | TIMESTAMP | backend-generated |

### case_assignments (preserves full reassignment history)
| Column | Type | Notes |
|---|---|---|
| assignment_id | INT AI PK | |
| case_id → cases | FK CASCADE | |
| assigned_to → users, assigned_by → users | FK | |
| assigned_at | TIMESTAMP | |
| note | VARCHAR | e.g. "Reassigned from X to Y" |

### case_status_history (formal status transition log)
| Column | Type | Notes |
|---|---|---|
| history_id | INT AI PK | |
| case_id → cases | FK CASCADE | |
| from_status, to_status | VARCHAR | |
| changed_by → users | FK | |
| note | VARCHAR | resolution note excerpt on completion |
| changed_at | TIMESTAMP | |

### categories (lookup table)
| Column | Type | Notes |
|---|---|---|
| category_id | INT AI PK | |
| name | VARCHAR UNIQUE | Billing, Technical Support, … |
| description | VARCHAR | |

### audit_logs (system-level audit trail — read-only to users)
| Column | Type | Notes |
|---|---|---|
| audit_id | INT AI PK | |
| entity_type | VARCHAR | `case` / `assignment` / `action` |
| entity_id | INT | |
| action | VARCHAR | `case_created`, `status_changed`, … |
| user_id → users | FK | |
| details | VARCHAR(500) | human-readable summary |
| metadata_json | TEXT | optional snapshot |
| created_at | TIMESTAMP | |

### Relationships (ER summary)
```
users 1───∞ cases (created_by)
users 1───∞ cases (assigned_to)
cases 1───∞ case_actions
cases 1───∞ case_assignments
cases 1───∞ case_status_history
cases ∞───1 categories (by category name)
users 1───∞ audit_logs
```

All write tables have appropriate indexes (`idx_action_case`,
`idx_audit_time`, etc.). Timestamps are generated by the backend, never
trusted from the client.

---

## 4. API design

REST endpoints implemented (all under `/api`):

| Method | Endpoint | Purpose |
|---|---|---|
| POST | `/auth/login` | sign in, returns signed token |
| GET | `/auth/me` | current user |
| GET/POST | `/auth/users` | list / create users |
| GET | `/cases` | list + filter cases |
| POST | `/cases` | create case (auto action + audit + status history) |
| GET | `/cases/{id}` | case detail |
| PUT | `/cases/{id}` | edit / assign / priority / status |
| POST | `/cases/{id}/actions` | record a meaningful action |
| GET | `/cases/{id}/history` | actions + assignments + status transitions |
| GET | `/activities` | global activity feed |
| GET | `/activities/since/{last_id}` | lightweight poll for new actions |
| GET | `/audit` | audit log (filterable) |
| GET | `/audit/summary` | counts by action |
| GET | `/categories` | category lookup |
| GET | `/dashboard/summary` | KPIs + chart datasets |
| GET | `/reports/productivity` | per-resource productivity |
| GET | `/reports/team` | team performance (Admin/Lead) |
| GET | `/health` | health check |

All write endpoints use parameterized SQL (`%s` placeholders, rewritten to
`?` for SQLite) — no string interpolation.

---

## 5. UI/UX design decisions

- **Pure white theme** (`#FFFFFF`), one restrained blue accent (`#2563EB`),
  thin grey borders (`#E5E7EB`), dark charcoal text (`#171717`). No gradients,
  no dark mode, no glassmorphism.
- **Fixed left sidebar + top nav + scrollable main** layout — matches the
  mental model of every enterprise SaaS the judges already know.
- **Role-aware navigation** — Team Performance is hidden from Resources,
  Settings from non-Admins.
- **Case detail drawer** with four tabs (Overview / History / Edit /
  Record Action) so the full lifecycle is one click away.
- **Empty states** — when there are 0 cases, the dashboard shows a clean
  "Create your first case" CTA instead of fabricated charts.
- **Live activity feed** with a 5-second poll and a pulsing dot, so judges
  see new actions appear without manual refresh.
- **Design quality bar** — Linear / Stripe / modern enterprise SaaS.

---

## 6. Data requirements

- All dashboard values come from the backend API; none are hardcoded.
- The application starts with **zero cases** (`python seed.py` creates only
  users + categories). Demo data is optional and clearly labelled
  (`python seed.py --demo` loads 18 `DEMO-001…` cases, removable with
  `python seed.py --clear-demo`).
- Overdue is **derived** (`due_date < today AND status <> Completed`),
  never a manual flag.
- Case IDs (`CASE-001`) are never reused — derived from `MAX(case_id)+1`.

---

## 7. Prototype screenshots / screen references

The prototype is live and interactive. Each screen below is reachable in the
running app (see README for the preview URL):

| Screen | Route | Implemented |
|---|---|---|
| Login | `/login` | ✅ |
| Dashboard (Overview) | `/` | ✅ |
| My Cases | `/my-cases` | ✅ |
| All Cases | `/all-cases` | ✅ |
| Create Case | `/create-case` | ✅ |
| Case Details (drawer) | from any case row | ✅ |
| Activity Timeline | `/activity-logs` + drawer History tab | ✅ |
| Productivity Analytics | `/reports` | ✅ |
| Team Management | `/team` | ✅ |
| Audit History | `/audit` | ✅ |
| Trust & Fairness | `/trust` | ✅ |
| Settings | `/settings` | ✅ |

> Note: the brochure mentions Tailwind CSS. The frontend uses a
> hand-crafted plain-CSS design system tuned for the pure-white enterprise
> theme; the visual outcome matches the brief without adding the
> dependency. Converting to Tailwind utility classes is a cosmetic
> refactor that does not change functionality.

---

## 8. Development feasibility

- The full stack runs locally with two commands (`python app.py` +
  `npm run dev`) or one process after `npm run build` (Flask serves the SPA).
- The DB layer supports MySQL and SQLite behind one identical code path —
  zero setup for the demo, real MySQL for production.
- Total backend code: ~600 lines across 11 small files. Total frontend:
  ~13 React components + 10 pages. No microservices, no over-engineering.

---

## 9. Round 2 deliverable status

- ✅ System architecture documented above
- ✅ Database design — 7 tables with FKs + indexes
- ✅ UI/UX prototype — 12 screens implemented
- ✅ REST API proof of concept — 18 endpoints
- ✅ React ↔ Flask ↔ DB verified working end-to-end
- ✅ This document

See `docs/round-3.md` for measured development-progress evidence and
`docs/task-allocation.md` for team responsibilities.
