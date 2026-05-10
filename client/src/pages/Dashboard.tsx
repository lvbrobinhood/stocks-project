import { useEffect, useState } from "react";
import { supabase } from "../supabaseClient";
import type { User } from "@supabase/supabase-js";

export default function Dashboard() {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => setUser(data.user));
  }, []);

  async function logout() {
    await supabase.auth.signOut();
    window.location.href = "/login";
  }

  return (
    <main className="page-shell">
      <section className="page-heading">
        <div>
          <p className="eyebrow">Overview</p>
          <h1 className="page-title">Dashboard</h1>
          <p className="page-subtitle">
            Your account hub for portfolio tracking and stock analysis.
          </p>
        </div>
        <button className="btn secondary" onClick={logout}>Logout</button>
      </section>

      <section className="dashboard-grid">
        <article className="metric-card">
          <p className="metric-label">Session</p>
          <p className="metric-value">{user ? "Signed in" : "Signed out"}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Account</p>
          <p className="metric-value">{user?.email ?? "Not logged in"}</p>
        </article>
        <article className="metric-card">
          <p className="metric-label">Next step</p>
          <p className="metric-value">Review holdings</p>
        </article>
      </section>
    </main>
  );
}
