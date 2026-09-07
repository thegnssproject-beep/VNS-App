import { useState } from "react";
import { useAuth } from "../auth/useAuth";

export default function SignupForm({ onSwitchToLogin }) {

  const { signUp } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();

    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    const { data, error } = await signUp(email.trim(), password, name.trim());

    setSubmitting(false);

    if (error) {
      setError(error.message);
      return;
    }

    // Task 2c: new accounts are 'pending' — the user is NOT auto-logged-in.
    // Show the waiting message instead of entering the app.
    if (data?.pending) {
      setPending(true);
    }
  };

  if (pending) {
    return (
      <div className="authshell">
        <div className="authcard authcard--split">
          <div className="auth-left">
            <div className="auth-logo">VNS</div>
            <h1 className="auth-title">Approval Required</h1>
            <p className="authmsg" style={{ marginBottom: 16, lineHeight: 1.5 }}>
              Your account has been created and is currently{" "}
              <strong>pending admin approval</strong>. An administrator must
              approve your account before you can sign in.
            </p>
            <button
              className="authlink"
              type="button"
              onClick={() => { setPending(false); setName(""); setEmail(""); setPassword(""); setConfirmPassword(""); }}
            >
              Create another account
            </button>
          </div>
          <div className="auth-right">
            <div className="auth-right-content">
              <h2>JOIN VNS</h2>
              <p>Create your account and start using Vision Navigation Software.</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="authshell">

      <div className="authcard authcard--split">

        {/* LEFT */}

        <div className="auth-left">

          <div className="auth-logo">
            VNS
          </div>

          <h1 className="auth-title">
            Sign Up
          </h1>

          <form
            className="auth-form"
            onSubmit={handleSubmit}
          >

            {error &&
              <div className="authmsg authmsg--error">
                {error}
              </div>
            }

            <div className="auth-input">

              <input
                type="text"
                placeholder="Full Name"
                required
                value={name}
                onChange={(e)=>setName(e.target.value)}
              />

            </div>

            <div className="auth-input">

              <input
                type="email"
                placeholder="Email Address"
                required
                value={email}
                onChange={(e)=>setEmail(e.target.value)}
              />

            </div>

            <div className="auth-input">

              <input
                type="password"
                placeholder="Password"
                required
                value={password}
                onChange={(e)=>setPassword(e.target.value)}
              />

            </div>

            <div className="auth-input">

              <input
                type="password"
                placeholder="Confirm Password"
                required
                value={confirmPassword}
                onChange={(e)=>setConfirmPassword(e.target.value)}
              />

            </div>

            <button
              className="authbtn authbtn--primary"
              type="submit"
              disabled={submitting}
            >
              {submitting ? "Creating Account..." : "Create Account"}
            </button>

            <div className="auth-links">

              <button
                type="button"
                className="authlink"
                onClick={onSwitchToLogin}
              >
                Already have an account? Login
              </button>

            </div>

          </form>

        </div>

        {/* RIGHT */}

        <div className="auth-right">

          <div className="auth-right-content">

            <h2>
              JOIN VNS
            </h2>

            <p>
              Create your account and start using
              <br />
              Vision Navigation Software.
            </p>
          


          </div>

        </div>

      </div>

    </div>
  );

}