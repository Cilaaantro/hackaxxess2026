import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { auth } from "../firebase";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

export default function Profile() {
  const user = auth.currentUser;
  const [emailToSend, setEmailToSend] = useState(user?.email || "");
  const [emailStatus, setEmailStatus] = useState(null);
  const [reminderEmail, setReminderEmail] = useState(user?.email || "");
  const [reminderStatus, setReminderStatus] = useState(null);

  useEffect(() => {
    if (user?.email) {
      setEmailToSend(user.email);
      setReminderEmail(user.email);
    }
  }, [user?.email]);

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
    <>
      {/* Hero */}
      <section className="hero-section">
        <div className="section-label">Compassionate healthcare</div>
        <h1 className="hero-title">
          Care that <span className="accent">feels</span> like coming{" "}
          <span className="accent">home</span>
        </h1>
        <p className="hero-body">
          We believe every patient deserves warmth, attention, and dignity. Our
          team is here to guide you through every step of your health journey —
          gently and with heart.
        </p>
        <div className="hero-actions">
          <Link to="/appointments" className="btn-primary">
            Schedule a visit
          </Link>
          <Link to="/chat" className="btn-link">
            Talk to our assistant →
          </Link>
        </div>
      </section>

      {/* Account cards */}
      <div className="page-body">
        <div className="section-label">Your account</div>

        <div className="card">
          <h3>Profile</h3>
          <p>
            <strong>Name:</strong> {user?.displayName || "—"}
          </p>
          <p>
            <strong>Email:</strong> {user?.email || "—"}
          </p>
        </div>

        <div className="card">
          <h3>Send welcome email</h3>
          <p style={{ marginBottom: "0.75rem" }}>
            Send a welcome email to an address.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <input
              type="email"
              value={emailToSend}
              onChange={(e) => setEmailToSend(e.target.value)}
              placeholder="email@example.com"
            />
            <button type="button" onClick={handleSendEmail}>
              Send email
            </button>
          </div>
          {emailStatus && (
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.875rem",
                color: emailStatus.startsWith("Welcome email sent")
                  ? "var(--warm-primary)"
                  : "#b91c1c",
              }}
            >
              {emailStatus}
            </p>
          )}
        </div>

        <div className="card">
          <h3>8am medication reminder</h3>
          <p style={{ marginBottom: "0.75rem" }}>
            Get a daily email at 8am in your timezone to take your medication.
          </p>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: "0.5rem",
              alignItems: "center",
            }}
          >
            <input
              type="email"
              value={reminderEmail}
              onChange={(e) => setReminderEmail(e.target.value)}
              placeholder="your@email.com"
            />
            <button type="button" onClick={handleSubscribeReminder}>
              Subscribe
            </button>
          </div>
          {reminderStatus && (
            <p
              style={{
                marginTop: "0.5rem",
                fontSize: "0.875rem",
                color: reminderStatus.includes("Failed")
                  ? "#b91c1c"
                  : "var(--warm-primary)",
              }}
            >
              {reminderStatus}
            </p>
          )}
        </div>
      </div>
    </>
  );
}
