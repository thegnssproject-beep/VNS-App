// src/auth/AuthContext.jsx
import { createContext, useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../lib/apiClient";

export const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null); // { id, email, full_name, role }
  const [loading, setLoading] = useState(true);

  // Restores the session on page load by asking the backend who the
  // session cookie belongs to (backend checks the sessions table).
  const loadMe = useCallback(async () => {
    const { data } = await api.get("/auth/me");
    setUser(data?.user || null);
  }, []);

  useEffect(() => {
    let mounted = true;
    loadMe().finally(() => {
      if (mounted) setLoading(false);
    });
    return () => {
      mounted = false;
    };
  }, [loadMe]);

  const signIn = useCallback(async (email, password) => {
    const { data, error } = await api.post("/auth/login", { email, password });
    if (error) return { error };
    setUser(data.user);
    return { data };
  }, []);

  const signUp = useCallback(async (email, password, fullName = "") => {
    const { data, error } = await api.post("/auth/signup", {
      email,
      password,
      full_name: fullName,
    });
    if (error) return { error };
    // A brand-new account is 'pending' — NOT signed in (see Task 2c). The
    // signup screen shows a waiting message until an admin approves it.
    return { data };
  }, []);

  // --- Password recovery (Task 2a) ---
  const forgotPassword = useCallback(async (email) => {
    return await api.post("/auth/forgot-password", { email });
  }, []);

  const resetPassword = useCallback(async (token, password) => {
    return await api.post("/auth/reset-password", { token, password });
  }, []);

  // --- Admin actions for pending new accounts (Task 2c) ---
  const loadUsers = useCallback(async () => {
    return await api.get("/admin/users");
  }, []);

  const approveUser = useCallback(async (id, role) => {
    return await api.patch(`/admin/users/${id}/approve`, { role });
  }, []);

  const rejectUser = useCallback(async (id) => {
    return await api.patch(`/admin/users/${id}/reject`, {});
  }, []);

  // Tells the backend to delete the session row (not just clear the cookie),
  // so this session token can never be reused afterwards on this device.
  const signOut = useCallback(async () => {
    await api.post("/auth/logout", {});
    setUser(null);
  }, []);

  // --- Role requests (unchanged feature, now backed by MySQL via the API) ---
  const requestEditorRole = useCallback(async () => {
    if (!user) return { error: { message: "Not signed in." } };
    return await api.post("/role-requests", { requested_role: "editor" });
  }, [user]);

  const loadRoleRequests = useCallback(async () => {
    return await api.get("/role-requests");
  }, []);

  const approveRoleRequest = useCallback(async (request) => {
    return await api.patch(`/role-requests/${request.id}/approve`, {});
  }, []);

  const rejectRoleRequest = useCallback(async (request) => {
    return await api.patch(`/role-requests/${request.id}/reject`, {});
  }, []);

  const value = useMemo(
    () => ({
      session: user ? { user } : null,
      user,
      profile: user,
      role: user?.role || null,
      loading,
      signIn,
      signUp,
      signOut,
      forgotPassword,
      resetPassword,
      loadUsers,
      approveUser,
      rejectUser,
      requestEditorRole,
      loadRoleRequests,
      approveRoleRequest,
      rejectRoleRequest,
      refreshProfile: loadMe,
    }),
    [
      user,
      loading,
      signIn,
      signUp,
      signOut,
      forgotPassword,
      resetPassword,
      loadUsers,
      approveUser,
      rejectUser,
      requestEditorRole,
      loadRoleRequests,
      approveRoleRequest,
      rejectRoleRequest,
      loadMe,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
