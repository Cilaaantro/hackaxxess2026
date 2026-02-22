import { useState, useEffect } from "react";
import { BrowserRouter, Routes, Route, Link } from "react-router-dom";
import { auth } from "./firebase";
import { onAuthStateChanged, signOut } from "firebase/auth";
import Login from "./Login";
import Upload from "./Upload";
import Chat from "./pages/Chat";
import Appointments from "./pages/Appointments";
import BackgroundInfo from "./pages/BackgroundInfo.jsx";

function App() {
  const [user, setUser] = useState(null);
  const [emailToSend, setEmailToSend] = useState("");
  const [emailStatus, setEmailStatus] = useState(null);
  const [reminderEmail, setReminderEmail] = useState("");
  const [reminderStatus, setReminderStatus] = useState(null);

  // Listen for login state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      if (currentUser?.email) {
        setEmailToSend(currentUser.email);
        setReminderEmail(currentUser.email);
      }
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

  const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

  const handleSubscribeReminder = async () => {
    const email = reminderEmail.trim();
    if (!email) return;
    setReminderStatus(null);
    try {
      const res = await fetch("/api/subscribe-medication-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, time_zone: timeZone }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setReminderStatus(data.message || "Subscribed!");
      } else {
        setReminderStatus(data.detail || "Failed to subscribe.");
      }
    } catch (err) {
      setReminderStatus(err.message || "Failed to subscribe.");
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

            <div style={{ marginBottom: "20px", padding: "12px", background: "#f5f5f5", borderRadius: "8px", maxWidth: "420px" }}>
              <p style={{ marginBottom: "8px", fontWeight: 500 }}>8am medication reminder</p>
              <p style={{ fontSize: "14px", color: "#555", marginBottom: "10px" }}>
                Get a daily email at 8am in your timezone to remind you to take your medication.
              </p>
              <input
                type="email"
                value={reminderEmail}
                onChange={(e) => setReminderEmail(e.target.value)}
                placeholder="your@email.com"
                style={{ marginRight: "8px", padding: "6px 10px", width: "240px" }}
              />
              <button onClick={handleSubscribeReminder}>Subscribe</button>
              {reminderStatus && (
                <p style={{ marginTop: "8px", fontSize: "14px", color: reminderStatus.includes("Failed") ? "crimson" : "green" }}>
                  {reminderStatus}
                </p>
              )}
            </div>

            <nav style={{ marginBottom: "20px" }}>
              <Link to="/" style={{ marginRight: "12px" }}>Home</Link>
              <Link to="/chat" style={{ marginRight: "12px" }}>Chat</Link>
              <Link to="/appointments">Appointments</Link>
              <Link to="/background-info">Background Info</Link>
            </nav>

            <Routes>
              <Route path="/" element={<Upload />} />
              <Route path="/chat" element={<Chat />} />
              <Route path="/appointments" element={<Appointments />} />
              <Route path="/background-info" element={<BackgroundInfo /> } />
            </Routes>
          </>
        )}
      </div>
    </BrowserRouter>
  );
}

export default App;