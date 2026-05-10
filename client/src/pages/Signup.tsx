import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { Link, useNavigate } from "react-router-dom";

export default function Signup() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const nav = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setErr(null);
    setMsg(null);

    const { error } = await supabase.auth.signUp({ email, password });
    if (error) {
      setErr(error.message);
      return;
    }

    setMsg("Signed up! If email confirmation is enabled, check your inbox.");
    nav("/dashboard");
  }

  return (
    <main className="auth-page">
      <section className="auth-panel">
        <p className="eyebrow">Start tracking</p>
        <h1 className="auth-title">Create account</h1>
        <p className="auth-copy">
          Build a portfolio, save your holdings, and compare cost basis against current prices.
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
              placeholder="Choose a password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </label>

          <button className="btn" type="submit">Create account</button>
        </form>

        {err && <p className="error">{err}</p>}
        {msg && <p className="notice">{msg}</p>}
        <p className="auth-footer">
          Already have an account? <Link to="/login">Return to login</Link>
        </p>
      </section>
    </main>
  );
}
