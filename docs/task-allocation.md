# Task Allocation — PS-02 CRM

This document uses **editable placeholders** for team-member names. Each row
identifies the area of work and the responsibility; replace `[Member A]`,
`[Member B]`, … with your real team names before submission.

> Note: per the rules, we do not claim a person "completed" work without
> evidence. The "Evidence" column points to the actual files / endpoints that
> exist in the repository, so the allocation is traceable to real code.

---

## Team

| Placeholder | Role | Assigned areas |
|---|---|---|
| `[Member A]` | Backend lead | Flask API, database schema, action + audit logging |
| `[Member B]` | Frontend lead | React + Vite UI, components, charts, empty states |
| `[Member C]` | Full-stack / integration | React ↔ Flask wiring, role-based access, testing |
| `[Member D]` | Design / docs | Pure-white theme, README, round-1/2/3 docs |

(Add or remove rows to match your team size.)

---

## Work breakdown

### Round 1 — Idea screening
| Task | Owner placeholder | Evidence |
|---|---|---|
| Problem statement + analysis | `[Member D]` | `docs/round-1.md` §1–3 |
| Proposed solution + target users | `[Member A]`, `[Member D]` | `docs/round-1.md` §4–6 |
| Differentiator (action log, trust & fairness) | `[Member A]` | `docs/round-1.md` §7; in-app `/trust` page |
| Workflow diagram | `[Member C]` | `docs/round-1.md` §8 |

### Round 2 — Design & POC
| Task | Owner placeholder | Evidence |
|---|---|---|
| Database schema (7 tables) | `[Member A]` | `backend/schema.sql`, `backend/schema_sqlite.sql` |
| Flask REST API (18 endpoints) | `[Member A]` | `backend/routes/*.py` |
| React UI scaffold + routing | `[Member B]` | `frontend/src/App.jsx`, `main.jsx` |
| Shared components (Sidebar, TopNav, Drawer) | `[Member B]` | `frontend/src/components/` |
| Pure-white design system | `[Member D]` | `frontend/src/styles.css` |
| API ↔ DB integration test | `[Member C]` | `docs/round-3.md` §10 (5 demos) |
| round-2.md document | `[Member D]` | `docs/round-2.md` |

### Round 3 — Development
| Task | Owner placeholder | Evidence (file / endpoint) |
|---|---|---|
| Authentication + roles + protected routes | `[Member A]`, `[Member C]` | `backend/auth.py`, `frontend/src/auth.jsx`, `App.jsx` RequireAuth/RequireRole |
| Case creation (unique ID, all fields) | `[Member A]` | `POST /api/cases`, `backend/routes/cases.py` |
| Case assignment + reassignment history | `[Member A]` | `case_assignments` table + `PUT /api/cases/{id}` |
| Action logging (6 meaningful types) | `[Member A]`, `[Member B]` | `POST /api/cases/{id}/actions`, `CaseDetailDrawer.jsx` |
| Status + deadline monitoring (overdue auto) | `[Member A]` | `cases.py` overdue calc + `case_status_history` |
| Productivity analytics (per-resource + team) | `[Member A]`, `[Member B]` | `/api/reports/productivity`, `/api/reports/team` |
| Employee dashboard (My Cases) | `[Member B]` | `frontend/src/pages/MyCases.jsx` |
| Management dashboard (Overview + Team) | `[Member B]` | `frontend/src/pages/Overview.jsx`, `TeamPerformance.jsx` |
| Audit history | `[Member A]`, `[Member B]` | `audit_logs` table, `/api/audit`, `pages/AuditHistory.jsx` |
| Trust & Fairness section | `[Member D]` | `frontend/src/pages/TrustFairness.jsx` |
| Error handling + empty states | `[Member B]`, `[Member C]` | all pages + `Feedback.jsx` |
| Zero-fake-data reset + demo loader | `[Member A]` | `backend/seed.py` (default = 0 cases) |
| Round 3 measured evidence | `[Member C]` | `docs/round-3.md` |

---

## How to use this template

1. Replace each `[Member X]` with the real contributor's name.
2. Keep the Evidence column — it is what proves the work exists.
3. If a task was pair-programmed, list both names separated by ` + `.
4. Do not delete a row; if a task was descoped, mark it "— (descoped)" with a
   one-line reason.
