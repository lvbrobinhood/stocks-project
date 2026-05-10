import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);

    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) {
      setErr(error.message);
      return;
    }

    nav("/dashboard");
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Welcome back</p>
        <h1 className="auth-title">Log in</h1>
        <p className="auth-copy">
          Track holdings, prices, and performance from one focused workspace.
        </p>

        <form className="auth-form" onSubmit={onSubmit}>
          <label className="field">
            <span>Email</span>
            <input
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </label>

          <label className="field">
            <span>Password</span>
            <input
              placeholder="Your password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className="btn" type="submit">Login</button>
      </form>

        {err && <p className="error">{err}</p>}
        <p className="auth-footer">
          New here? <Link to="/signup">Create an account</Link>
        </p>
      </section>
    </main>
  );
}
