import { useState } from "react";
import { useAuth } from "../auth/useAuth";

export default function LoginForm({ onSwitchToSignup }) {
  const { signIn, forgotPassword, resetPassword } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // "forgot" | "reset" | null
  const [recovery, setRecovery] = useState(null);
  const [resetToken, setResetToken] = useState("");
  const [resetPassword1, setResetPassword1] = useState("");
  const [resetPassword2, setResetPassword2] = useState("");
  const [recoveryMsg, setRecoveryMsg] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");
    setSubmitting(true);

    const { error } = await signIn(email.trim(), password);

    setSubmitting(false);

    if (error) setError(error.message);
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setError("");
    setRecoveryMsg("");
    setSubmitting(true);

    const { data, error } = await forgotPassword(email.trim());
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    setRecovery("reset");
    setRecoveryMsg(
      data?.dev_token
        ? `A reset link would be emailed. (Dev mode) Token: ${data.dev_token} — paste it below to set a new password.`
        : data?.message || "If that email is registered, a reset link has been sent."
    );
  };

  const handleReset = async (e) => {
    e.preventDefault();
    setError("");
    setRecoveryMsg("");

    if (resetPassword1 !== resetPassword2) {
      setError("New passwords do not match.");
      return;
    }

    setSubmitting(true);
    const { data, error } = await resetPassword(resetToken.trim(), resetPassword1);
    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }
    setRecovery(null);
    setRecoveryMsg(data?.message || "Password updated. You can now sign in.");
    setResetToken("");
    setResetPassword1("");
    setResetPassword2("");
  };

  return (
    <div className="authshell">
      <div className="authcard authcard--split">

        <div className="auth-left">
          <div className="auth-logo">VNS</div>

          {recovery === "reset" ? (
            <>
              <h1 className="auth-title">Reset Password</h1>
              <form className="auth-form" onSubmit={handleReset}>
                {error && <div className="authmsg authmsg--error">{error}</div>}
                <div className="auth-input">
                  <input type="text" required value={resetToken} onChange={(e) => setResetToken(e.target.value)} placeholder="Reset Token" />
                </div>
                <div className="auth-input">
                  <input type="password" autoComplete="new-password" required value={resetPassword1} onChange={(e) => setResetPassword1(e.target.value)} placeholder="New Password" />
                </div>
                <div className="auth-input">
                  <input type="password" autoComplete="new-password" required value={resetPassword2} onChange={(e) => setResetPassword2(e.target.value)} placeholder="Confirm New Password" />
                </div>
                <button className="authbtn authbtn--primary" type="submit" disabled={submitting}>
                  {submitting ? "Resetting..." : "Reset Password"}
                </button>
                <div className="auth-links">
                  <button type="button" className="authlink" onClick={() => setRecovery(null)}>
                    Back to Login
                  </button>
                </div>
              </form>
            </>
          ) : recovery === "forgot" ? (
            <>
              <h1 className="auth-title">Forgot Password</h1>
              <form className="auth-form" onSubmit={handleForgot}>
                {error && <div className="authmsg authmsg--error">{error}</div>}
                <div className="auth-input">
                  <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email Address" />
                </div>
                <button className="authbtn authbtn--primary" type="submit" disabled={submitting}>
                  {submitting ? "Sending..." : "Request Reset Link"}
                </button>
                <div className="auth-links">
                  <button type="button" className="authlink" onClick={() => setRecovery(null)}>
                    Back to Login
                  </button>
                </div>
              </form>
            </>
          ) : (
            <>
              <h1 className="auth-title">Login</h1>
              <form className="auth-form" onSubmit={handleSubmit}>
                {(error || recoveryMsg) && (
                  <div className={`authmsg ${error ? "authmsg--error" : "authmsg--ok"}`}>
                    {error || recoveryMsg}
                  </div>
                )}
                <div className="auth-input">
                  <input id="login-email" type="email" autoComplete="email" required value={email}
                    onChange={(e) => setEmail(e.target.value)} placeholder="Username / Email" />
                </div>
                <div className="auth-input">
                  <input id="login-password" type="password" autoComplete="current-password" required value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="Password" />
                </div>
                <button className="authbtn authbtn--primary" type="submit" disabled={submitting}>
                  {submitting ? "Signing In..." : "Login"}
                </button>
                <div className="auth-links">
                  <button type="button" className="authlink" onClick={() => { setRecovery("forgot"); setError(""); setRecoveryMsg(""); }}>
                    Forgot password?
                  </button>
                  <button type="button" className="authlink" onClick={onSwitchToSignup}>
                    Don't have an account? Sign Up
                  </button>
                </div>
              </form>
            </>
          )}
        </div>

        <div className="auth-right">
          <div className="auth-right-content">
            <h2>VISION NAVIGATION SOFTWARE</h2>
            <p>
              Already a member?
              <br />
              Please login with your credentials.
            </p>
          </div>
        </div>

      </div>
    </div>
  );
}
