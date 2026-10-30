-- ============================================================================
-- CRM Case Management - MySQL Schema
-- Run on a real MySQL/MariaDB server for the production-like setup.
--
--   mysql -u root -p < schema.sql
--
-- (The local demo also ships a SQLite fallback so judges can run the app with
--  zero setup. See README.md -> "Switching to real MySQL".)
-- ============================================================================
DROP DATABASE IF EXISTS crm_db;
CREATE DATABASE crm_db CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
USE crm_db;

-- ----------------------------------------------------------------------------
-- users
-- ----------------------------------------------------------------------------
CREATE TABLE users (
    user_id        INT AUTO_INCREMENT PRIMARY KEY,
    name           VARCHAR(100)  NOT NULL,
    email          VARCHAR(150)  NOT NULL UNIQUE,
    password_hash  VARCHAR(255)  NOT NULL,
    role           ENUM('Admin','Team Lead','Resource') NOT NULL DEFAULT 'Resource',
    active         TINYINT(1)    NOT NULL DEFAULT 1,
    created_at     TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_users_role (role)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- cases
-- ----------------------------------------------------------------------------
CREATE TABLE cases (
    case_id           INT AUTO_INCREMENT PRIMARY KEY,
    case_code         VARCHAR(20)   NOT NULL UNIQUE,
    title             VARCHAR(200) NOT NULL,
    category          VARCHAR(50)  NOT NULL,
    description      TEXT,
    priority          ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
    status            ENUM('New','Active','Pending','Completed','Reopened') NOT NULL DEFAULT 'New',
    created_by        INT NOT NULL,
    assigned_to       INT NULL,
    due_date          DATE NULL,
    next_action_date  DATE NULL,
    next_action       VARCHAR(255) NULL,
    completion_date   DATE NULL,
    resolution_note   TEXT NULL,
    created_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at        TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    CONSTRAINT fk_cases_creator  FOREIGN KEY (created_by)  REFERENCES users(user_id),
    CONSTRAINT fk_cases_assignee FOREIGN KEY (assigned_to) REFERENCES users(user_id),
    INDEX idx_cases_status   (status),
    INDEX idx_cases_assignee (assigned_to),
    INDEX idx_cases_due      (due_date)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- case_assignments - preserves full reassignment history
-- ----------------------------------------------------------------------------
CREATE TABLE case_assignments (
    assignment_id INT AUTO_INCREMENT PRIMARY KEY,
    case_id       INT NOT NULL,
    assigned_to   INT NOT NULL,
    assigned_by   INT NOT NULL,
    assigned_at   TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    note          VARCHAR(255) NULL,
    CONSTRAINT fk_assign_case   FOREIGN KEY (case_id)     REFERENCES cases(case_id) ON DELETE CASCADE,
    CONSTRAINT fk_assign_to     FOREIGN KEY (assigned_to) REFERENCES users(user_id),
    CONSTRAINT fk_assign_by     FOREIGN KEY (assigned_by) REFERENCES users(user_id),
    INDEX idx_assign_case (case_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- case_actions - immutable activity log (THE central feature)
-- ----------------------------------------------------------------------------
CREATE TABLE case_actions (
    action_id      INT AUTO_INCREMENT PRIMARY KEY,
    case_id        INT NOT NULL,
    user_id        INT NOT NULL,
    action_type    VARCHAR(50)  NOT NULL,
    description    VARCHAR(500) NOT NULL,
    previous_value VARCHAR(255) NULL,
    new_value      VARCHAR(255) NULL,
    created_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_action_case FOREIGN KEY (case_id) REFERENCES cases(case_id) ON DELETE CASCADE,
    CONSTRAINT fk_action_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_action_case (case_id),
    INDEX idx_action_user (user_id),
    INDEX idx_action_time (created_at)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- case_status_history - formal status transition log (one row per change)
-- ----------------------------------------------------------------------------
CREATE TABLE case_status_history (
    history_id    INT AUTO_INCREMENT PRIMARY KEY,
    case_id       INT NOT NULL,
    from_status   VARCHAR(30) NULL,
    to_status     VARCHAR(30) NOT NULL,
    changed_by    INT NOT NULL,
    note          VARCHAR(255) NULL,
    changed_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_status_case  FOREIGN KEY (case_id)    REFERENCES cases(case_id) ON DELETE CASCADE,
    CONSTRAINT fk_status_user  FOREIGN KEY (changed_by) REFERENCES users(user_id),
    INDEX idx_status_case (case_id)
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- categories - lookup table for case categories (PS-02 Round 2 requirement)
-- default_priority is the source of truth for category-based automatic
-- priority assignment (PS-02 Round 3 — clients cannot set priority manually).
-- ----------------------------------------------------------------------------
CREATE TABLE categories (
    category_id     INT AUTO_INCREMENT PRIMARY KEY,
    name             VARCHAR(50) NOT NULL UNIQUE,
    description      VARCHAR(255) NULL,
    default_priority ENUM('Low','Medium','High','Critical') NOT NULL DEFAULT 'Medium',
    created_at       TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB;

-- ----------------------------------------------------------------------------
-- audit_logs - system-level audit trail for every meaningful entity change
-- (distinct from case_actions, which is the employee activity feed)
-- ----------------------------------------------------------------------------
CREATE TABLE audit_logs (
    audit_id      INT AUTO_INCREMENT PRIMARY KEY,
    entity_type   VARCHAR(30)  NOT NULL,
    entity_id     INT NULL,
    action        VARCHAR(50)  NOT NULL,
    user_id       INT NULL,
    details       VARCHAR(500) NULL,
    metadata_json TEXT NULL,
    created_at    TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT fk_audit_user FOREIGN KEY (user_id) REFERENCES users(user_id),
    INDEX idx_audit_entity (entity_type, entity_id),
    INDEX idx_audit_time (created_at)
) ENGINE=InnoDB;
