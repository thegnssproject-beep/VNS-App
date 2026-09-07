import { useState } from "react";
import "./auth.css";
import { useAuth } from "../auth/useAuth";
import LoginForm from "./LoginForm";
import SignupForm from "./SignupForm";

// screens shown before a session exists
const SCREEN = {
  LOGIN: "login",
  SIGNUP: "signup",
};

export default function AuthGate({ children }) {
  const { session, loading } = useAuth();
  const [screen, setScreen] = useState(SCREEN.LOGIN);

  if (loading) {
    return (
      <div className="authshell">
        <p style={{ color: "var(--text-muted)", fontSize: 13 }}>Loading…</p>
      </div>
    );
  }

  // --- Not signed in at all -------------------------------------------------
  if (!session) {
    return (
      <div className="authshell">
        {screen === SCREEN.LOGIN && (
          <LoginForm onSwitchToSignup={() => setScreen(SCREEN.SIGNUP)} />
        )}
        {screen === SCREEN.SIGNUP && (
          <SignupForm onSwitchToLogin={() => setScreen(SCREEN.LOGIN)} />
        )}
      </div>
    );
  }

  return children;
}
