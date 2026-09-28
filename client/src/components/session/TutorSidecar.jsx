import { useCallback, useEffect, useRef, useState } from 'react'
import { sendChatMessage } from '../../api.js'
import MarkdownContent from '../MarkdownContent.jsx'

const MAX_MESSAGE_LENGTH = 2000
const SUGGESTIONS = ['Give me a hint', 'Show another example', 'Why was this wrong?']

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

export default function TutorSidecar({ topicId, lessonId, activityBlockId, messages: initialMessages = [], draft: controlledDraft, open: controlledOpen, onDraftChange, onOpenChange }) {
  const [draft, setDraft] = useState('')
  const [messages, setMessages] = useState(initialMessages)
  const [streamingText, setStreamingText] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [open, setOpen] = useState(false)
  const trigger = useRef(null)
  const currentDraft = controlledDraft ?? draft
  const isOpen = controlledOpen ?? open

  const changeDraft = (value) => {
    if (controlledDraft === undefined) setDraft(value)
    onDraftChange?.(value)
  }
  const changeOpen = (value) => {
    if (controlledOpen === undefined) setOpen(value)
    onOpenChange?.(value)
  }

  const closeSheet = useCallback(() => {
    changeOpen(false)
    requestAnimationFrame(() => trigger.current?.focus())
  }, [controlledOpen, onOpenChange])

  useEffect(() => {
    if (!isOpen) return undefined
    function onKeyDown(event) {
      if (event.key === 'Escape') closeSheet()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [isOpen, closeSheet])

  const send = useCallback(async (message = currentDraft) => {
    const content = message.trim()
    if (!content || content.length > MAX_MESSAGE_LENGTH || busy) return
    setBusy(true)
    setError('')
    setStreamingText('')
    try {
      const response = await sendChatMessage(topicId, lessonId, content, activityBlockId)
      const text = await readTutorStream(response, setStreamingText)
      setMessages((current) => [...current, { id: `user-${Date.now()}`, role: 'user', content }, { id: `guide-${Date.now()}`, role: 'assistant', content: text }])
      changeDraft('')
      setStreamingText('')
    } catch (requestError) {
      setError(requestError?.message || 'Your guide is temporarily unavailable. Please retry.')
      setStreamingText('')
    } finally {
      setBusy(false)
    }
  }, [activityBlockId, busy, currentDraft, lessonId, topicId])

  const content = (variant) => <>
    <GuideMessages messages={messages} streamingText={streamingText} busy={busy} />
    {error && <div className="session-guide-error" role="alert"><span>{error}</span><button type="button" onClick={() => send()}>Retry</button></div>}
    <div className="session-guide-suggestions" aria-label="Suggested prompts">
      {SUGGESTIONS.map((suggestion) => <button key={suggestion} type="button" disabled={busy} onClick={() => changeDraft(suggestion)}>{suggestion}</button>)}
    </div>
    <form className="session-guide-composer" onSubmit={(event) => { event.preventDefault(); send() }}>
      <label className="sr-only" htmlFor={`guide-message-${variant}`}>Message your guide</label>
      <textarea id={`guide-message-${variant}`} value={currentDraft} maxLength={MAX_MESSAGE_LENGTH} rows={3} placeholder="Ask about this step…" disabled={busy} onChange={(event) => changeDraft(event.target.value.slice(0, MAX_MESSAGE_LENGTH))} />
      <div className="session-guide-compose-footer"><span>{currentDraft.length} / {MAX_MESSAGE_LENGTH}</span><button type="submit" className="ui-button ui-button-primary" disabled={busy || !currentDraft.trim()}>{busy ? 'Sending…' : 'Send'}</button></div>
    </form>
  </>

  return <>
    <button ref={trigger} type="button" className="session-guide-trigger" aria-haspopup="dialog" onClick={() => changeOpen(true)}>Ask your guide</button>
    {isOpen && <div className="session-guide-sheet-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeSheet() }}>
      <section className="session-guide-sheet" role="dialog" aria-modal="true" aria-label="Ask your guide">
        <div className="session-tutor-heading"><div><p className="session-eyebrow">Need a nudge?</p><h2>Ask your guide</h2></div><button type="button" aria-label="Close guide" onClick={closeSheet}>Close</button></div>
        {content('sheet')}
      </section>
    </div>}
  </>
}
