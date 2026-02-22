import { useState } from "react";

export default function Upload() {
    const [file, setFile] = useState(null);
    const [result, setResult] = useState(null);

    const handleFileChange = (e) => {
        setFile(e.target.files[0]);
    };

    const handleUpload = async () => {
        if (!file) return;

        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("http://127.0.0.1:8000/upload-pdf", {
            method: "POST",
            body: formData
        });

        const data = await res.json();
        setResult(data);
    };

    return (
        <div>
            <input type="file" accept="application/pdf" onChange={handleFileChange} />
            <button onClick={handleUpload}>Upload PDF</button>

            {result && (
                <div style={{ marginTop: 20 }}>
                    <h3>Results for {result.filename}</h3>
                    <pre>{JSON.stringify(result.biomarkers, null, 2)}</pre>
                </div>
            )}
        </div>
    );

}