-- ============================================================================
-- VNS App — MySQL schema (replaces supabase/migration.sql)
-- Run once: mysql -u root -p vns_app < schema.sql
-- (create the database first: CREATE DATABASE vns_app;)
-- ============================================================================

-- Account status gate (Task 2c): a brand new signup is created with
-- status='pending' and must be approved by an admin before they can log in
-- (status flips to 'active'). 'rejected' blocks them.
CREATE TABLE IF NOT EXISTS users (
  id            INT AUTO_INCREMENT PRIMARY KEY,
  full_name     VARCHAR(255) DEFAULT NULL,
  email         VARCHAR(255) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  role          ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'viewer',
  status        ENUM('pending', 'active', 'rejected') NOT NULL DEFAULT 'pending',
  locked_until  DATETIME DEFAULT NULL,
  created_at    DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- One row per active login. Deleting the row (on logout, or once expired)
-- fully revokes that session — nobody else can reuse it on the same device.
CREATE TABLE IF NOT EXISTS sessions (
  id         CHAR(64) PRIMARY KEY,
  user_id    INT NOT NULL,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_requests (
  id             INT AUTO_INCREMENT PRIMARY KEY,
  user_id        INT NOT NULL,
  requested_role ENUM('admin', 'editor', 'viewer') NOT NULL DEFAULT 'editor',
  status         ENUM('pending', 'approved', 'rejected') NOT NULL DEFAULT 'pending',
  created_at     DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  reviewed_at    DATETIME DEFAULT NULL,
  reviewed_by    INT DEFAULT NULL,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
);

-- Password recovery (Task 2a): one row per reset request.
CREATE TABLE IF NOT EXISTS password_resets (
  id          INT AUTO_INCREMENT PRIMARY KEY,
  user_id     INT NOT NULL,
  token       CHAR(64) NOT NULL UNIQUE,
  expires_at  DATETIME NOT NULL,
  used        TINYINT(1) NOT NULL DEFAULT 0,
  created_at  DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- Bootstrap your own account as the first admin:
-- 1. Sign up in the app normally (you'll start as 'pending'/'viewer').
-- 2. Then run:
-- UPDATE users SET role = 'admin', status = 'active' WHERE email = 'you@example.com';
