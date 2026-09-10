// electron/server/routes/roleRequests.cjs
// MySQL's NOW() is replaced with a JS-generated ISO timestamp to keep the
// embedded SQLite backend dialect-clean.
"use strict";

const { Router } = require("express");
const { query } = require("../db.cjs");
const { requireAuth, requireAdmin } = require("../middleware/requireAuth.cjs");

const router = Router();

// Current user's own most recent request
router.get("/mine", requireAuth, async (req, res) => {
  const [rows] = await query(
    "SELECT * FROM role_requests WHERE user_id = ? ORDER BY created_at DESC LIMIT 1",
    [req.user.id]
  );
  res.json({ request: rows[0] || null });
});

// All requests with requester's email/name — admin only
router.get("/", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await query(
    `SELECT r.*, u.email AS user_email, u.full_name AS user_full_name
     FROM role_requests r
     JOIN users u ON u.id = r.user_id
     ORDER BY r.created_at DESC`
  );
  res.json({ requests: rows });
});

router.post("/", requireAuth, async (req, res) => {
  const [pending] = await query(
    "SELECT id FROM role_requests WHERE user_id = ? AND status = 'pending'",
    [req.user.id]
  );
  if (pending.length) {
    return res.status(409).json({ error: "You already have a pending request." });
  }

  await query(
    "INSERT INTO role_requests (user_id, requested_role, status) VALUES (?, 'editor', 'pending')",
    [req.user.id]
  );
  res.status(201).json({ ok: true });
});

router.patch("/:id/approve", requireAuth, requireAdmin, async (req, res) => {
  const [rows] = await query("SELECT * FROM role_requests WHERE id = ?", [req.params.id]);
  const request = rows[0];
  if (!request) return res.status(404).json({ error: "Request not found." });

  const now = new Date().toISOString();
  await query("UPDATE users SET role = 'editor' WHERE id = ?", [request.user_id]);
  await query(
    "UPDATE role_requests SET status = 'approved', reviewed_at = ?, reviewed_by = ? WHERE id = ?",
    [now, req.user.id, request.id]
  );
  res.json({ ok: true });
});

router.patch("/:id/reject", requireAuth, requireAdmin, async (req, res) => {
  const now = new Date().toISOString();
  await query(
    "UPDATE role_requests SET status = 'rejected', reviewed_at = ?, reviewed_by = ? WHERE id = ?",
    [now, req.user.id, req.params.id]
  );
  res.json({ ok: true });
});

module.exports = router;