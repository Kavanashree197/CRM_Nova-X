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
    assignment_id INTEGER PRIMARY KEY AUTOINCREMENT,
    case_id       INTEGER NOT NULL REFERENCES cases(case_id) ON DELETE CASCADE,
    assigned_to   INTEGER NOT NULL REFERENCES users(user_id),
    assigned_by   INTEGER NOT NULL REFERENCES users(user_id),
    assigned_at   TEXT NOT NULL DEFAULT (datetime('now')),
    note          TEXT
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

