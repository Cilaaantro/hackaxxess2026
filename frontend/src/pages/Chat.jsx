import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { auth, firestore } from '../firebase'
import { collection, addDoc, serverTimestamp } from 'firebase/firestore'
import './Chat.css'

const SpeechRecognitionAPI =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

export default function Chat() {
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recording, setRecording] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const audioRef = useRef(null)

  // Scroll to bottom whenever messages change
  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [messages])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort()
      if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src)
    }
  }, [])

  // --- Voice Recording ---
  const startRecording = () => {
    if (!SpeechRecognitionAPI) {
      setError('Speech recognition is not supported. Try Chrome or Edge.')
      return
    }
    setError(null)
    const Recognition = window.SpeechRecognition || window.webkitSpeechRecognition
    const recognition = new Recognition()
    recognition.continuous = true
    recognition.interimResults = true
    recognition.lang = 'en-US'
    recognition.onresult = (event) => {
      let final = ''
      let interim = ''
      const results = event.results
      if (!results?.length) return
      for (let i = event.resultIndex; i < results.length; i++) {
        const result = results[i]
        const first = result[0] ?? (typeof result.item === 'function' ? result.item(0) : null)
        const chunk = (first?.transcript) ? String(first.transcript).trim() : ''
        const isFinal = typeof result.isFinal === 'boolean' ? result.isFinal : Boolean(chunk)
        if (!chunk) continue
        if (isFinal) final += (final ? ' ' : '') + chunk
        else interim += (interim ? ' ' : '') + chunk
      }
      if (final) setInput((prev) => (prev ? `${prev} ${final}` : final))
      setInterimTranscript(interim)
    }
    recognition.onerror = (e) => {
      setInterimTranscript('')
      if (e.error !== 'no-speech' && e.error !== 'aborted') setError(`Speech: ${e.error}`)
    }
    recognition.start()
    recognitionRef.current = recognition
    setRecording(true)
  }

  const stopRecording = () => {
    if (recognitionRef.current) {
      recognitionRef.current.stop()
      recognitionRef.current = null
    }
    setRecording(false)
    setInterimTranscript('')
  }

  // --- Send Message & Save to Firestore ---
  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setError(null)
    setInput('')

    const userMsg = { role: 'user', content: text }
    setMessages((prev) => [...prev, userMsg])
    setLoading(true)

    const user = auth.currentUser
    if (!user) {
      setError('No logged-in user found.')
      setLoading(false)
      return
    }

    try {
      // Save user message
      const chatRef = collection(firestore, 'users', user.uid, 'chats')
      await addDoc(chatRef, { ...userMsg, timestamp: serverTimestamp() })

      // Send to backend
      const chatMessages = [...messages, userMsg].map((m) => ({ role: m.role, content: m.content }))
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: chatMessages }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error(data.detail || 'Chat failed')

      const assistantMsg = { role: 'assistant', content: data.message }
      setMessages((prev) => [...prev, assistantMsg])

      // Save assistant response
      await addDoc(chatRef, { ...assistantMsg, timestamp: serverTimestamp() })
    } catch (err) {
      console.error(err)
      setError(err.message || 'Chat failed')
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  // --- Text-to-Speech ---
  const playTTS = async (content, id) => {
    if (!content?.trim() || playingId !== null) return
    setPlayingId(id)
    if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src)
    try {
      const res = await fetch('/api/transcript', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: content }),
      })
      if (!res.ok) throw new Error('TTS failed')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audioRef.current = { src: url }
      audio.onended = () => {
        setPlayingId(null)
        URL.revokeObjectURL(url)
      }
      audio.onerror = () => {
        setPlayingId(null)
        URL.revokeObjectURL(url)
      }
      await audio.play()
    } catch {
      setPlayingId(null)
      setError('Could not play message.')
    }
  }

  return (
    <div className="chat-page">
      <nav className="chat-nav">
        <Link to="/">← Home</Link>
      </nav>
      <h1>Chat</h1>

      <div className="chat-messages" role="log" aria-live="polite">
        {messages.length === 0 && (
          <p className="chat-placeholder">Send a message or use the mic to speak.</p>
        )}
        {messages.map((m, i) => (
          <div key={i} className={`chat-msg chat-msg--${m.role}`}>
            <span className="chat-msg-role">{m.role === 'user' ? 'You' : 'Assistant'}</span>
            <p className="chat-msg-content">{m.content}</p>
            {m.role === 'assistant' && (
              <button
                type="button"
                className="chat-msg-tts"
                onClick={() => playTTS(m.content, i)}
                disabled={playingId !== null && playingId !== i}
                title="Play message with TTS"
                aria-label="Play message"
              >
                {playingId === i ? '⏸' : '🔊'}
              </button>
            )}
          </div>
        ))}
        {loading && (
          <div className="chat-msg chat-msg--assistant">
            <span className="chat-msg-role">Assistant</span>
            <p className="chat-msg-content chat-msg-loading">Thinking…</p>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && <p className="chat-error" role="alert">{error}</p>}

      <div className="chat-input-wrap">
        <input
          type="text"
          className="chat-input"
          placeholder={recording ? 'Speaking…' : 'Type or use mic'}
          value={recording ? input + (interimTranscript ? ` ${interimTranscript}` : '') : input}
          onChange={(e) => !recording && setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          disabled={loading}
        />
        <button
          type="button"
          className="chat-mic"
          onClick={recording ? stopRecording : startRecording}
          title={recording ? 'Stop speaking' : 'Speak to type'}
          aria-label={recording ? 'Stop' : 'Start voice input'}
        >
          {recording ? '⏹' : '🎤'}
        </button>
        <button
          type="button"
          className="chat-send"
          onClick={sendMessage}
          disabled={loading || !input.trim()}
        >
          Send
        </button>
      </div>
    </div>
  )
}