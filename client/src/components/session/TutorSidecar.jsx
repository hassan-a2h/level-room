import { useCallback, useEffect, useRef, useState } from 'react'
import { sendChatMessage } from '../../api.js'
import MarkdownContent from '../MarkdownContent.jsx'

const MAX_MESSAGE_LENGTH = 2000
const COLLAPSED_KEY = 'mastery-roadmap-guide-collapsed'
const SUGGESTIONS = ['Give me a hint', 'Show another example', 'Why was this wrong?']

function storedCollapsed() {
  try { return window.sessionStorage.getItem(COLLAPSED_KEY) === '1' } catch { return false }
}

async function readTutorStream(response, onText) {
  if (!response?.body?.getReader) throw new Error('The guide response stream is unavailable. Please retry.')
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  const consume = (line) => {
    if (!line.startsWith('data:')) return
    const payload = line.slice(5).trim()
    if (!payload) return
    let value
    try { value = JSON.parse(payload) } catch { return }
    if (value === '[DONE]') return
    if (typeof value === 'string') {
      fullText += value
      onText(fullText)
    } else if (value?.error) {
      throw new Error(value.error)
    }
  }
  try {
    while (true) {
      const { value, done } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split(/\r?\n/)
      buffer = lines.pop() || ''
      lines.forEach(consume)
    }
    buffer += decoder.decode()
    if (buffer) consume(buffer)
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  }
  if (!fullText.trim()) throw new Error('The guide returned no response. Please retry.')
  return fullText.trim()
}

function GuideMessages({ messages, streamingText, busy }) {
  return <div className="session-guide-messages" aria-live="polite">
    {messages.map((message, index) => <div className={`session-guide-message session-guide-${message.role}`} key={message.id || `${message.role}-${index}`}>
      <span className="sr-only">{message.role === 'user' ? 'You: ' : 'Guide: '}</span>
      {message.role === 'assistant' ? <MarkdownContent content={message.content} /> : message.content}
    </div>)}
    {streamingText && <div className="session-guide-message session-guide-assistant"><MarkdownContent content={streamingText} /></div>}
    {busy && !streamingText && <p className="session-guide-status" role="status">Your guide is thinking…</p>}
  </div>
}

export default function TutorSidecar({ topicId, lessonId, activityBlockId, messages: initialMessages = [] }) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [streamingText, setStreamingText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const [collapsed, setCollapsed] = useState(storedCollapsed)
  const trigger = useRef(null)

  const closeSheet = useCallback(() => {
    setOpen(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }, [])

  useEffect(() => {
    if (!open) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') closeSheet()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, closeSheet])

  const setCollapsedPreference = useCallback((next) => {
    setCollapsed(next)
    try { window.sessionStorage.setItem(COLLAPSED_KEY, next ? '1' : '0') } catch { /* The preference is session-only and optional. */ }
  }, [])

  const send = useCallback(async (message = draft) => {
    const content = message.trim()
    if (!content || content.length > MAX_MESSAGE_LENGTH || busy) return
    setBusy(true)
    setError('')
    setStreamingText('')
    try {
      const response = await sendChatMessage(topicId, lessonId, content, activityBlockId)
      const text = await readTutorStream(response, setStreamingText)
      setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content }, { id: `guide-${Date.now()}`, role: 'assistant', content: text }])
      setDraft('')
      setStreamingText('')
    } catch (requestError) {
      setError(requestError?.message || 'Your guide is temporarily unavailable. Please retry.')
      setStreamingText('')
    } finally {
      setBusy(false)
    }
  }, [activityBlockId, busy, draft, lessonId, topicId])

  const content = (variant) => <>
    <GuideMessages messages={messages} streamingText={streamingText} busy={busy} />
    {error && <div className="session-guide-error" role="alert"><span>{error}</span><button type="button" onClick={() => send()}>Retry</button></div>}
    <div className="session-guide-suggestions" aria-label="Suggested prompts">
      {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" disabled={busy} onClick={() => setDraft(suggestion)}>{suggestion}</button>)}
    </div>
    <form className="session-guide-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
      <label className="sr-only" htmlFor={`guide-message-${variant}`}>Message your guide</label>
      <textarea id={`guide-message-${variant}`} value={draft} maxLength={MAX_MESSAGE_LENGTH} rows={3} placeholder="Ask about this step…" disabled={busy} onChange={(event) => setDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))} />
      <div className="session-guide-compose-footer"><span>{draft.length} / {MAX_MESSAGE_LENGTH}</span><button type="submit" className="ui-button ui-button-primary" disabled={busy || !draft.trim()}>{busy ? 'Sending…' : 'Send'}</button></div>
    </form>
  </>

  return <>
    <aside className="session-tutor-sticky" aria-label="Ask your guide" hidden={open}>
      <div className="session-tutor-heading"><div><p className="session-eyebrow">Need a nudge?</p><h2>Ask your guide</h2></div><button type="button" aria-label={collapsed ? 'Expand guide' : 'Collapse guide'} onClick={() => setCollapsedPreference(!collapsed)}>{collapsed ? '+' : '−'}</button></div>
      {!collapsed && content('desktop')}
    </aside>
    <button ref={trigger} type="button" className="session-guide-trigger" aria-haspopup="dialog" onClick={() => setOpen(true)}>Ask your guide</button>
    {open && <div className="session-guide-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSheet() }}>
      <section className="session-guide-sheet" role="dialog" aria-modal="true" aria-label="Ask your guide">
        <div className="session-tutor-heading"><div><p className="session-eyebrow">Need a nudge?</p><h2>Ask your guide</h2></div><button type="button" aria-label="Close guide" onClick={closeSheet}>Close</button></div>
        {content('mobile')}
      </section>
    </div>}
  </>
}
