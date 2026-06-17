"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Aurora from "@/components/aurora";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function onSubmit(event) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password, client: "web" }),
      });

      const data = await response.json();

      if (!response.ok || !data.user) {
        setError(data.error ?? "Unable to login.");
        return;
      }

      if (data.user.role === "ADMIN") {
        router.push("/timesheets");
      } else {
        router.push("/timeclock");
      }
      router.refresh();
    } catch {
      setError("Network error.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <div className="login-aurora-wrap">
        <Aurora
          className="login-aurora"
          colorStops={["#171D22", "#8979F9", "#171D22"]}
          blend={0.72}
          amplitude={1}
          speed={0.5}
        />
      </div>
      <div className="login-backdrop-glow" aria-hidden="true" />
      <section className="card card-strong login-card">
        <div className="login-card-edge" aria-hidden="true" />
        <div className="login-card-head">
          <span className="login-mark">C</span>
          <div className="login-card-copy">
            <h1 className="headline">Citryn</h1>
            <p className="muted">Sign in to your workspace</p>
          </div>
        </div>
        <form onSubmit={onSubmit} className="login-form">
          <div className="row">
            <label className="login-input-shell">
              <span className="login-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M20 21a8 8 0 0 0-16 0" />
                  <circle cx="12" cy="8" r="4" />
                </svg>
              </span>
              <input
                type="email"
                placeholder="admin@citryn.com"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>
            <label className="login-input-shell">
              <span className="login-input-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="4" y="11" width="16" height="10" rx="2" />
                  <path d="M8 11V8a4 4 0 1 1 8 0v3" />
                </svg>
              </span>
              <input
                type={showPassword ? "text" : "password"}
                placeholder="Enter your password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
              <button
                type="button"
                className="login-password-toggle"
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                onClick={() => setShowPassword((value) => !value)}
              >
                {showPassword ? (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 3l18 18" />
                    <path d="M10.58 10.58a2 2 0 0 0 2.84 2.84" />
                    <path d="M9.88 4.24A10.94 10.94 0 0 1 12 4c7 0 10 8 10 8a17.46 17.46 0 0 1-2.31 3.19" />
                    <path d="M6.61 6.61A17.34 17.34 0 0 0 2 12s3 8 10 8a9.76 9.76 0 0 0 5.39-1.61" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M2 12s3-8 10-8 10 8 10 8-3 8-10 8-10-8-10-8Z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                )}
              </button>
            </label>
            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
        <div className="login-card-divider" aria-hidden="true" />
        <p className="login-help">
          If you need help logging in,
          <br />
          please contact admin at <a href="mailto:citrynmarketing@gmail.com">citrynmarketing@gmail.com</a>.
        </p>
        {error ? <p className="error space-top">{error}</p> : null}
      </section>
    </main>
  );
}
