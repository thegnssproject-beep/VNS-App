// electron/server/app.cjs
// Builds the Express app for the embedded VNS backend. main.cjs calls
// createApp().listen(4000, "127.0.0.1", ...) once Electron is ready, so the
// renderer's http://localhost:4000/api calls keep working with no external
// server process and no MySQL.
"use strict";

const express = require("express");
const cors = require("cors");
const cookieParser = require("cookie-parser");

const authRoutes = require("./routes/auth.cjs");
const adminRoutes = require("./routes/admin.cjs");
const roleRequestRoutes = require("./routes/roleRequests.cjs");

function createApp() {
  const app = express();

  // Local-only server bound to 127.0.0.1. In dev the renderer origin is
  // http://localhost:5173; in the packaged app it's a file:// page (Origin
  // of "null"). Reflect whatever origin asks so both work, and ship the
  // session cookie back with credentials.
  app.use(
    cors({
      origin: true,
      credentials: true,
    })
  );
  app.use(express.json());
  app.use(cookieParser());

  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/role-requests", roleRequestRoutes);

  app.get("/api/health", (req, res) => res.json({ ok: true }));

  return app;
}

module.exports = { createApp };