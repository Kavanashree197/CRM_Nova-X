-- SQLite schema (auto-used for zero-setup local demo).
-- Mirrors schema.sql (MySQL) one-to-one.
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
    user_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    name           TEXT NOT NULL,
    email          TEXT NOT NULL UNIQUE,
    password_hash  TEXT NOT NULL,
    role           TEXT NOT NULL DEFAULT 'Resource' CHECK (role IN ('Admin','Team Lead','Resource')),
    active         INTEGER NOT NULL DEFAULT 1,
    skills         TEXT,                              -- comma-separated category names (Resources only)
    availability   TEXT NOT NULL DEFAULT 'Available' CHECK (availability IN ('Available','Busy','Unavailable')),
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

CREATE TABLE IF NOT EXISTS cases (
    case_id           INTEGER PRIMARY KEY AUTOINCREMENT,
    case_code         TEXT NOT NULL UNIQUE,
    title             TEXT NOT NULL,
    category          TEXT NOT NULL,
    description       TEXT,
    priority          TEXT NOT NULL DEFAULT 'Medium' CHECK (priority IN ('Low','Medium','High','Critical')),
    status            TEXT NOT NULL DEFAULT 'New' CHECK (status IN ('New','Active','Pending','Completed','Reopened')),
    created_by        INTEGER NOT NULL REFERENCES users(user_id),
    assigned_to       INTEGER REFERENCES users(user_id),
    assignment_status TEXT NOT NULL DEFAULT 'Awaiting Assignment' CHECK (assignment_status IN ('Assigned','Awaiting Assignment')),
    due_date          TEXT,
    next_action_date  TEXT,
    next_action       TEXT,
    completion_date   TEXT,
    resolution_note   TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at        TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_cases_status   ON cases(status);
CREATE INDEX IF NOT EXISTS idx_cases_assignee ON cases(assigned_to);
CREATE INDEX IF NOT EXISTS idx_cases_due      ON cases(due_date);

CREATE TABLE IF NOT EXISTS case_assignments (
    assignment_id        INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id              INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    assigned_to          INTEGER NOT NULL REFERENCES users(user_id),
    assigned_by           INTEGER REFERENCES users(user_id),  -- nullable: NULL = system auto-assignment
    assigned_at           TEXT NOT NULL DEFAULT (datetime('now')),
    note                  TEXT,
    assignment_method     TEXT,                                -- 'Automatic' | 'Automatic Reassignment'
    assignment_reason     TEXT,                                -- human-readable reason
    previous_assignee_id  INTEGER REFERENCES users(user_id)
);
CREATE INDEX IF NOT EXISTS idx_assign_case ON case_assignments(case_id);

CREATE TABLE IF NOT EXISTS case_actions (
    action_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id        INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    user_id        INTEGER NOT NULL REFERENCES users(user_id),
    action_type    TEXT NOT NULL,
    description    TEXT NOT NULL,
    previous_value TEXT,
    new_value      TEXT,
    created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_action_case ON case_actions(case_id);
CREATE INDEX IF NOT EXISTS idx_action_user ON case_actions(user_id);
CREATE INDEX IF NOT EXISTS idx_action_time ON case_actions(created_at);

-- ----------------------------------------------------------------------------
-- case_status_history - formal status transition log (one row per change)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS case_status_history (
    history_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id       INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    from_status   TEXT,
    to_status     TEXT NOT NULL,
    changed_by    INTEGER NOT NULL REFERENCES users(user_id),
    note          TEXT,
    changed_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_status_history_case ON case_status_history(case_id);

-- ----------------------------------------------------------------------------
-- categories - lookup table for case categories (PS-02 Round 2 requirement)
-- default_priority is the source of truth for category-based automatic
-- priority assignment (PS-02 Round 3 — clients cannot set priority manually).
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
    category_id     INTEGER PRIMARY KEY AUTOINCREMENT,
    name             TEXT NOT NULL UNIQUE,
    description      TEXT,
    default_priority TEXT NOT NULL DEFAULT 'Medium' CHECK (default_priority IN ('Low','Medium','High','Critical')),
    created_at       TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- skills - normalized skill catalog (e.g. Python, Java, AI, Machine Learning,
-- Cybersecurity, SQL). Aliases are stored as a comma-separated list and
-- normalized at insert time so "AI", "Artificial Intelligence", and "ai"
-- all resolve to the same skill row.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS skills (
    skill_id    INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,        -- canonical name, e.g. "Artificial Intelligence"
    aliases     TEXT,                        -- CSV of aliases, e.g. "AI,A.I."
    created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ----------------------------------------------------------------------------
-- user_skills - many-to-many between users and skills (dynamic skill profile).
-- This is what the assignment engine reads. Adding a skill to an employee
-- here makes them immediately eligible for matching cases — no code change.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_skills (
    user_id     INTEGER NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    skill_id    INTEGER NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
    added_at    TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (user_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_user_skills_skill ON user_skills(skill_id);

-- ----------------------------------------------------------------------------
-- category_skills - the skills a case of a given category requires. The
-- assignment engine matches these against user_skills. Adding a required
-- skill to a category is a data change, not a code change.
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS category_skills (
    category_id INTEGER NOT NULL REFERENCES categories(category_id) ON DELETE CASCADE,
    skill_id    INTEGER NOT NULL REFERENCES skills(skill_id) ON DELETE CASCADE,
    PRIMARY KEY (category_id, skill_id)
);
CREATE INDEX IF NOT EXISTS idx_cat_skills_skill ON category_skills(skill_id);

-- ----------------------------------------------------------------------------
-- audit_logs - system-level audit trail for every meaningful entity change
-- (distinct from case_actions, which is the employee activity feed)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_logs (
    audit_id      INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type   TEXT NOT NULL,        -- e.g. 'case', 'assignment', 'action'
    entity_id     INTEGER,
    action        TEXT NOT NULL,         -- e.g. 'case_created', 'status_changed'
    user_id       INTEGER REFERENCES users(user_id),
    details       TEXT,                  -- human-readable summary
    metadata_json TEXT,                  -- optional key/value snapshot (JSON string)
    created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);

