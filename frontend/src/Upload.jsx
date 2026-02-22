// src/pages/Upload.jsx
import React, { useState } from "react";
import { auth, firestore } from "./firebase";
import { collection, addDoc, serverTimestamp } from "firebase/firestore";

export default function Upload() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(false);

  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  const handleUpload = async () => {
    if (!file) {
      setStatus("Please select a PDF file.");
      return;
    }

    const user = auth.currentUser;
    if (!user) {
      setStatus("No logged-in user found.");
      return;
    }

    setLoading(true);
    setStatus("Analyzing bloodwork...");

    try {
      // Step 1: Send PDF to full pipeline
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

      // Step 2: Save analysis as a new report under user
      await addDoc(collection(firestore, "users", user.uid, "reports"), {
        extracted_biomarkers: data.extracted_biomarkers,
        flagged_biomarkers: data.flagged_biomarkers,
        recommendations: data.recommendations,
        pdf_filename: file.name,
        created_at: serverTimestamp(),
      });

      setStatus("Analysis complete and saved successfully!");
    } catch (error) {
      console.error(error);
      setStatus("Error: " + error.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ padding: "40px" }}>
      <h2>Upload Bloodwork PDF</h2>

      <input
        type="file"
        accept="application/pdf"
        onChange={handleFileChange}
      />

      <button
        onClick={handleUpload}
        disabled={loading}
        style={{ marginLeft: "10px" }}
      >
        {loading ? "Analyzing..." : "Upload & Analyze"}
      </button>

      {status && <p style={{ marginTop: 10 }}>{status}</p>}

      {result && (
        <div style={{ marginTop: "30px" }}>
          <h3>Recommendations</h3>
          <p>{result.recommendations}</p>
        </div>
      )}
    </div>
  );
}