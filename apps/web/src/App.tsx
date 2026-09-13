import { useEffect, useState } from "react";
import { Navigate, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { isLoggedIn, isOwner, logout, apiFetch } from "./api/client";
import LoginPage from "./pages/LoginPage";
import CreatorsListPage from "./pages/CreatorsListPage";
import CreatorDetailPage from "./pages/CreatorDetailPage";
import DashboardPage from "./pages/DashboardPage";
import GlobalRulesPage from "./pages/GlobalRulesPage";
import AdminUsersPage from "./pages/AdminUsersPage";

function RequireOwner({ children }: { children: JSX.Element }) {
  if (!isOwner()) return <Navigate to="/creators" replace />;
  return children;
}

function RequireAuth({ children }: { children: JSX.Element }) {
  if (!isLoggedIn()) return <Navigate to="/login" replace />;
  return children;
}

function LicenseBanner() {
  const [status, setStatus] = useState<any>(null);

  useEffect(() => {
    apiFetch("/admin/creators/license-status").then(setStatus).catch(() => {});
  }, []);

  if (!status?.configured || status.usable) return null; // niente banner se non è un'installazione con licenza, o se è valida

  return (
    <div style={{ background: "#7f1d1d", color: "#fff", padding: "10px 20px", fontSize: 13, textAlign: "center" }}>
      ⚠️ Licenza non valida: {status.reason ?? "verifica in corso"}. I bot sono fermi finché non viene risolto — contatta chi ti ha venduto Nugis.
    </div>
  );
}

export default function App() {
  const navigate = useNavigate();
  const location = useLocation();

  if (!isLoggedIn()) {
    return (
      <Routes>
        <Route path="*" element={<LoginPage />} />
      </Routes>
    );
  }

  const isCreatorsActive = location.pathname.startsWith("/creators");
  const isGlobalRulesActive = location.pathname.startsWith("/global-rules");
  const isDashboardActive = location.pathname.startsWith("/dashboard");
  const isUsersActive = location.pathname.startsWith("/users");
  const owner = isOwner();

  return (
    <div className="app-shell" style={{ flexDirection: "column", display: "flex" }}>
      <LicenseBanner />
    <div style={{ display: "flex", flex: 1, minHeight: 0 }}>
      <div className="sidebar">
        <div className="sidebar-header">
          <div className="sidebar-logo-icon">N</div>
          <div>
            <h3 className="sidebar-title">Nugis</h3>
            <span className="muted" style={{ fontSize: "11px" }}>Admin Platform</span>
          </div>
        </div>

        <nav className="sidebar-nav">
          <a
            href="/creators"
            className={isCreatorsActive ? "active" : ""}
            onClick={(e) => { e.preventDefault(); navigate("/creators"); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M22 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
            <span>Creators Hub</span>
          </a>
          {owner && (
            <a
              href="/global-rules"
              className={isGlobalRulesActive ? "active" : ""}
              onClick={(e) => { e.preventDefault(); navigate("/global-rules"); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              <span>Regole Standard Globali</span>
            </a>
          )}
          {owner && (
            <a
              href="/dashboard"
              className={isDashboardActive ? "active" : ""}
              onClick={(e) => { e.preventDefault(); navigate("/dashboard"); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"></polyline></svg>
              <span>Coda & System Logs</span>
            </a>
          )}
          {owner && (
            <a
              href="/users"
              className={isUsersActive ? "active" : ""}
              onClick={(e) => { e.preventDefault(); navigate("/users"); }}
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle><path d="M23 21v-2a4 4 0 0 0-3-3.87"></path><path d="M16 3.13a4 4 0 0 1 0 7.75"></path></svg>
              <span>Utenti & Chatter</span>
            </a>
          )}
        </nav>

        <div className="sidebar-footer">
          <a
            href="#"
            style={{ color: "var(--danger)" }}
            onClick={async (e) => { e.preventDefault(); await logout(); navigate("/login"); window.location.reload(); }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"></path><polyline points="16 17 21 12 16 7"></polyline><line x1="21" y1="12" x2="9" y2="12"></line></svg>
            <span>Logout</span>
          </a>
        </div>
      </div>

      <div className="main">
        <Routes>
          <Route path="/" element={<Navigate to="/creators" replace />} />
          <Route path="/login" element={<Navigate to="/creators" replace />} />
          <Route path="/creators" element={<RequireAuth><CreatorsListPage /></RequireAuth>} />
          <Route path="/creators/:id" element={<RequireAuth><CreatorDetailPage /></RequireAuth>} />
          <Route path="/global-rules" element={<RequireAuth><RequireOwner><GlobalRulesPage /></RequireOwner></RequireAuth>} />
          <Route path="/dashboard" element={<RequireAuth><RequireOwner><DashboardPage /></RequireOwner></RequireAuth>} />
          <Route path="/users" element={<RequireAuth><RequireOwner><AdminUsersPage /></RequireOwner></RequireAuth>} />
        </Routes>
      </div>
    </div>
    </div>
  );
}

