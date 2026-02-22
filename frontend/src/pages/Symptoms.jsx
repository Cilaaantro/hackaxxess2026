import { useState, useRef, useEffect } from "react";
import { Link } from "react-router-dom";
import { SYMPTOM_KEYS_ORDER, symptomLabel } from "../symptomKeys";

export default function Symptoms() {
  const [selected, setSelected] = useState(new Set());
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const containerRef = useRef(null);

  const available = SYMPTOM_KEYS_ORDER.filter(
    (key) => !selected.has(key) && symptomLabel(key).toLowerCase().includes(input.trim().toLowerCase())
  );
  const selectedOrdered = SYMPTOM_KEYS_ORDER.filter((k) => selected.has(k));

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const add = (key) => {
    setSelected((s) => new Set([...s, key]));
    setInput("");
    setOpen(false);
  };

  const remove = (key) => {
    setSelected((s) => {
      const next = new Set(s);
      next.delete(key);
      return next;
    });
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    const output = {};
    for (const key of SYMPTOM_KEYS_ORDER) {
      output[key] = selected.has(key) ? 1 : 0;
    }
    setSubmitted(output);
  };

  return (
    <div style={{ maxWidth: 640 }}>
      <nav style={{ marginBottom: 16 }}>
        <Link to="/">← Home</Link>
      </nav>
      <h2>Symptom checklist</h2>
      <p style={{ color: "#555", marginBottom: 16 }}>
        Type to search and click to add symptoms (Workday-style tags). Selected = 1, not selected = 0. Submit to get the same object with keys in order.
      </p>

      <form onSubmit={handleSubmit}>
        <div ref={containerRef} style={{ position: "relative", marginBottom: 16 }}>
          <label style={{ display: "block", marginBottom: 6, fontWeight: 500 }}>Add symptoms</label>
          <div
            style={{
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
              alignItems: "center",
              minHeight: 42,
              padding: "6px 10px",
              border: "1px solid #ccc",
              borderRadius: 8,
              background: "#fff",
            }}
          >
            {selectedOrdered.map((key) => (
              <span
                key={key}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  gap: 4,
                  padding: "4px 8px",
                  background: "#e8f4fc",
                  border: "1px solid #b8d4e8",
                  borderRadius: 6,
                  fontSize: 14,
                }}
              >
                {symptomLabel(key)}
                <button
                  type="button"
                  onClick={() => remove(key)}
                  aria-label={`Remove ${symptomLabel(key)}`}
                  style={{
                    padding: 0,
                    margin: 0,
                    border: "none",
                    background: "transparent",
                    cursor: "pointer",
                    fontSize: 16,
                    lineHeight: 1,
                    color: "#666",
                  }}
                >
                  ×
                </button>
              </span>
            ))}
            <input
              type="text"
              value={input}
              onChange={(e) => {
                setInput(e.target.value);
                setOpen(true);
              }}
              onFocus={() => setOpen(true)}
              placeholder={selected.size === 0 ? "Type to search symptoms..." : "Add more..."}
              style={{
                flex: "1 1 120px",
                minWidth: 120,
                border: "none",
                outline: "none",
                fontSize: 14,
                padding: "4px 0",
              }}
            />
          </div>
          {open && available.length > 0 && (
            <ul
              style={{
                position: "absolute",
                left: 0,
                right: 0,
                top: "100%",
                margin: 0,
                marginTop: 4,
                padding: 4,
                listStyle: "none",
                background: "#fff",
                border: "1px solid #ccc",
                borderRadius: 8,
                boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
                maxHeight: 220,
                overflowY: "auto",
                zIndex: 10,
              }}
            >
              {available.slice(0, 50).map((key) => (
                <li key={key}>
                  <button
                    type="button"
                    onClick={() => add(key)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "8px 10px",
                      border: "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: 14,
                      borderRadius: 4,
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = "#f0f0f0";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = "transparent";
                    }}
                  >
                    {symptomLabel(key)}
                  </button>
                </li>
              ))}
              {available.length > 50 && (
                <li style={{ padding: "6px 10px", fontSize: 12, color: "#666" }}>
                  Type more to narrow down ({available.length} more)
                </li>
              )}
            </ul>
          )}
        </div>

        <button type="submit" style={{ padding: "8px 16px" }}>
          Submit
        </button>
      </form>

      {submitted !== null && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ marginBottom: 8 }}>Output (same order, 1 = selected, 0 = not)</h3>
          <pre
            style={{
              padding: 16,
              background: "#f5f5f5",
              borderRadius: 8,
              overflow: "auto",
              fontSize: 12,
              maxHeight: 400,
            }}
          >
            {JSON.stringify(submitted, null, 2)}
          </pre>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(JSON.stringify(submitted));
            }}
            style={{ marginTop: 8, padding: "6px 12px", fontSize: 12 }}
          >
            Copy JSON
          </button>
        </div>
      )}
    </div>
  );
}
