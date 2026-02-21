import { useState } from 'react'
import { Link } from 'react-router-dom'
import './UploadAudio.css'

export default function UploadAudio() {
  const [file, setFile] = useState(null)
  const [status, setStatus] = useState('idle') // idle | uploading | success | error
  const [result, setResult] = useState(null)
  const [error, setError] = useState(null)

  const handleFileChange = (e) => {
    const selected = e.target.files?.[0]
    if (selected) {
      if (!selected.name.toLowerCase().endsWith('.mp3')) {
        setError('Please select an MP3 file')
        setFile(null)
        return
      }
      setError(null)
      setFile(selected)
      setStatus('idle')
      setResult(null)
    }
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!file) return
    setStatus('uploading')
    setError(null)
    setResult(null)
    const formData = new FormData()
    formData.append('audio', file)
    try {
      const res = await fetch('/api/upload/audio', {
        method: 'POST',
        body: formData,
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail || 'Upload failed')
        setStatus('error')
        return
      }
      setResult(data)
      setStatus('success')
    } catch (err) {
      setError(err.message || 'Upload failed')
      setStatus('error')
    }
  }

  return (
    <div className="upload-audio">
      <nav className="upload-audio-nav">
        <Link to="/">← Home</Link>
      </nav>
      <h1>Upload Audio</h1>
      <p className="upload-audio-hint">Select an MP3 file to upload to the server.</p>
      <form onSubmit={handleSubmit} className="upload-audio-form">
        <label className="upload-audio-label">
          <span className="upload-audio-label-text">Choose MP3 file</span>
          <input
            type="file"
            accept=".mp3,audio/mpeg"
            onChange={handleFileChange}
            className="upload-audio-input"
          />
        </label>
        {file && (
          <p className="upload-audio-filename">Selected: {file.name}</p>
        )}
        {error && (
          <p className="upload-audio-error" role="alert">{error}</p>
        )}
        <button
          type="submit"
          disabled={!file || status === 'uploading'}
          className="upload-audio-submit"
        >
          {status === 'uploading' ? 'Uploading…' : 'Upload'}
        </button>
      </form>
      {status === 'success' && result && (
        <div className="upload-audio-result">
          <h2>Upload complete</h2>
          <ul>
            <li>Filename: {result.filename}</li>
            <li>Size: {result.size_bytes} bytes</li>
            <li>Saved to: {result.saved_to}</li>
          </ul>
        </div>
      )}
    </div>
  )
}
