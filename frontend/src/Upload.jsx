// src/pages/Upload.jsx
import React, { useState } from "react";
import { auth, firestore } from "./firebase"; // Firestore and auth instances
import { doc, setDoc } from "firebase/firestore";

export default function Upload() {
  const [file, setFile] = useState(null);
  const [result, setResult] = useState(null);
  const [status, setStatus] = useState(""); // To show upload status

  // Handle file selection
  const handleFileChange = (e) => {
    setFile(e.target.files[0]);
  };

  // Upload PDF to backend and save JSON to Firestore
  const handleUpload = async () => {
    if (!file) {
      setStatus("Please select a file.");
      return;
    }

    const user = auth.currentUser; // Get the currently signed-in user
    if (!user) {
      setStatus("No logged-in user found.");
      return;
    }

    setStatus("Uploading PDF...");

    try {
      // Send PDF to backend for processing
      const formData = new FormData();
      formData.append("file", file);

      const res = await fetch("http://127.0.0.1:8000/upload-pdf", {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to upload PDF");
      }

      const data = await res.json();
      setResult(data);

      // Save JSON to Firestore under this user
      await setDoc(doc(firestore, "users", user.uid), {
        biomarkers: data.biomarkers,
        pdf_filename: data.filename,
        timestamp: new Date(),
      });

      setStatus("Data saved successfully!");
    } catch (error) {
      console.error(error);
      setStatus("Error: " + error.message);
    }
  };

  return (
    <div style={{ padding: "20px" }}>
      <h2>Upload PDF and Save Biomarkers</h2>

      <input type="file" accept="application/pdf" onChange={handleFileChange} />
      <button onClick={handleUpload} style={{ marginLeft: "10px" }}>
        Upload PDF
      </button>

      {status && <p>{status}</p>}

      {result && (
        <div style={{ marginTop: "20px" }}>
          <h3>Results for {result.filename}</h3>
          <pre>{JSON.stringify(result.biomarkers, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}