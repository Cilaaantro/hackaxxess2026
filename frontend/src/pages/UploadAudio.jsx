import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import './UploadAudio.css'

const SpeechRecognitionAPI =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

export default function UploadAudio() {
  const [recording, setRecording] = useState(false)
  const [submitStatus, setSubmitStatus] = useState('idle') // idle | submitting | success | error
  const [error, setError] = useState(null)
  const [transcript, setTranscript] = useState('')
  const [interimTranscript, setInterimTranscript] = useState('')
  const recognitionRef = useRef(null)

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.abort()
      }
    }
  }, [])

  const startRecording = async () => {
    setError(null)
    setTranscript('')
    setInterimTranscript('')
    setSubmitStatus('idle')
    if (!SpeechRecognitionAPI) {
      setError('Speech recognition is not supported in this browser.')
      return
    }
    try {
      const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
      const recognition = new Recognition()
      recognition.continuous = true
      recognition.interimResults = true
      recognition.lang = 'en-US'
      recognition.onresult = (event) => {
        let final = ''
        let interim = ''
        const results = event.results
        if (!results || !results.length) return
        for (let i = event.resultIndex; i < results.length; i++) {
          const result = results[i]
          const first = result[0] ?? (typeof result.item === 'function' ? result.item(0) : null)
          const chunk = (first && first.transcript) ? String(first.transcript).trim() : ''
          const isFinal = typeof result.isFinal === 'boolean' ? result.isFinal : Boolean(chunk)
          if (!chunk) continue
          if (isFinal) {
            final += (final ? ' ' : '') + chunk
          } else {
            interim += (interim ? ' ' : '') + chunk
          }
        }
        if (final) {
          setTranscript((prev) => (prev ? `${prev} ${final}` : final))
        }
        setInterimTranscript(interim)
      }
      recognition.onerror = (event) => {
        setInterimTranscript('')
        if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
          setError('Microphone or speech recognition was denied.')
        } else if (event.error !== 'no-speech' && event.error !== 'aborted') {
          setError(`Speech recognition error: ${event.error}`)
        }
      }
      recognition.start()
      recognitionRef.current = recognition
      setRecording(true)
    } catch {
      setError('Could not start speech recognition.')
    }
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setRecording(false)
    setInterimTranscript('')
  }

  const submitTranscript = async () => {
    const text = transcript.trim()
    if (!text) return
    setSubmitStatus('submitting')
    setError(null)
    try {
      const res = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: text }),
      })
      const data = await res.json()
      if (!res.ok) {
        setError(data.detail ?? 'Failed to send transcript')
        setSubmitStatus('error')
        return
      }
      setSubmitStatus('success')
    } catch (err) {
      setError(err.message ?? 'Failed to send transcript')
      setSubmitStatus('error')
    }
  }

  const hasTranscript = transcript.trim().length > 0

  return (
    <div className="upload-audio">
      <nav className="upload-audio-nav">
        <Link to="/">← Home</Link>
      </nav>
      <h1>Speak &amp; Send Transcript</h1>
      <p className="upload-audio-hint">
        Press record, speak, then stop. Submit to send the transcript to the server.
      </p>
      {!SpeechRecognitionAPI && (
        <p className="upload-audio-unsupported">
          Speech recognition is not supported in this browser. Try Chrome or Edge.
        </p>
      )}
      <div className="upload-audio-form">
        <div className="upload-audio-record-row">
          {!recording ? (
            <button
              type="button"
              onClick={startRecording}
              className="upload-audio-record upload-audio-record-start"
              disabled={submitStatus === 'submitting'}
            >
              Record
            </button>
          ) : (
            <button
              type="button"
              onClick={stopRecording}
              className="upload-audio-record upload-audio-record-stop"
            >
              Stop
            </button>
          )}
        </div>
        {(transcript || interimTranscript || recording) && (
          <div className="upload-audio-transcript" aria-live="polite">
            <span className="upload-audio-transcript-label">Live transcript:</span>
            <p className="upload-audio-transcript-text">
              {transcript}
              {interimTranscript && (
                <span className="upload-audio-transcript-interim">{interimTranscript}</span>
              )}
              {recording && !transcript && !interimTranscript && (
                <span className="upload-audio-transcript-placeholder">Listening…</span>
              )}
            </p>
          </div>
        )}
        {hasTranscript && !recording && (
          <button
            type="button"
            onClick={submitTranscript}
            disabled={submitStatus === 'submitting'}
            className="upload-audio-submit"
          >
            {submitStatus === 'submitting' ? 'Sending…' : 'Submit transcript'}
          </button>
        )}
        {submitStatus === 'success' && (
          <p className="upload-audio-success">Transcript sent to the server.</p>
        )}
        {error && (
          <p className="upload-audio-error" role="alert">{error}</p>
        )}
      </div>
    </div>
  )
}
