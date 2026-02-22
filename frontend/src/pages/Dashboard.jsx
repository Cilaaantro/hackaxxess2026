import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { auth, firestore } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

// ── Mini chatbot ──────────────────────────────────────────────────────────────
function ChatWidget() {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [userContext, setUserContext] = useState({});
  const endRef = useRef(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  // Fetch patient context once on mount
  useEffect(() => {
    const fetchContext = async () => {
      const user = auth.currentUser;
      if (!user) return;
      try {
        const [userSnap, bgSnap] = await Promise.all([
          getDoc(doc(firestore, "users", user.uid)),
          getDoc(doc(firestore, "users", user.uid, "backgroundInfo", "info")),
        ]);
        setUserContext({
          biomarkers: userSnap.exists() ? (userSnap.data().biomarkers || null) : null,
          backgroundInfo: bgSnap.exists() ? bgSnap.data() : null,
        });
      } catch (e) {
        console.warn("Could not load patient context:", e);
      }
    };
    fetchContext();
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput("");
    const userMsg = { role: "user", content: text };
    setMessages((p) => [...p, userMsg]);
    setLoading(true);
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [...messages, userMsg].map((m) => ({ role: m.role, content: m.content })),
          user_context: userContext,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Chat failed");
      setMessages((p) => [...p, { role: "assistant", content: data.message }]);
    } catch (err) {
      setMessages((p) => [...p, { role: "assistant", content: "Sorry, something went wrong. Please try again." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="widget widget--chat">
      <div className="widget-header">
        <span className="widget-icon">💬</span>
        <div>
          <h3 className="widget-title">AI Assistant</h3>
          <p className="widget-subtitle">Ask about your health</p>
        </div>
        <Link to="/chat" className="widget-link">Full chat →</Link>
      </div>

      <div className="chat-widget-messages">
        {messages.length === 0 && (
          <div className="chat-widget-empty">
            <p>Hi {auth.currentUser?.displayName?.split(" ")[0] || "there"} 👋 How can I help you today?</p>
          </div>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-widget-msg chat-widget-msg--${m.role}`}>
            {m.content}
          </div>
        ))}
        {loading && (
          <div className="chat-widget-msg chat-widget-msg--assistant">
            <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
          </div>
        )}
        <div ref={endRef} />
      </div>

      <div className="chat-widget-input-row">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && send()}
          placeholder="Type a message…"
          disabled={loading}
          className="chat-widget-input"
        />
        <button
          type="button"
          onClick={send}
          disabled={loading || !input.trim()}
          className="chat-widget-send"
        >
          ➤
        </button>
      </div>
    </div>
  );
}

// ── Medication reminder widget ────────────────────────────────────────────────
function ReminderWidget() {
  const user = auth.currentUser;
  const [email, setEmail] = useState(user?.email || "");
  const [time, setTime] = useState("08:00");
  const [status, setStatus] = useState(null);
  const [subscribed, setSubscribed] = useState(false);

  const subscribe = async () => {
    const em = email.trim();
    if (!em) return;
    setStatus(null);
    const [hourStr, minStr] = time.split(":");
    const remind_hour = parseInt(hourStr, 10);
    const remind_minute = parseInt(minStr, 10);
    try {
      const res = await fetch("/api/subscribe-medication-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: em, time_zone: timeZone, remind_hour, remind_minute }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setSubscribed(true);
        setStatus({ ok: true, msg: data.message || "Reminder set!" });
      } else {
        setStatus({ ok: false, msg: data.detail || "Failed to subscribe." });
      }
    } catch (err) {
      setStatus({ ok: false, msg: err.message || "Failed." });
    }
  };

  // Format display time for success state
  const [h, m] = time.split(":").map(Number);
  const displayTime = `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;

  return (
    <div className="widget widget--reminder">
      <div className="widget-header">
        <span className="widget-icon">💊</span>
        <div>
          <h3 className="widget-title">Medication reminder</h3>
          <p className="widget-subtitle">Daily email at your chosen time</p>
        </div>
      </div>

      {subscribed ? (
        <div className="reminder-success">
          <div className="reminder-success-icon">✓</div>
          <p className="reminder-success-text">
            Reminder set for <strong>{displayTime}</strong> daily.<br />
            We'll email <strong>{email}</strong> every day.
          </p>
        </div>
      ) : (
        <>
          <p className="widget-body">
            Choose a time and we'll send you a daily nudge to take your medication.
          </p>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="your@email.com"
            style={{ maxWidth: "none" }}
          />
          <div className="reminder-time-row">
            <label className="reminder-time-label">Remind me at</label>
            <input
              type="time"
              value={time}
              onChange={(e) => setTime(e.target.value)}
              className="reminder-time-input"
            />
          </div>
          <button
            type="button"
            onClick={subscribe}
            style={{ borderRadius: "var(--warm-radius-pill)" }}
          >
            Set reminder
          </button>
          {status && (
            <p className={status.ok ? "status-ok" : "status-err"} style={{ marginTop: "0.25rem" }}>
              {status.msg}
            </p>
          )}
        </>
      )}
    </div>
  );
}

// ── Next appointment widget ───────────────────────────────────────────────────
function AppointmentWidget() {
  const [next, setNext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const start = new Date().toISOString().slice(0, 10);
    const end = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
    fetch(`/api/available-slots?start=${start}&end=${end}&time_zone=${encodeURIComponent(timeZone)}`)
      .then((r) => r.json())
      .then((data) => {
        const slots = data.slots || data;
        const firstDate = Object.keys(slots || {}).sort()[0];
        const firstSlots = firstDate && slots[firstDate];
        if (firstSlots?.length) {
          const s = firstSlots[0];
          setNext({ date: firstDate, time: typeof s === "object" ? s.start : s });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const formatDate = (d) => {
    const dt = new Date(d + "T12:00:00");
    return dt.toLocaleDateString(undefined, { weekday: "long", month: "short", day: "numeric" });
  };
  const formatTime = (iso) => {
    const dt = new Date(iso);
    return dt.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
  };

  return (
    <div className="widget widget--appointment">
      <div className="widget-header">
        <span className="widget-icon">📅</span>
        <div>
          <h3 className="widget-title">Next available slot</h3>
          <p className="widget-subtitle">Mon–Fri, 9am–5pm</p>
        </div>
        <Link to="/appointments" className="widget-link">Book now →</Link>
      </div>

      {loading ? (
        <p className="status-info" style={{ margin: 0 }}>Checking availability…</p>
      ) : next ? (
        <div className="appt-next">
          <div className="appt-next-date">{formatDate(next.date)}</div>
          <div className="appt-next-time">{formatTime(next.time)}</div>
          <Link to="/appointments" className="appt-book-btn">
            Book this slot →
          </Link>
        </div>
      ) : (
        <div className="appt-empty">
          <p>No slots available in the next 2 weeks.</p>
          <Link to="/appointments">View appointments →</Link>
        </div>
      )}
    </div>
  );
}

// ── Quick nav widget ──────────────────────────────────────────────────────────
function QuickNavWidget() {
  const links = [
    { to: "/upload",          icon: "📄", label: "Upload files",      hint: "Analyze a PDF" },
    { to: "/symptoms",        icon: "🩺", label: "Log symptoms",       hint: "Update checklist" },
    { to: "/background-info", icon: "📋", label: "Health history",     hint: "Medical background" },
    { to: "/appointments",    icon: "📅", label: "Appointments",       hint: "Book a visit" },
  ];
  return (
    <div className="widget widget--quicknav">
      <div className="widget-header">
        <span className="widget-icon">⚡</span>
        <div>
          <h3 className="widget-title">Quick access</h3>
          <p className="widget-subtitle">Jump to any section</p>
        </div>
      </div>
      <div className="quicknav-grid">
        {links.map((l) => (
          <Link key={l.to} to={l.to} className="quicknav-item">
            <span className="quicknav-icon">{l.icon}</span>
            <span className="quicknav-label">{l.label}</span>
            <span className="quicknav-hint">{l.hint}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

// ── Health summary widget ─────────────────────────────────────────────────────
function HealthSummaryWidget() {
  const user = auth.currentUser;
  const hour = new Date().getHours();
  const greeting = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const firstName = user?.displayName?.split(" ")[0] || "there";

  return (
    <div className="widget widget--summary">
      <div className="summary-greeting">
        {greeting}, <span className="summary-name">{firstName}</span>
      </div>
      <p className="summary-tagline">
        Here's your health dashboard — everything you need, at a glance.
      </p>
      <div className="summary-stats">
        <div className="summary-stat">
          <span className="summary-stat-icon">🌡</span>
          <span className="summary-stat-text">Track symptoms</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-icon">💊</span>
          <span className="summary-stat-text">Medication alerts</span>
        </div>
        <div className="summary-stat">
          <span className="summary-stat-icon">🩸</span>
          <span className="summary-stat-text">Lab insights</span>
        </div>
      </div>
    </div>
  );
}

// ── Main Dashboard ────────────────────────────────────────────────────────────
export default function Dashboard() {
  return (
    <div className="dashboard-shell">
      {/* Top greeting banner */}
      <div className="dashboard-banner">
        <HealthSummaryWidget />
      </div>

      {/* Widget grid */}
      <div className="page-body dashboard-body">
        <div className="dashboard-grid">
          {/* Full-width chat widget */}
          <div className="dashboard-col dashboard-col--wide">
            <ChatWidget />
          </div>

          {/* Right column — stacked widgets */}
          <div className="dashboard-col dashboard-col--narrow">
            <ReminderWidget />
            <AppointmentWidget />
          </div>

          {/* Full-width quick nav */}
          <div className="dashboard-col dashboard-col--full">
            <QuickNavWidget />
          </div>
        </div>
      </div>
    </div>
  );
}
