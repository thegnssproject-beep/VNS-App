import { useState } from "react";
import { useAuth } from "../auth/useAuth";

export default function UserMenu() {
  const { user, role, signOut } = useAuth();
  const [open, setOpen] = useState(false);

  return (
    <div className="usermenu">
      <button className="usermenu__trigger" onClick={() => setOpen((o) => !o)}>
        <span className="usermenu__role">{role || "…"}</span>
      </button>
      {open && (
        <div className="usermenu__dropdown" onMouseLeave={() => setOpen(false)}>
          <div className="usermenu__email">{user?.email}</div>
          <button
            className="usermenu__item usermenu__item--danger"
            onClick={signOut}
          >
            Sign out
          </button>
        </div>
      )}
    </div>
  );
}
