import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import "./Header.css";

export default function Header() {
  const navigate = useNavigate();
  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear(); 
    navigate("/Login")
  }
  return (
    <>
      <header>
        <div className = "container">
          <div className="container right">       
            <Link to ="./dashboard" className ="header-links right-border">Dashboard </Link>
            <Link to ="./portfolio" className = "header-links right-border">Portfolio </Link>
            <Link to ="./analysis" className = "header-links right-border">Analysis </Link>
            <Link to ="./login" className="header-links" onClick={handleLogout}>Logout </Link>
            <div></div>
          </div>
        </div>
      </header>
    </>
  );
}