// electron/server/middleware/requireAuth.cjs
// Same behaviour as the old server/middleware/requireAuth.js (mysql2 pool)
// but backed by the embedded SQLite db via ../db.cjs.
"use strict";

const { query } = require("../db.cjs");

// Reads the session_token cookie, looks it up in the sessions table, and
// attaches the signed-in user to req.user. Deleting the session row (done on
// logout) or letting it expire is enough to fully revoke access — there is no
// stateless token floating around that could still work after logout.
async function requireAuth(req, res, next) {
  const token = req.cookies?.session_token;
  if (!token) {
    return res.status(401).json({ error: "Not signed in." });
  }

  const [rows] = await query(
    `SELECT s.expires_at, u.id, u.email, u.full_name, u.role
     FROM sessions s
     JOIN users u ON u.id = s.user_id
     WHERE s.id = ?`,
    [token]
  );

  const row = rows[0];
  if (!row || new Date(row.expires_at) < new Date()) {
    if (row) await query("DELETE FROM sessions WHERE id = ?", [token]);
    res.clearCookie("session_token", { path: "/" });
    return res.status(401).json({ error: "Session expired. Please sign in again." });
  }

  req.user = { id: row.id, email: row.email, full_name: row.full_name, role: row.role };
  req.sessionToken = token;
  next();
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin") {
    return res.status(403).json({ error: "Admins only." });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };