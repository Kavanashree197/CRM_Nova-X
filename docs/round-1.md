# Round 1 — Idea Screening & Problem Validation

**Problem Statement:** PS-02 — CRM Case Management & Productivity Reporting
**Hackathon:** Hack4Hire (24-hour)

---

## 1. Problem statement

Organisations handle customer cases across many channels — email, phone,
chat, spreadsheets, sticky notes. There is no single place where a case
lives from the moment it is raised to the moment it is resolved. As a result,
no one has a complete, trustworthy picture of who did what, when, and how
much real work each employee carried out.

---

## 2. Problem analysis

When cases are scattered across channels and spreadsheets:

- **Visibility is incomplete.** A manager cannot see all open cases in one
  view, so work falls through the cracks.
- **Follow-ups are missed.** Without a structured next-action date, the
  team reacts instead of planning.
- **Productivity reports are manual and inaccurate.** Someone exports a
  spreadsheet at month-end, counts closures, and calls it "performance."
  That number hides effort on hard cases and rewards people who cherry-pick
  easy ones.
- **Employee contributions are invisible.** Investigation, customer calls,
  follow-ups — the actual work — is never recorded, so it never counts.
- **Performance evaluation becomes unfair.** People are judged on closure
  counts alone, which does not reflect real workload or complexity.
- **Overloaded employees are hard to spot.** Without workload visibility,
  a single person can drown while others appear under-utilised.

---

## 3. Existing challenges

| Challenge | What happens today |
|---|---|
| Fragmented case data | Cases live in email threads, chat, and personal spreadsheets |
| No action history | Only the final closure is recorded, not the journey |
| Manual reporting | A team lead spends hours every week assembling numbers |
| Subjective evaluation | Employees feel "judged" without evidence |
| No overdue visibility | A case can quietly pass its due date with no alert |

---

## 4. Proposed solution

A **centralised CRM platform** that manages the complete case lifecycle and
**automatically generates productivity reports from recorded activities**.

The key idea: **every meaningful action an employee takes on a case is
recorded at the moment it happens** — not at the end, not from memory.
Productivity is then computed from this recorded activity, so the numbers
are objective and traceable.

The platform provides three role-based experiences:

- **Operational employees** get a personal workspace (My Cases) with quick
  action recording.
- **Team leads** get workload visibility and team productivity.
- **Management** gets accurate dashboards where every figure can be drilled
  back to the cases and actions behind it.

---

## 5. Target users

| User | What they need from the CRM |
|---|---|
| **Operational employee (Resource)** | See my assigned cases, record what I did, never lose credit for work I performed |
| **Team lead** | See the team's workload, spot overloaded or overdue cases, review contributions |
| **Management** | Trustworthy productivity numbers, traceable to real cases and actions |

---

## 6. Expected outcomes

- **Centralised case management** — every case in one system, with a unique
  ID and full lifecycle.
- **Better follow-up visibility** — next-action dates and overdue alerts.
- **Reduced manual reporting** — dashboards and reports compute themselves.
- **Complete action history** — every meaningful action preserved, never
  overwritten.
- **Transparent employee contributions** — effort, not just closures, is
  visible and counted.
- **More reliable productivity reporting** — figures traceable to source
  cases and actions.

---

## 7. What makes our solution different

Most "productivity" tools count closures. Our differentiator is the
**action log**:

> Every case, every meaningful action, every employee contribution and
> every productivity metric is **connected and traceable**.

Concretely this means:

1. **Meaningless actions are prevented** — opening a case is never an action.
   Only meaningful types (Contacted, Investigation, Follow-up, …) are recorded,
   and each needs a description.
2. **Premature closure is prevented** — a case cannot be marked Completed
   without a resolution note.
3. **Contributions survive reassignment** — when a case moves to a new
   assignee, the previous employee's actions stay attached to them with the
   original timestamp.

These three protections are documented in the in-app **Trust & Fairness**
page so judges (and employees) can see how the numbers stay honest.

---

## 8. Initial workflow

The end-to-end lifecycle implemented in the prototype:

```
Case Creation → Assignment → Action Tracking → Follow-up Scheduling
   → Status Monitoring → Resolution → Productivity Analytics
```

Crucially, **action history is maintained throughout the lifecycle, not only
at the end**. Each arrow in the workflow above generates a permanent,
timestamped, attributed record.

---

## 9. How it maps to the brochure

| Brochure requirement | Where it is addressed |
|---|---|
| Centralised case management | `cases` table + All Cases / My Cases screens |
| Complete action history | `case_actions` (immutable, append-only) |
| Automatic productivity reports | `/api/reports/productivity` + `/api/reports/team` |
| Reduced manual reporting | Dashboard KPIs computed live from DB |
| Transparent contributions | Action log + per-resource productivity |
| Trust & fairness | In-app Trust & Fairness page + 3 enforced protections |

---

**Status:** Round 1 understanding complete. Implementation evidence in
`docs/round-2.md` (architecture + DB) and `docs/round-3.md` (working
features + measured results).
