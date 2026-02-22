import { useState, useEffect } from "react";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestore, auth } from "../firebase";

const DISEASE_LABELS = {
  diabetes:     { label: "Diabetes",     icon: "🩸" },
  hypertension: { label: "Hypertension", icon: "❤️" },
  asthma:       { label: "Asthma",       icon: "🫁" },
  cancer:       { label: "Cancer",       icon: "🔬" },
};

export default function BackgroundInfo() {
  const [data, setData] = useState({
    diseases: {
      diabetes:     { self: false, family: false },
      hypertension: { self: false, family: false },
      asthma:       { self: false, family: false },
      cancer:       { self: false, family: false },
    },
    medications: "",
    otherInfo: "",
  });
  const [loading, setLoading] = useState(true);
  const [saved, setSaved] = useState(null);

  const uid = auth.currentUser?.uid;

  useEffect(() => {
    if (!uid) return;
    const fetchData = async () => {
      const docRef = doc(firestore, "users", uid, "backgroundInfo", "info");
      const docSnap = await getDoc(docRef);
      if (docSnap.exists()) {
        setData(docSnap.data());
      } else {
        await setDoc(docRef, data);
      }
      setLoading(false);
    };
    fetchData();
  }, [uid]);

  const handleCheckbox = (disease, type) => {
    setData((prev) => ({
      ...prev,
      diseases: {
        ...prev.diseases,
        [disease]: {
          ...prev.diseases[disease],
          [type]: !prev.diseases[disease][type],
        },
      },
    }));
  };

  const handleChange = (e) => {
    setData((prev) => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSave = async (e) => {
    e.preventDefault();
    if (!uid) return;
    setSaved(null);
    try {
      const docRef = doc(firestore, "users", uid, "backgroundInfo", "info");
      await setDoc(docRef, data, { merge: true });
      setSaved({ ok: true, msg: "Your background info has been saved." });
    } catch (err) {
      console.error(err);
      setSaved({ ok: false, msg: "Error saving data." });
    }
  };

  if (loading) return <p className="status-info" style={{ padding: "2rem" }}>Loading…</p>;

  return (
    <div className="subpage-shell">
      {/* Banner */}
      <div className="subpage-banner subpage-banner--bginfo">
        <div className="subpage-banner-inner">
          <div className="section-label">Health profile</div>
          <h1 className="subpage-banner-title">
            Your medical <span className="accent">history</span>
          </h1>
          <p className="subpage-banner-body">
            Share your background so we can personalise your insights. This information
            stays private and helps your assistant give more accurate, relevant guidance.
          </p>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: "2rem" }}>
        <form onSubmit={handleSave}>

          {/* Disease history — card grid */}
          <div className="card" style={{ marginBottom: "1.1rem" }}>
            <h3>Conditions</h3>
            <p style={{ marginBottom: "1.25rem" }}>
              Select any conditions that apply to you or a close family member.
            </p>
            <div className="condition-grid">
              {Object.keys(data.diseases).map((key) => {
                const meta = DISEASE_LABELS[key] || { label: key, icon: "🏥" };
                const row = data.diseases[key];
                return (
                  <div
                    key={key}
                    className={`condition-card${row.self || row.family ? " condition-card--active" : ""}`}
                  >
                    <div className="condition-icon">{meta.icon}</div>
                    <div className="condition-name">{meta.label}</div>
                    <div className="condition-checks">
                      <label className="condition-check-label">
                        <input
                          type="checkbox"
                          checked={row.self}
                          onChange={() => handleCheckbox(key, "self")}
                        />
                        Me
                      </label>
                      <label className="condition-check-label">
                        <input
                          type="checkbox"
                          checked={row.family}
                          onChange={() => handleCheckbox(key, "family")}
                        />
                        Family
                      </label>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Medications */}
          <div className="card card-accent" style={{ marginBottom: "1.1rem" }}>
            <h3>💊 Current medications</h3>
            <p style={{ marginBottom: "0.875rem" }}>
              List any prescription or over-the-counter medications you take regularly.
            </p>
            <input
              id="bg-meds"
              type="text"
              name="medications"
              value={data.medications}
              onChange={handleChange}
              placeholder="e.g. Metformin 500mg, Lisinopril 10mg…"
              style={{ maxWidth: "100%" }}
            />
          </div>

          {/* Other info */}
          <div className="card" style={{ marginBottom: "1.5rem" }}>
            <h3>📝 Other information</h3>
            <p style={{ marginBottom: "0.875rem" }}>
              Allergies, recent procedures, lifestyle factors — anything relevant.
            </p>
            <textarea
              id="bg-other"
              name="otherInfo"
              value={data.otherInfo}
              onChange={handleChange}
              placeholder="e.g. Penicillin allergy, knee surgery in 2023, non-smoker…"
              style={{ maxWidth: "100%", minHeight: "100px" }}
            />
          </div>

          <button
            type="submit"
            style={{ borderRadius: "var(--warm-radius-pill)", padding: "0.7rem 1.75rem" }}
          >
            Save profile
          </button>

          {saved && (
            <p className={saved.ok ? "status-ok" : "status-err"} style={{ marginTop: "0.75rem" }}>
              {saved.ok ? "✓ " : "⚠ "}{saved.msg}
            </p>
          )}
        </form>
      </div>
    </div>
  );
}
