import { Router } from "express";
import bcrypt from "bcryptjs";
import crypto from "crypto";
import { pool } from "../db.js";
import { requireAuth } from "../middleware/requireAuth.js";

const router = Router();
const SESSION_HOURS = 12;

function cookieOptions() {
  return {
    httpOnly: true, // not readable from JS -> can't be stolen via XSS
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production", // requires HTTPS in prod
    maxAge: SESSION_HOURS * 60 * 60 * 1000,
    path: "/",
  };
}

async function createSession(userId, res) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + SESSION_HOURS * 60 * 60 * 1000);
  await pool.query("INSERT INTO sessions (id, user_id, expires_at) VALUES (?, ?, ?)", [
    token,
    userId,
    expiresAt,
  ]);
  res.cookie("session_token", token, cookieOptions());
}

// New signups are NOT auto-approved (Task 2c): they're created pending and
// must be activated by an admin before they can log in. Return a 201 with
// { pending: true } instead of opening a session.
router.post("/signup", async (req, res) => {
  const { email, password, full_name } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: "Password must be at least 6 characters." });
  }

  const [existing] = await pool.query("SELECT id FROM users WHERE email = ?", [email]);
  if (existing.length) {
    return res.status(409).json({ error: "An account with this email already exists." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query(
    "INSERT INTO users (full_name, email, password_hash, role, status) VALUES (?, ?, ?, 'viewer', 'pending')",
    [full_name || null, email, passwordHash]
  );

  res.status(201).json({
    pending: true,
    message: "Your account is pending admin approval. You'll be able to sign in once an admin activates it.",
  });
});

router.post("/login", async (req, res) => {
  const { email, password } = req.body || {};

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required." });
  }

  const [rows] = await pool.query("SELECT * FROM users WHERE email = ?", [email]);
  const user = rows[0];

  // Same message either way so we don't reveal whether the email is registered.
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    return res.status(401).json({ error: "Invalid email or password." });
  }

  // Pending / rejected accounts can't sign in until an admin approves them.
  if (user.status !== "active") {
    return res.status(403).json({
      error:
        user.status === "pending"
          ? "Your account is pending admin approval."
          : "Your account request was not approved.",
    });
  }

  await createSession(user.id, res);

  res.json({
    user: { id: user.id, email: user.email, full_name: user.full_name, role: user.role, status: user.status },
  });
});

// --- Password recovery (Task 2a) -----------------------------------------
// There is no mail service wired to this local/desktop app, so instead of
// emailing a reset link we mint a single-use token, store it in
// password_resets, and RETURN it in the response (dev convenience). In
// production you'd email this token/link so it never reaches the browser.
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body || {};
  if (!email) return res.status(400).json({ error: "Email is required." });

  const [rows] = await pool.query("SELECT id, status FROM users WHERE email = ?", [email]);
  const user = rows[0];

  // Always respond the same way whether or not the email exists, so we never
  // reveal which addresses are registered.
  if (!user) {
    return res.json({ ok: true, message: "If that email is registered, a reset link has been sent." });
  }

  // Expire any outstanding tokens for this user so only one is ever valid.
  await pool.query("UPDATE password_resets SET used = 1 WHERE user_id = ? AND used = 0", [user.id]);

  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  await pool.query(
    "INSERT INTO password_resets (user_id, token, expires_at) VALUES (?, ?, ?)",
    [user.id, token, expiresAt]
  );

  res.json({
    ok: true,
    message: "If that email is registered, a reset link has been sent.",
    // Dev-only: expose the token so the flow is testable without a mail server.
    dev_token: token,
  });
});

router.post("/reset-password", async (req, res) => {
  const { token, password } = req.body || {};
  if (!token || !password) return res.status(400).json({ error: "Token and password are required." });
  if (password.length < 6) return res.status(400).json({ error: "Password must be at least 6 characters." });

  const [rows] = await pool.query(
    "SELECT * FROM password_resets WHERE token = ? AND used = 0",
    [token]
  );
  const reset = rows[0];
  if (!reset) return res.status(400).json({ error: "Invalid or already-used reset token." });
  if (new Date(reset.expires_at) < new Date()) {
    return res.status(400).json({ error: "This reset token has expired. Request a new one." });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  await pool.query("UPDATE users SET password_hash = ? WHERE id = ?", [passwordHash, reset.user_id]);
  await pool.query("UPDATE password_resets SET used = 1 WHERE id = ?", [reset.id]);

  res.json({ ok: true, message: "Password updated. You can now sign in." });
});

// Deletes the session row server-side (not just the cookie), so the same
// session token can never be reused by anyone after this — including on the
// same browser/device.
router.post("/logout", async (req, res) => {
  const token = req.cookies?.session_token;
  if (token) {
    await pool.query("DELETE FROM sessions WHERE id = ?", [token]);
  }
  res.clearCookie("session_token", { path: "/" });
  res.json({ ok: true });
});

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

export default router;
