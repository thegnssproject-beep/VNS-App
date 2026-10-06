// electron/server/routes/admin.cjs
"use strict";

const { Router } = require("express");
const { query } = require("../db.cjs");
const { requireAuth, requireAdmin } = require("../middleware/requireAuth.cjs");

const router = Router();

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await query(
    "SELECT id, email, full_name, role, status, locked_until, created_at FROM users ORDER BY created_at ASC"
  );
  res.json({ users: rows });
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!["admin", "editor", "viewer"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }

  await query("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id]);
  res.json({ ok: true });
});

// Admin approves a pending new account: flips status to active and
// optionally grants a requested role (viewer or admin).
router.patch("/users/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (role && !["admin", "editor", "viewer"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  const [rows] = await query("SELECT id FROM users WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "User not found." });

  const nextRole = role || "viewer";
  await query("UPDATE users SET status = 'active', role = ? WHERE id = ?", [nextRole, req.params.id]);
  res.json({ ok: true });
});

// Admin rejects a pending new account.
router.patch("/users/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await query("SELECT id FROM users WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "User not found." });

  await query("UPDATE users SET status = 'rejected' WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

module.exports = router;