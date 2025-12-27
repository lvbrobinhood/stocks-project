import React, { useEffect, useState } from "react";
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
    <div>
      <h2>Dashboard</h2>
      <p>{user ? `Logged in as ${user.email}` : "Not logged in"}</p>
      <button onClick={logout}>Logout</button>
    </div>
  );
}
