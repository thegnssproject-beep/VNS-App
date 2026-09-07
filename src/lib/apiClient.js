// src/lib/apiClient.js
// Talks to the local Express + MySQL backend (see /server) instead of Supabase.
const API_URL = import.meta.env.VITE_API_URL || "http://localhost:4000/api";

async function request(path, options = {}) {
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      credentials: "include", // sends/receives the httpOnly session cookie
      headers: { "Content-Type": "application/json" },
      ...options,
    });
  } catch {
    return { data: null, error: { message: "Could not reach the server." } };
  }

  let body = null;
  try {
    body = await res.json();
  } catch {
    body = null;
  }

  if (!res.ok) {
    return { data: null, error: { message: body?.error || `Request failed (${res.status}).` } };
  }

  return { data: body, error: null };
}

export const api = {
  get: (path) => request(path),
  post: (path, payload) => request(path, { method: "POST", body: JSON.stringify(payload || {}) }),
  patch: (path, payload) => request(path, { method: "PATCH", body: JSON.stringify(payload || {}) }),
};
