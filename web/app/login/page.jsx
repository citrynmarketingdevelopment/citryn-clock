"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
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
      <div className="card card-strong login-card">
        <div style={{ marginBottom: 16 }}>
          <span className="login-mark">C</span>
          <h1 className="headline">Citryn Clock</h1>
          <p className="muted">Sign in to your workspace</p>
        </div>
        <form onSubmit={onSubmit}>
          <div className="row">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
            />
            <button type="submit" disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
        {error ? <p className="error space-top">{error}</p> : null}
      </div>
    </main>
  );
}
