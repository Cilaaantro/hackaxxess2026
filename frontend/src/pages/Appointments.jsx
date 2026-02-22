import { useState, useEffect } from "react";

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
    <div className="page-body">
      <div className="page-title-group">
        <h1 className="page-title">Book an appointment</h1>
        <p className="page-subtitle">
          Pick an available slot (Mon–Fri, 9am–5pm), then confirm your details.
        </p>
      </div>

      {loadingSlots && (
        <p className="status-info">Loading available times…</p>
      )}
      {slotsError && (
        <p className="status-err" style={{ marginBottom: "1rem" }}>{slotsError}</p>
      )}

      {!loadingSlots && slotsByDate && dateKeys.length > 0 && (
        <div className="card card-accent" style={{ marginBottom: "1.25rem" }}>
          <div className="form-row" style={{ marginBottom: "1.25rem" }}>
            <label>Select a date</label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.35rem" }}>
              {dateKeys.map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`slot-btn${selectedDate === d ? " selected" : ""}`}
                  onClick={() => { setSelectedDate(d); setSelectedSlot(null); }}
                >
                  {formatDateKey(d)}
                </button>
              ))}
            </div>
          </div>

          {selectedDate && (
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label>Available times</label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem", marginTop: "0.35rem" }}>
                {Array.isArray(slotsForSelected) && slotsForSelected.map((slot) => {
                  const start = typeof slot === "string" ? slot : slot?.start;
                  if (!start) return null;
                  const isSelected = selectedSlot?.start === start;
                  return (
                    <button
                      key={start}
                      type="button"
                      className={`slot-btn${isSelected ? " selected" : ""}`}
                      onClick={() => setSelectedSlot(typeof slot === "object" ? slot : { start, end: start })}
                    >
                      {formatSlotTime(start)}
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      <div className="card">
        <h3>Your details</h3>
        <form onSubmit={handleSubmit}>
          <div className="form-row">
            <label htmlFor="appt-name">Name</label>
            <input
              id="appt-name"
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Your full name"
            />
          </div>
          <div className="form-row" style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="appt-email">Email</label>
            <input
              id="appt-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
            />
          </div>
          <button
            type="submit"
            disabled={loading || !selectedSlot || loadingSlots}
            style={{ borderRadius: "var(--warm-radius-pill)", padding: "0.7rem 1.75rem" }}
          >
            {loading ? "Creating…" : "Confirm appointment"}
          </button>
        </form>
        {status && (
          <p className={status.ok ? "status-ok" : "status-err"}>
            {status.message}
          </p>
        )}
      </div>
    </div>
  );
}
