import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Login from "./Login";
import Upload from "./Upload";
import Chat from "./pages/Chat";
import Appointments from "./pages/Appointments";

function App() {
  const [user, setUser] = useState(null);
  const [emailToSend, setEmailToSend] = useState("");
  const [emailStatus, setEmailStatus] = useState(null);

  // Listen for login state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.email) setEmailToSend(currentUser.email);
    });

    return () => unsubscribe();
  }, []);

  const handleLogout = async () => {
    await signOut(auth);
    setUser(null);
  };

  const handleSendEmail = async () => {
    const email = emailToSend.trim();
    if (!email) return;
    setEmailStatus(null);
    try {
      const res = await fetch("/api/send-welcome-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setEmailStatus("Welcome email sent to " + email);
      } else {
        setEmailStatus(data.detail || "Failed to send email.");
      }
    } catch (err) {
      setEmailStatus(err.message || "Failed to send email.");
    }
  };

  return (
    <BrowserRouter>
      <div style={{ padding: "40px", fontFamily: "Arial" }}>
        <h1>Bloodwork Analyzer</h1>

        {!user ? (
          <Login setUser={setUser} />
        ) : (
          <>
            <div style={{ marginBottom: "20px" }}>
              <p><strong>Name:</strong> {user.displayName}</p>
              <p><strong>Email:</strong> {user.email}</p>
              <button onClick={handleLogout}>Logout</button>
            </div>

            <div style={{ marginBottom: "20px" }}>
              <label style={{ display: "block", marginBottom: "6px" }}>Send welcome email to:</label>
              <input
                type="email"
                value={emailToSend}
                onChange={(e) => setEmailToSend(e.target.value)}
                placeholder="email@example.com"
                style={{ marginRight: "8px", padding: "6px 10px", width: "240px" }}
              />
              <button onClick={handleSendEmail}>Send email</button>
              {emailStatus && (
                <p style={{ marginTop: "8px", fontSize: "14px", color: emailStatus.startsWith("Welcome email sent") ? "green" : "crimson" }}>
                  {emailStatus}
                </p>
              )}
            </div>

            <nav style={{ marginBottom: "20px" }}>
              <Link to="/" style={{ marginRight: "12px" }}>Home</Link>
              <Link to="/chat" style={{ marginRight: "12px" }}>Chat</Link>
              <Link to="/appointments">Appointments</Link>
            </nav>

            <Routes>
              <Route path="/" element={<Upload />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/appointments" element={<Appointments />} />
            </Routes>
          </>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;