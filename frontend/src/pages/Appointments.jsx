import { useState, useEffect } from "react";
import { Link } from "react-router-dom";

const timeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";

function formatDateKey(key) {
  const d = new Date(key + "T12:00:00");
  if (Number.isNaN(d.getTime())) return key;
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric" });
}

function formatSlotTime(iso) {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", hour12: true, timeZone });
}

export default function Appointments() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [slotsByDate, setSlotsByDate] = useState(null);
  const [slotsError, setSlotsError] = useState(null);
  const [loadingSlots, setLoadingSlots] = useState(true);
  const [selectedDate, setSelectedDate] = useState(null);
  const [selectedSlot, setSelectedSlot] = useState(null);
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const start = new Date();
    const end = new Date();
    end.setDate(end.getDate() + 14);
    const startStr = start.toISOString().slice(0, 10);
    const endStr = end.toISOString().slice(0, 10);
    setLoadingSlots(true);
    setSlotsError(null);
    fetch(
      `/api/available-slots?start=${encodeURIComponent(startStr)}&end=${encodeURIComponent(endStr)}&time_zone=${encodeURIComponent(timeZone)}`
    )
      .then((r) => {
        if (!r.ok) return r.json().then((d) => Promise.reject(new Error(d.detail || "Failed to load slots")));
        return r.json();
      })
      .then((data) => {
        const slots = data.slots || data;
        if (slots && typeof slots === "object" && Object.keys(slots).length > 0) {
          setSlotsByDate(slots);
          const firstDate = Object.keys(slots).sort()[0];
          setSelectedDate(firstDate);
        } else {
          setSlotsByDate({});
          setSlotsError("No available slots in the next 2 weeks. Check Cal.com availability (e.g. Mon–Fri 9–5).");
        }
      })
      .catch((err) => {
        setSlotsError(err.message || "Could not load available times.");
        setSlotsByDate({});
      })
      .finally(() => setLoadingSlots(false));
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const n = name.trim();
    const em = email.trim();
    if (!n || !em) {
      setStatus({ ok: false, message: "Please fill name and email." });
      return;
    }
    if (!selectedSlot?.start) {
      setStatus({ ok: false, message: "Please choose an available time slot." });
      return;
    }
    setStatus(null);
    setLoading(true);
    try {
      const startUtc = new Date(selectedSlot.start).toISOString();
      const res = await fetch("/api/create-appointment", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          start: startUtc,
          name: n,
          email: em,
          time_zone: timeZone,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        setStatus({ ok: true, message: "Appointment created. Check your email for confirmation." });
        setName("");
        setEmail("");
        setSelectedSlot(null);
      } else {
        setStatus({ ok: false, message: data.detail || "Failed to create appointment." });
      }
    } catch (err) {
      setStatus({ ok: false, message: err.message || "Request failed." });
    } finally {
      setLoading(false);
    }
  };

  const dateKeys = slotsByDate && typeof slotsByDate === "object" ? Object.keys(slotsByDate).sort() : [];
  const rawSlots = selectedDate && slotsByDate?.[selectedDate] ? slotsByDate[selectedDate] : [];
  const slotsForSelected = Array.isArray(rawSlots)
    ? [...rawSlots].sort((a, b) => {
        const tA = typeof a === "object" && a?.start ? a.start : a;
        const tB = typeof b === "object" && b?.start ? b.start : b;
        return new Date(tA).getTime() - new Date(tB).getTime();
      })
    : [];

  return (
    <div style={{ maxWidth: 480 }}>
      <nav style={{ marginBottom: 16 }}>
        <Link to="/">← Home</Link>
      </nav>
      <h2>Book an appointment</h2>
      <p style={{ color: "#666", marginBottom: 16 }}>
        Available times respect your Cal.com schedule (e.g. Mon–Fri 9–5). Pick a slot, then enter your details.
      </p>

      {loadingSlots && <p style={{ color: "#666" }}>Loading available times…</p>}
      {slotsError && (
        <p style={{ color: "crimson", marginBottom: 16 }}>{slotsError}</p>
      )}

      {!loadingSlots && slotsByDate && dateKeys.length > 0 && (
        <>
          <div style={{ marginBottom: 12 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Date</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {dateKeys.map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => { setSelectedDate(d); setSelectedSlot(null); }}
                  style={{
                    padding: "6px 10px",
                    borderRadius: 6,
                    border: selectedDate === d ? "2px solid #333" : "1px solid #ccc",
                    background: selectedDate === d ? "#f0f0f0" : "#fff",
                    cursor: "pointer",
                  }}
                >
                  {formatDateKey(d)}
                </button>
              ))}
            </div>
          </div>
          <div style={{ marginBottom: 16 }}>
            <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Time</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
              {Array.isArray(slotsForSelected) && slotsForSelected.map((slot) => {
                const start = typeof slot === "string" ? slot : slot?.start;
                if (!start) return null;
                const isSelected = selectedSlot?.start === start;
                return (
                  <button
                    key={start}
                    type="button"
                    onClick={() => setSelectedSlot(typeof slot === "object" ? slot : { start, end: start })}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 6,
                      border: isSelected ? "2px solid #333" : "1px solid #ccc",
                      background: isSelected ? "#e0e0e0" : "#fff",
                      cursor: "pointer",
                    }}
                  >
                    {formatSlotTime(start)}
                  </button>
                );
              })}
            </div>
          </div>
        </>
      )}

      <form onSubmit={handleSubmit}>
        <div style={{ marginBottom: 12 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Your name"
            style={{ width: "100%", padding: "8px 10px", boxSizing: "border-box" }}
          />
        </div>
        <div style={{ marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 4, fontWeight: 500 }}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@example.com"
            style={{ width: "100%", padding: "8px 10px", boxSizing: "border-box" }}
          />
        </div>
        <button
          type="submit"
          disabled={loading || !selectedSlot || loadingSlots}
          style={{ padding: "8px 16px" }}
        >
          {loading ? "Creating…" : "Create appointment"}
        </button>
      </form>
      {status && (
        <p
          style={{
            marginTop: 16,
            fontSize: 14,
            color: status.ok ? "green" : "crimson",
          }}
        >
          {status.message}
        </p>
      )}
    </div>
  );
}
