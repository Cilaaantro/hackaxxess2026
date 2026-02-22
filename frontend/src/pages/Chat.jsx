import { useState, useRef, useEffect } from 'react'
import { auth, firestore } from '../firebase'
import { collection, addDoc, doc, getDoc, serverTimestamp } from 'firebase/firestore'
import './Chat.css'

const SpeechRecognitionAPI =
  typeof window !== 'undefined' &&
  (window.SpeechRecognition || window.webkitSpeechRecognition)

const MODES = [
  { id: 'general', label: '💬 General', desc: 'Ask anything about your health, results, or symptoms.' },
  { id: 'checkin', label: '📋 Daily Check-in', desc: 'A quick 5-question daily health check-in with personalized feedback.' },
]

export default function Chat() {
  const [mode, setMode] = useState('general')
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState(null)
  const [recording, setRecording] = useState(false)
  const [interimTranscript, setInterimTranscript] = useState('')
  const [playingId, setPlayingId] = useState(null)
  const [userContext, setUserContext] = useState({})
  const recognitionRef = useRef(null)
  const messagesEndRef = useRef(null)
  const audioRef = useRef(null)

  const switchMode = (newMode) => {
    if (newMode === mode) return
    setMode(newMode)
    setMessages([])
    setInput('')
    setError(null)
    setInterimTranscript('')
  }

  const scrollToBottom = () => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  useEffect(() => { scrollToBottom() }, [messages])

  // Fetch biomarkers + backgroundInfo once on mount
  useEffect(() => {
    const fetchContext = async () => {
      const user = auth.currentUser
      if (!user) return
      try {
        const [userSnap, bgSnap] = await Promise.all([
          getDoc(doc(firestore, 'users', user.uid)),
          getDoc(doc(firestore, 'users', user.uid, 'backgroundInfo', 'info')),
        ])
        setUserContext({
          biomarkers: userSnap.exists() ? (userSnap.data().biomarkers || null) : null,
          backgroundInfo: bgSnap.exists() ? bgSnap.data() : null,
        })
      } catch (e) {
        console.warn('Could not load patient context:', e)
      }
    }
    fetchContext()
  }, [])

  useEffect(() => {
    return () => {
      if (recognitionRef.current) recognitionRef.current.abort()
      if (audioRef.current?.src) URL.revokeObjectURL(audioRef.current.src)
    }
  }, [])

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
        const chunk = first?.transcript ? String(first.transcript).trim() : ''
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

  const callChat = async (msgs, currentMode) => {
    const user = auth.currentUser
    if (!user) throw new Error('No logged-in user found.')
    const chatRef = collection(firestore, 'users', user.uid, 'chats')
    const chatMessages = msgs.map((m) => ({ role: m.role, content: m.content }))
    const res = await fetch('/api/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: chatMessages, mode: currentMode, user_context: userContext }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.detail || 'Chat failed')
    const assistantMsg = { role: 'assistant', content: data.message }
    await addDoc(chatRef, { ...assistantMsg, timestamp: serverTimestamp() })
    return assistantMsg
  }

  const sendMessage = async () => {
    const text = input.trim()
    if (!text || loading) return
    setError(null)
    setInput('')

    const userMsg = { role: 'user', content: text }
    const nextMessages = [...messages, userMsg]
    setMessages(nextMessages)
    setLoading(true)

    const user = auth.currentUser
    if (!user) {
      setError('No logged-in user found.')
      setLoading(false)
      return
    }

    try {
      const chatRef = collection(firestore, 'users', user.uid, 'chats')
      await addDoc(chatRef, { ...userMsg, timestamp: serverTimestamp() })

      const assistantMsg = await callChat(nextMessages, mode)
      setMessages((prev) => [...prev, assistantMsg])
    } catch (err) {
      console.error(err)
      setError(err.message || 'Chat failed')
      setMessages((prev) => prev.slice(0, -1))
    } finally {
      setLoading(false)
    }
  }

  // When check-in mode is selected, auto-send an empty trigger so the bot opens first
  const startCheckin = async () => {
    switchMode('checkin')
    setLoading(true)
    setError(null)
    try {
      const assistantMsg = await callChat([{ role: 'user', content: 'Start my daily check-in.' }], 'checkin')
      setMessages([assistantMsg])
    } catch (err) {
      setError(err.message || 'Could not start check-in.')
    } finally {
      setLoading(false)
    }
  }

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
      audio.onended = () => { setPlayingId(null); URL.revokeObjectURL(url) }
      audio.onerror = () => { setPlayingId(null); URL.revokeObjectURL(url) }
      await audio.play()
    } catch {
      setPlayingId(null)
      setError('Could not play message.')
    }
  }

  const activeMode = MODES.find((m) => m.id === mode)

  return (
    <div className="chat-shell">
      {/* Page banner */}
      <div className="chat-banner">
        <div className="chat-banner-inner">
          <div className="section-label">AI health assistant</div>
          <h1 className="chat-banner-title">
            Ask <span className="accent">anything</span> about your health
          </h1>
          <p className="chat-banner-body">
            Your personal assistant is here to help interpret your results, answer questions, and guide your next steps.
          </p>
        </div>
      </div>

      {/* Chat area */}
      <div className="page-body" style={{ display: 'flex', flexDirection: 'column', flex: 1, paddingTop: '1.75rem' }}>

        {/* Mode switcher */}
        <div className="chat-mode-bar">
          {MODES.map((m) => (
            <button
              key={m.id}
              type="button"
              className={`chat-mode-btn${mode === m.id ? ' active' : ''}`}
              onClick={m.id === 'checkin' ? startCheckin : () => switchMode(m.id)}
              disabled={loading}
            >
              {m.label}
            </button>
          ))}
          {mode !== 'general' && (
            <button
              type="button"
              className="chat-mode-reset"
              onClick={() => switchMode('general')}
              title="Back to general chat"
            >
              ✕ Reset
            </button>
          )}
        </div>

        <div className="chat-window">
          <div className="chat-messages" role="log" aria-live="polite">
            {messages.length === 0 && !loading && (
              <div className="chat-empty">
                <div className="chat-empty-icon">{mode === 'checkin' ? '📋' : '💬'}</div>
                <p className="chat-empty-title">
                  {mode === 'checkin' ? 'Daily Check-in' : 'Start the conversation'}
                </p>
                <p className="chat-empty-hint">{activeMode?.desc}</p>
              </div>
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
                    title="Play with voice"
                    aria-label="Play message"
                  >
                    {playingId === i ? '⏸ Playing…' : '🔊 Listen'}
                  </button>
                )}
              </div>
            ))}
            {loading && (
              <div className="chat-msg chat-msg--assistant">
                <span className="chat-msg-role">Assistant</span>
                <p className="chat-msg-content chat-msg-loading">
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                  <span className="typing-dot" />
                </p>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>

          {error && <p className="chat-error" role="alert">{error}</p>}

          <div className="chat-input-wrap">
            <input
              type="text"
              className="chat-input"
              placeholder={recording ? 'Listening…' : 'Type a message or use the mic…'}
              value={recording ? input + (interimTranscript ? ` ${interimTranscript}` : '') : input}
              onChange={(e) => !recording && setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              disabled={loading}
            />
            <button
              type="button"
              className={`chat-mic${recording ? ' recording' : ''}`}
              onClick={recording ? stopRecording : startRecording}
              title={recording ? 'Stop' : 'Speak to type'}
              aria-label={recording ? 'Stop recording' : 'Start voice input'}
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
      </div>
    </div>
  )
}
