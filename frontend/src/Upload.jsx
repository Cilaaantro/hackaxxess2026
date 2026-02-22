import { useState, useRef } from "react";
import { auth, firestore } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function Upload() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef(null);

  const handleFileChange = (e) => {
    const f = e.target.files?.[0];
    if (f) { setFile(f); setStatus(""); setResult(null); }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer?.files?.[0];
    if (f && f.type === "application/pdf") {
      setFile(f); setStatus(""); setResult(null);
    } else if (f) {
      setStatus("Please drop a PDF file.");
    }
  };

  const handleUpload = async () => {
    if (!file) { setStatus("Please select a PDF file."); return; }
    const user = auth.currentUser;
    if (!user) { setStatus("No logged-in user found."); return; }

    setLoading(true);
    setStatus("Analyzing results…");

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://127.0.0.1:8000/analyze-full", {
        method: "POST",
        body: formData,
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || "Analysis failed");
      }
      const data = await res.json();
      setResult(data);

      await addDoc(collection(firestore, "users", user.uid, "reports"), {
        extracted_biomarkers: data.extracted_biomarkers,
        flagged_biomarkers: data.flagged_biomarkers,
        recommendations: data.recommendations,
        pdf_filename: file.name,
        created_at: serverTimestamp(),
      });

      setStatus("Analysis complete and saved!");
    } catch (error) {
      console.error(error);
      setStatus("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  const isError = status.startsWith("Error") || status.startsWith("Please");

  return (
    <div className="upload-shell">
      {/* Banner */}
      <div className="upload-banner">
        <div className="upload-banner-inner">
          <div className="section-label">Lab analysis</div>
          <h1 className="upload-banner-title">
            Understand your <span className="accent">results</span>
          </h1>
          <p className="upload-banner-body">
            Upload a PDF of your lab results and we'll extract your biomarkers,
            flag anything unusual, and give you clear, personalised recommendations.
          </p>
        </div>
      </div>

      <div className="page-body" style={{ paddingTop: "2rem" }}>
        {/* Drop zone card */}
        <div className="card" style={{ marginBottom: "1.25rem" }}>
          <h3>Upload your PDF</h3>
          <p style={{ marginBottom: "1.25rem" }}>
            Drop your lab results PDF below or click to browse.
          </p>

          {/* Drop zone */}
          <div
            className={`upload-dropzone${dragging ? " dragging" : ""}${file ? " has-file" : ""}`}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
            onDragLeave={() => setDragging(false)}
            onDrop={handleDrop}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === "Enter" && inputRef.current?.click()}
            aria-label="Upload PDF"
          >
            <input
              ref={inputRef}
              type="file"
              accept="application/pdf"
              onChange={handleFileChange}
              style={{ display: "none" }}
            />
            {file ? (
              <>
                <div className="upload-dropzone-icon">📄</div>
                <p className="upload-dropzone-filename">{file.name}</p>
                <p className="upload-dropzone-hint">Click or drop to replace</p>
              </>
            ) : (
              <>
                <div className="upload-dropzone-icon">{dragging ? "📂" : "⬆️"}</div>
                <p className="upload-dropzone-label">
                  {dragging ? "Drop it here" : "Drop PDF here or click to browse"}
                </p>
                <p className="upload-dropzone-hint">Supported format: PDF</p>
              </>
            )}
          </div>

          {/* Action row */}
          <div style={{ marginTop: "1.25rem", display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
            <button
              onClick={handleUpload}
              disabled={loading || !file}
              style={{ borderRadius: "var(--warm-radius-pill)", padding: "0.7rem 1.75rem" }}
            >
              {loading ? "Analyzing…" : "Analyze results"}
            </button>
            {file && !loading && (
              <button
                className="secondary"
                onClick={() => { setFile(null); setStatus(""); setResult(null); }}
                style={{ borderRadius: "var(--warm-radius-pill)" }}
              >
                Clear
              </button>
            )}
          </div>

          {status && (
            <p style={{
              marginTop: "0.875rem",
              fontSize: "0.9rem",
              fontWeight: 500,
              color: isError ? "#b91c1c" : "var(--warm-primary)",
            }}>
              {isError ? "⚠ " : "✓ "}{status}
            </p>
          )}
        </div>

        {/* Results */}
        {result && (
          <>
            {result.flagged_biomarkers?.length > 0 && (
              <div className="card card-accent" style={{ marginBottom: "1rem" }}>
                <h3>Flagged biomarkers</h3>
                <p style={{ marginBottom: "0.875rem" }}>
                  These values were outside the normal range and may need attention.
                </p>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "0.5rem" }}>
                  {result.flagged_biomarkers.map((b, i) => (
                    <span key={i} className="flag-chip">{b}</span>
                  ))}
                </div>
              </div>
            )}

            <div className="card">
              <h3>Personalised recommendations</h3>
              <p style={{ margin: 0, lineHeight: 1.75 }}>{result.recommendations}</p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
