import React, { useState } from "react";
import { supabase } from "../supabaseClient";
import { useNavigate } from "react-router-dom";

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
    <div style={{ maxWidth: 360 }}>
      <h2>Sign up</h2>
      <form onSubmit={onSubmit}>
        <input
          placeholder="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <br />
        <input
          placeholder="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />
        <br />
        <button type="submit">Create account</button>
      </form>

      {err && <p style={{ color: "crimson" }}>{err}</p>}
      {msg && <p>{msg}</p>}
    </div>
  );
}
