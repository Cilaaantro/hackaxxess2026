import { useState, useRef, useEffect } from "react";
import { SYMPTOM_KEYS_ORDER, symptomLabel } from "../symptomKeys";

export default function Symptoms() {
  const [selected, setSelected] = useState(new Set());
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [submitted, setSubmitted] = useState(null);
  const containerRef = useRef(null);

  const available = SYMPTOM_KEYS_ORDER.filter(
    (key) =>
      !selected.has(key) &&
      symptomLabel(key).toLowerCase().includes(input.trim().toLowerCase())
  );
  const selectedOrdered = SYMPTOM_KEYS_ORDER.filter((k) => selected.has(k));

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target))
        setOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const add = (key) => {
    setSelected((prev) => new Set([...prev, key]));
    setInput("");
    setOpen(true);
  };

  const remove = (key) => {
    setSelected((prev) => {
      const next = new Set(prev);
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
    <div className="subpage-shell">
      {/* Banner */}
      <div className="subpage-banner subpage-banner--symptoms">
        <div className="subpage-banner-inner">
          <div className="section-label">Health tracking</div>
          <h1 className="subpage-banner-title">
            Track your <span className="accent">symptoms</span>
          </h1>
          <p className="subpage-banner-body">
            Select every symptom you're currently experiencing. We'll use this
            to personalise your analysis and flag patterns worth discussing with your doctor.
          </p>
          {selected.size > 0 && (
            <div className="banner-stat">
              <span className="banner-stat-num">{selected.size}</span>
              <span className="banner-stat-label">symptom{selected.size === 1 ? "" : "s"} selected</span>
            </div>
          )}
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: "2rem" }}>
        <form onSubmit={handleSubmit}>
          <div className="card card-accent" style={{ overflow: "visible" }}>
            <h3>Search &amp; add symptoms</h3>
            <p style={{ marginBottom: "1rem" }}>
              {selected.size === 0
                ? "Type below to search from 132 symptoms and click to add them."
                : `${selected.size} of 132 symptoms selected — keep adding or submit below.`}
            </p>

            <div ref={containerRef} style={{ position: "relative" }}>
              <div className="tag-input-wrap">
                {selectedOrdered.map((key) => (
                  <span key={key} className="tag-chip">
                    {symptomLabel(key)}
                    <button
                      type="button"
                      className="tag-chip-remove"
                      onClick={() => remove(key)}
                      aria-label={`Remove ${symptomLabel(key)}`}
                    >
                      ×
                    </button>
                  </span>
                ))}
                <input
                  className="tag-inner-input"
                  type="text"
                  value={input}
                  onChange={(e) => { setInput(e.target.value); setOpen(true); }}
                  onFocus={() => setOpen(true)}
                  placeholder={selected.size === 0 ? "e.g. headache, fatigue, chest pain…" : "Add more…"}
                />
              </div>

              {open && available.length > 0 && (
                <ul className="tag-dropdown">
                  {available.slice(0, 50).map((key) => (
                    <li key={key}>
                      <button type="button" onClick={() => add(key)}>
                        {symptomLabel(key)}
                      </button>
                    </li>
                  ))}
                  {available.length > 50 && (
                    <li className="tag-dropdown-hint">
                      {available.length - 50} more — keep typing to narrow down
                    </li>
                  )}
                </ul>
              )}
            </div>
          </div>

          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "0.25rem" }}>
            <button
              type="submit"
              style={{ borderRadius: "var(--warm-radius-pill)", padding: "0.7rem 1.75rem" }}
            >
              Generate output
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() => { setSelected(new Set()); setSubmitted(null); }}
                style={{ borderRadius: "var(--warm-radius-pill)" }}
              >
                Clear all
              </button>
            )}
          </div>
        </form>

        {submitted !== null && (
          <div style={{ marginTop: "1.75rem" }}>
            <div className="card">
              <h3>Output</h3>
              <p style={{ marginBottom: "0.875rem" }}>
                {Object.values(submitted).filter((v) => v === 1).length} of{" "}
                {SYMPTOM_KEYS_ORDER.length} symptoms marked as selected.
              </p>
              <pre className="code-block">
                {JSON.stringify(submitted, null, 2)}
              </pre>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(JSON.stringify(submitted))}
                className="secondary"
                style={{ marginTop: "0.875rem", borderRadius: "var(--warm-radius-pill)" }}
              >
                Copy JSON
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
