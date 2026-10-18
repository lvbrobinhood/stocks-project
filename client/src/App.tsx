import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import Landing from "./pages/landing/Landing";
import Signup from "./pages/signup/Signup";
import Login from "./pages/login/Login";
import Dashboard from "./pages/dashboard/Dashboard";
import Portfolio from "./pages/portfolio/Portfolio";
import Analysis from "./pages/analysis/Analysis";
import DCF from "./pages/dcf/DCF";
import Header from "./components/Header";
import "./App.css";

const PUBLIC_ROUTES = new Set(["/", "/login", "/signup"]);

function Shell() {
  const { pathname } = useLocation();
  const showHeader = !PUBLIC_ROUTES.has(pathname);

  return (
    <>
      {showHeader && <Header />}
      <Routes>
        <Route path="/" element={<Landing />} />
        <Route path="/signup" element={<Signup />} />
        <Route path="/login" element={<Login />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/portfolio" element={<Portfolio />} />
        <Route path="/analysis" element={<Analysis />} />
        <Route path="/dcf" element={<DCF />} />
      </Routes>
    </>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <Shell />
    </BrowserRouter>
  );
}
