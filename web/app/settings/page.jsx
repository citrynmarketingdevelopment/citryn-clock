"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import WorkspaceShell from "@/components/workspace-shell";

async function parseJsonSafe(response) {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { error: "Unexpected response." };
  }
}

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const loadUser = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/me", { cache: "no-store" });
      if (!response.ok) {
        router.push("/login");
        return;
      }
      const data = await parseJsonSafe(response);
      setUser(data.user ?? null);
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    loadUser();
  }, [loadUser]);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }

  return (
    <WorkspaceShell user={user} onLogout={logout} initialSettingsOpen={!loading} initialSettingsPage="account">
      <section className="card">
        <p className="muted">Opening settings...</p>
      </section>
    </WorkspaceShell>
  );
}
