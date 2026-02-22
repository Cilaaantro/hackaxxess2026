import { useState, useRef, useEffect } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { signOut } from "firebase/auth";
import { auth } from "../firebase";

const MY_HEALTH_PATHS = ["/upload", "/symptoms", "/background-info"];

export default function Layout({ user }) {
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef(null);
  const location = useLocation();

  const isMyHealthActive = MY_HEALTH_PATHS.some((p) =>
    location.pathname.startsWith(p)
  );

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e) {
      if (dropRef.current && !dropRef.current.contains(e.target)) {
        setDropOpen(false);
      }
    }
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Close dropdown on navigation
  useEffect(() => {
    setDropOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await signOut(auth);
  };

  return (
    <div className="app-shell">
      <header className="app-topbar">
        <div className="topbar-inner">
          <NavLink to="/" end className="topbar-logo">
            Health <em>Bridge</em>
          </NavLink>

          <nav className="topbar-nav">
            <NavLink to="/" end>Home</NavLink>
            <NavLink to="/dashboard">Dashboard</NavLink>
            <NavLink to="/chat">Assistant</NavLink>
            <NavLink to="/appointments">Appointments</NavLink>

            {/* My Health dropdown */}
            <div className="topbar-dropdown" ref={dropRef}>
              <button
                type="button"
                className={`topbar-nav-drop-btn${isMyHealthActive ? " active" : ""}`}
                onClick={() => setDropOpen((o) => !o)}
                aria-haspopup="true"
                aria-expanded={dropOpen}
              >
                My Health
                <svg
                  className={`drop-chevron${dropOpen ? " open" : ""}`}
                  width="12" height="12" viewBox="0 0 12 12" fill="none"
                  aria-hidden="true"
                >
                  <path d="M2 4l4 4 4-4" stroke="currentColor" strokeWidth="1.6"
                    strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </button>

              {dropOpen && (
                <div className="topbar-drop-menu">
                  <NavLink to="/upload" className="topbar-drop-item">
                    <span className="drop-item-icon">📄</span>
                    <span>
                      <span className="drop-item-label">Upload files</span>
                      <span className="drop-item-hint">Analyze bloodwork PDFs</span>
                    </span>
                  </NavLink>
                  <NavLink to="/symptoms" className="topbar-drop-item">
                    <span className="drop-item-icon">🩺</span>
                    <span>
                      <span className="drop-item-label">Symptoms</span>
                      <span className="drop-item-hint">Track your symptom checklist</span>
                    </span>
                  </NavLink>
                  <NavLink to="/background-info" className="topbar-drop-item">
                    <span className="drop-item-icon">📋</span>
                    <span>
                      <span className="drop-item-label">Background info</span>
                      <span className="drop-item-hint">Medical history &amp; medications</span>
                    </span>
                  </NavLink>
                </div>
              )}
            </div>
          </nav>

          <div className="topbar-user">
            <span className="topbar-name">{user?.displayName || "User"}</span>
            <button type="button" className="topbar-logout" onClick={handleLogout}>
              Sign out
            </button>
          </div>
        </div>
      </header>

      <main className="app-main">
        <Outlet />
      </main>
    </div>
  );
}
