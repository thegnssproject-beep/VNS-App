import { useEffect, useState } from "react";
import { api } from "../lib/apiClient";
import { useAuth } from "../auth/useAuth";

export default function RoleRequestButton() {
  const { profile } = useAuth();

  const [request, setRequest] = useState(null);
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (profile?.role === "viewer") {
      loadRequest();
    } else {
      setLoading(false);
    }
  }, [profile]);

  async function loadRequest() {
    const { data } = await api.get("/role-requests/mine");
    setRequest(data?.request || null);
    setLoading(false);
  }

  async function sendRequest() {
    setSending(true);

    const { error } = await api.post("/role-requests", {
      requested_role: "editor",
    });

    if (!error) {
      loadRequest();
    }

    setSending(false);
  }

  // Don't render until profile is loaded
  if (!profile || loading) {
    return null;
  }

  // Only viewers can see this button
  if (profile.role !== "viewer") {
    return null;
  }

  return (
    <button
      className="request-access-btn"
      onClick={sendRequest}
      disabled={sending || request?.status === "pending"}
    >
      {sending
        ? "Sending..."
        : request?.status === "pending"
        ? "Request Pending"
        : "Request Edit Access"}
    </button>
  );
}
