import { useState, useRef, useEffect } from "react";
import { auth } from "../firebase";
import { SYMPTOM_KEYS_ORDER, symptomLabel } from "../symptomKeys";

export default function Symptoms() {
  const user = auth.currentUser;
  const [selected, setSelected] = useState(new Set());
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);
  const [doctorEmail, setDoctorEmail] = useState("");
  const [submitted, setSubmitted] = useState(null);
  const [prediction, setPrediction] = useState(null);
  const [predicting, setPredicting] = useState(false);
  const [predError, setPredError] = useState(null);
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    const output = {};
    for (const key of SYMPTOM_KEYS_ORDER) {
      output[key] = selected.has(key) ? 1 : 0;
    }
    setSubmitted(output);
    setPrediction(null);
    setPredError(null);
    setPredicting(true);
    try {
      const res = await fetch("/api/predict-and-recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          symptoms: output,
          patient_name: user?.displayName || "the patient",
          patient_email: user?.email || "",
          doctor_email: doctorEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || "Prediction failed");
      setPrediction({
        disease: data.disease,
        recommendation: data.recommendation,
        emailSent: data.email_sent,
        emailError: data.email_error,
      });
    } catch (err) {
      setPredError(err.message || "Prediction failed");
    } finally {
      setPredicting(false);
    }
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
            Select every symptom you're currently experiencing. We'll analyse them,
            provide over-the-counter guidance, and notify your doctor automatically.
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
          {/* Symptom tag input */}
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

          {/* Doctor email */}
          <div className="card" style={{ marginTop: "0.25rem" }}>
            <h3>📧 Notify your doctor</h3>
            <p style={{ marginBottom: "0.875rem" }}>
              Enter your doctor's email and we'll send them a full symptom report along
              with the AI-recommended OTC steps provided to you.
            </p>
            <div className="form-row" style={{ marginBottom: 0 }}>
              <label htmlFor="doctor-email">Doctor's email address <span style={{ color: "var(--warm-text-subtle)", fontWeight: 400 }}>(optional)</span></label>
              <input
                id="doctor-email"
                type="email"
                value={doctorEmail}
                onChange={(e) => setDoctorEmail(e.target.value)}
                placeholder="doctor@clinic.com"
                style={{ maxWidth: "100%" }}
              />
            </div>
          </div>

          {/* Actions */}
          <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", marginTop: "1rem" }}>
            <button
              type="submit"
              disabled={selected.size === 0}
              style={{ borderRadius: "var(--warm-radius-pill)", padding: "0.7rem 1.75rem" }}
            >
              Analyse &amp; get recommendations
            </button>
            {selected.size > 0 && (
              <button
                type="button"
                className="secondary"
                onClick={() => { setSelected(new Set()); setSubmitted(null); setPrediction(null); }}
                style={{ borderRadius: "var(--warm-radius-pill)" }}
              >
                Clear all
              </button>
            )}
          </div>
        </form>

        {/* Results */}
        {(predicting || prediction || predError) && (
          <div style={{ marginTop: "1.75rem", display: "flex", flexDirection: "column", gap: "1rem" }}>

            {/* Loading */}
            {predicting && (
              <div className="card prediction-card">
                <div className="prediction-loading">
                  <span className="typing-dot" /><span className="typing-dot" /><span className="typing-dot" />
                  <span style={{ marginLeft: "0.5rem", fontSize: "0.875rem", color: "var(--warm-text-muted)" }}>
                    Analysing symptoms &amp; finding recommendations…
                  </span>
                </div>
              </div>
            )}

            {/* Error */}
            {predError && !predicting && (
              <div className="card">
                <p className="status-err">⚠ {predError}</p>
              </div>
            )}

            {/* OTC recommendation */}
            {prediction && !predicting && (
              <div className="card prediction-card prediction-card--ready">
                <div className="prediction-header">
                  <span className="prediction-icon">💊</span>
                  <div>
                    <h3 style={{ margin: 0 }}>Over-the-counter recommendations</h3>
                    <p style={{ margin: 0, fontSize: "0.8125rem", color: "var(--warm-text-subtle)" }}>
                      Based on {selectedOrdered.length} reported symptom{selectedOrdered.length === 1 ? "" : "s"}
                    </p>
                  </div>
                </div>
                <div className="prediction-result">
                  <pre className="prediction-rec">{prediction.recommendation}</pre>
                  <p className="prediction-disclaimer">
                    AI-generated for informational purposes only. Consult a qualified healthcare
                    professional before starting any treatment.
                  </p>
                </div>
              </div>
            )}

            {/* Doctor email status */}
            {prediction && !predicting && doctorEmail.trim() && (
              <div className={`card doctor-email-status${prediction.emailSent ? " doctor-email-status--sent" : " doctor-email-status--err"}`}>
                <div className="doctor-email-status-row">
                  <span className="doctor-email-status-icon">
                    {prediction.emailSent ? "✓" : "⚠"}
                  </span>
                  <div>
                    {prediction.emailSent ? (
                      <>
                        <p style={{ margin: 0, fontWeight: 600, color: "var(--warm-primary)" }}>
                          Doctor notified
                        </p>
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.8125rem", color: "var(--warm-text-muted)" }}>
                          A full symptom report and your OTC recommendations were sent to <strong>{doctorEmail}</strong>.
                        </p>
                      </>
                    ) : (
                      <>
                        <p style={{ margin: 0, fontWeight: 600, color: "#b91c1c" }}>
                          Email could not be sent
                        </p>
                        <p style={{ margin: "0.2rem 0 0", fontSize: "0.8125rem", color: "var(--warm-text-muted)" }}>
                          {prediction.emailError || "Please check the email address and try again."}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Raw JSON collapsible */}
        {submitted !== null && (
          <div style={{ marginTop: "1rem" }}>
            <details className="json-details">
              <summary className="json-details-summary">View raw symptom JSON</summary>
              <div style={{ marginTop: "0.75rem" }}>
                <pre className="code-block">{JSON.stringify(submitted, null, 2)}</pre>
                <button
                  type="button"
                  onClick={() => navigator.clipboard?.writeText(JSON.stringify(submitted))}
                  className="secondary"
                  style={{ marginTop: "0.75rem", borderRadius: "var(--warm-radius-pill)" }}
                >
                  Copy JSON
                </button>
              </div>
            </details>
          </div>
        )}
      </div>
    </div>
  );
}
