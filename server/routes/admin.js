import { Router } from "express";
import { pool } from "../db.js";
import { requireAuth, requireAdmin } from "../middleware/requireAuth.js";

const router = Router();

router.get("/users", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.query(
    "SELECT id, email, full_name, role, status, locked_until, created_at FROM users ORDER BY created_at ASC"
  );
  res.json({ users: rows });
});

router.patch("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (!["admin", "editor", "viewer"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }

  await pool.query("UPDATE users SET role = ? WHERE id = ?", [role, req.params.id]);
  res.json({ ok: true });
});

// Admin approves a pending new account (Task 2c): flips status to active and
// optionally grants a requested role (viewer or admin).
router.patch("/users/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const { role } = req.body || {};
  if (role && !["admin", "editor", "viewer"].includes(role)) {
    return res.status(400).json({ error: "Invalid role." });
  }
  const [rows] = await pool.query("SELECT id FROM users WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "User not found." });

  const nextRole = role || "viewer";
  await pool.query("UPDATE users SET status = 'active', role = ? WHERE id = ?", [nextRole, req.params.id]);
  res.json({ ok: true });
});

// Admin rejects a pending new account (Task 2c).
router.patch("/users/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await pool.query("SELECT id FROM users WHERE id = ?", [req.params.id]);
  if (!rows.length) return res.status(404).json({ error: "User not found." });

  await pool.query("UPDATE users SET status = 'rejected' WHERE id = ?", [req.params.id]);
  res.json({ ok: true });
});

export default router;
