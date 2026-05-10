import { NavLink, useNavigate } from "react-router-dom";
import { supabase } from "../../supabaseClient";
import "./Header.css";

export default function Header() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    localStorage.clear();
    navigate("/login");
  };

  return (
    <header className="app-header">
      <NavLink to="/dashboard" className="brand-link">
        <span className="brand-mark">S</span>
        <span>StockSpace</span>
      </NavLink>

      <nav className="header-nav" aria-label="Main navigation">
        <NavLink to="/dashboard" className="header-link">
          Dashboard
        </NavLink>
        <NavLink to="/portfolio" className="header-link">
          Portfolio
        </NavLink>
        <NavLink to="/analysis" className="header-link">
          Analysis
        </NavLink>
        <button className="header-action" type="button" onClick={handleLogout}>
          Logout
        </button>
      </nav>
    </header>
  );
}
