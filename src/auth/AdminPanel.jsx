import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/apiClient";
import "./admin.css";
import { useAuth } from "../auth/useAuth";

export default function AdminPanel({ onClose }) {
  const {
    user,
    loadRoleRequests,
    approveRoleRequest,
    rejectRoleRequest,
    loadUsers,
    approveUser,
    rejectUser,
  } = useAuth();

  const [profiles, setProfiles] = useState([]);
  const [requests, setRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    load();
  }, []);

  async function load() {
    setLoading(true);
    setError("");

    const { data, error } = await loadUsers();

    if (error) {
      setError(error.message);
    } else {
      setProfiles(data.users);
    }

    const requestResult = await loadRoleRequests();

    if (!requestResult.error) {
      setRequests(
        requestResult.data.requests.filter(
          (r) => r.status === "pending"
        )
      );
    }

    setLoading(false);
  }

  async function changeRole(id, role) {
    setSavingId(id);

    const { error } = await api.patch(`/admin/users/${id}`, { role });

    if (error) {
      setError(error.message);
    } else {
      setProfiles((current) =>
        current.map((p) =>
          p.id === id ? { ...p, role } : p
        )
      );
    }

    setSavingId(null);
  }

  async function approveNewUser(profile) {
    setSavingId(profile.id);
    const { error } = await approveUser(profile.id, profile.role || "viewer");
    setSavingId(null);
    if (error) setError(error.message);
    else await load();
  }

  async function rejectNewUser(profile) {
    setSavingId(profile.id);
    const { error } = await rejectUser(profile.id);
    setSavingId(null);
    if (error) setError(error.message);
    else await load();
  }

  async function approve(request) {
    await approveRoleRequest(request);
    await load();
  }

  async function reject(request) {
    await rejectRoleRequest(request);
    await load();
  }

  const filteredProfiles = useMemo(() => {
    return profiles.filter((profile) =>
      profile.email
        ?.toLowerCase()
        .includes(search.toLowerCase())
    );
  }, [profiles, search]);

  const totalEditors = profiles.filter(
    (p) => p.role === "editor"
  ).length;

  const totalViewers = profiles.filter(
    (p) => p.role === "viewer"
  ).length;

  const pendingAccounts = profiles.filter(
    (p) => p.status === "pending"
  );

  return (
    <div
      className="authoverlay authshell"
      onClick={(e) =>
        e.target === e.currentTarget && onClose()
      }
    >
      <div
        className="authcard admin-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <button
          className="authoverlay-close"
          onClick={onClose}
        >
          ×
        </button>

        {/* HEADER */}

        <div className="admin-header">

          <div className="authcard__mark">
            <span className="authcard__mark-dot" />
            <span className="authcard__mark-text">
              VNS • Admin Dashboard
            </span>
          </div>

          <h1 className="admin-title">
            User Management
          </h1>

          <p className="admin-subtitle">
            Manage registered users, assign
            editor permissions, and approve
            pending access requests.
          </p>

        </div>

        {/* STATS */}

        <div className="admin-stats">

          <div className="admin-stat-card">
            <h3>{profiles.length}</h3>
            <span>Total Users</span>
          </div>

          <div className="admin-stat-card">
            <h3>{pendingAccounts.length + requests.length}</h3>
            <span>Pending Approvals</span>
          </div>

          <div className="admin-stat-card">
            <h3>{totalEditors}</h3>
            <span>Editors</span>
          </div>

          <div className="admin-stat-card">
            <h3>{totalViewers}</h3>
            <span>Viewers</span>
          </div>

        </div>

        {error && (
          <div className="authmsg authmsg--error">
            {error}
          </div>
        )}

        {loading ? (
          <div className="admin-loading">
            Loading users...
          </div>
        ) : (
          <>
            {/* USERS */}

            <div className="admin-section">

              <div className="admin-toolbar">

                <h2>Registered Users</h2>

                <input
                  type="text"
                  placeholder="Search by email..."
                  value={search}
                  onChange={(e) =>
                    setSearch(e.target.value)
                  }
                />

              </div>
<div className="admin-table-container">
    <table className="admintable">
      <thead>
        <tr>
          <th>Email</th>
          <th>Role</th>
          <th>Status</th>
        </tr>
      </thead>
      <tbody>
        {filteredProfiles.map((profile) => (
          <tr key={profile.id}>
            <td>
              {profile.email}
              {profile.id === user.id && (
                <span className="admin-you">• You</span>
              )}
            </td>
            <td>
              <select
                value={profile.role}
                disabled={savingId === profile.id || profile.id === user.id}
                onChange={(e) => changeRole(profile.id, e.target.value)}
              >
                <option value="viewer">Viewer</option>
                <option value="editor">Editor</option>
                <option value="admin">Admin</option>
              </select>
            </td>
            <td>
              {profile.locked_until && new Date(profile.locked_until) > new Date() ? (
                <span className="admintable__lock">🔒 Locked</span>
              ) : profile.status === "pending" ? (
                <span className="admintable__pending">● Pending</span>
              ) : profile.status === "rejected" ? (
                <span className="admintable__rejected">● Rejected</span>
              ) : (
                <span className="admintable__active">● Active</span>
              )}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>

</div>

            {/* PENDING NEW ACCOUNTS (Task 2c) */}

            <div className="admin-section">

              <h2>Pending New Accounts</h2>

              <p className="admin-subtitle">
                New sign-ups must be approved before they can sign in.
              </p>

              {pendingAccounts.length === 0 ? (

                <div className="admin-empty">
                  No accounts awaiting approval.
                </div>

              ) : (

                pendingAccounts.map((profile) => (

                  <div
                    className="request-card"
                    key={profile.id}
                  >

                    <div>

                      <strong>
                        {profile.full_name || profile.email}
                      </strong>

                      <p>
                        {profile.email}
                      </p>

                      <select
                        className="admin-role-select"
                        value={profile.role}
                        disabled={savingId === profile.id}
                        onChange={(e) =>
                          setProfiles((current) =>
                            current.map((p) =>
                              p.id === profile.id ? { ...p, role: e.target.value } : p
                            )
                          )
                        }
                      >
                        <option value="viewer">Viewer</option>
                        <option value="editor">Editor</option>
                        <option value="admin">Admin</option>
                      </select>

                    </div>

                    <div className="request-actions">

                      <button
                        className="authbtn authbtn--primary"
                        disabled={savingId === profile.id}
                        onClick={() => approveNewUser(profile)}
                      >
                        Approve
                      </button>

                      <button
                        className="authbtn authbtn--danger"
                        disabled={savingId === profile.id}
                        onClick={() => rejectNewUser(profile)}
                      >
                        Reject
                      </button>

                    </div>

                  </div>

                ))

              )}

            </div>

            {/* REQUESTS */}

            <div className="admin-section">

              <h2>Pending Editor Requests</h2>

              {requests.length === 0 ? (

                <div className="admin-empty">
                  No pending requests.
                </div>

              ) : (

                requests.map((request) => (

                  <div
                    className="request-card"
                    key={request.id}
                  >

                    <div>

                      <strong>
                        {request.user_email}
                      </strong>

                      <p>
                        Requested role:
                        <strong> Editor</strong>
                      </p>

                    </div>

                    <div className="request-actions">

                      <button
                        className="authbtn authbtn--primary"
                        onClick={() =>
                          approve(request)
                        }
                      >
                        Approve
                      </button>

                      <button
                        className="authbtn authbtn--ghost"
                        onClick={() =>
                          reject(request)
                        }
                      >
                        Reject
                      </button>

                    </div>

                  </div>

                ))

              )}

            </div>

          </>
        )}
      </div>
    </div>
  );
}