// electron/server/db.cjs
// Embedded SQLite backend for the VNS app. Replaces the external MySQL
// server + Express backend that used to have to be started separately
// (server/ + portable MySQL). The database file lives in Electron's
// userData dir, is created on first launch, and the admin account is
// seeded automatically. The rest of the app is unchanged — the React
// renderer still talks to http://localhost:4000/api.
"use strict";

const path = require("path");
const fs = require("fs");
const Database = require("better-sqlite3");

const ADMIN_EMAIL = "admin@vns.local";
const ADMIN_PASSWORD_HASH =
  "$2a$10$sD2iusU.HBdYrkSkwqiJ7e3Dt4fSPASBiSkOf6TMpr6YSEF.5Tyh2"; // VNSProject
const ADMIN_FULL_NAME = "VNS Admin";

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  full_name     TEXT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'viewer'
                CHECK (role IN ('admin', 'editor', 'viewer')),
  status        TEXT NOT NULL DEFAULT 'pending'
                CHECK (status IN ('pending', 'active', 'rejected')),
  locked_until  TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS sessions (
  id         TEXT PRIMARY KEY,          -- 64-hex session token
  user_id    INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL,             -- ISO 8601 / datetime string
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS role_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER NOT NULL,
  requested_role TEXT NOT NULL DEFAULT 'editor',
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  reviewed_at    TEXT,
  reviewed_by    INTEGER,
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users (id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS password_resets (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,             -- ISO 8601 / datetime string
  used       INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
`;

let db = null;

function isSelect(sql) {
  return /^\s*(SELECT|PRAGMA|WITH|EXPLAIN)/i.test(sql);
}

// Drop-in replacement for the old mysql2 pool.query() shape so the route
// handlers kept the exact same `const [rows] = await query(...)` idiom.
// SELECT -> [rows]; anything else -> [null, { changes, lastInsertRowid }].
async function query(sql, params = []) {
  const stmt = db.prepare(sql);
  if (isSelect(sql)) {
    return [stmt.all(...params)];
  }
  const info = stmt.run(...params);
  return [null, { affectedRows: info.changes, insertId: info.lastInsertRowid, info }];
}

function initDb(dbFilePath) {
  fs.mkdirSync(path.dirname(dbFilePath), { recursive: true });
  db = new Database(dbFilePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(SCHEMA);
  return db;
}

// First-run bootstrap: if there is no user yet, create the built-in admin
// so a fresh install is immediately usable (admin@vns.local / VNSProject).
function seedAdmin() {
  if (!db) return;
  const row = db.prepare("SELECT COUNT(*) AS c FROM users").get();
  if (row && row.c === 0) {
    db.prepare(
      "INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?, ?, ?, 'admin', 'active')"
    ).run(ADMIN_FULL_NAME, ADMIN_EMAIL, ADMIN_PASSWORD_HASH);
  }
}

function getDb() {
  return db;
}

module.exports = { query, initDb, seedAdmin, getDb, ADMIN_EMAIL };