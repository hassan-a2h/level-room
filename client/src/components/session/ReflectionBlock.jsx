import { useState } from 'react'

export default function ReflectionBlock({ block, persistedBlockState = {}, busy = false, onComplete, readOnly = false, draft, onDraftChange }) {
  const [localResponse, setLocalResponse] = useState(persistedBlockState.response || '')
  const response = draft ?? localResponse
  const change = (value) => { setLocalResponse(value); onDraftChange?.(value) }
  const disabled = busy || readOnly || persistedBlockState.status === 'completed'
  return (
    <div className="session-block-body">
      <label className="session-prompt" htmlFor={`reflection-${block.id}`}>{block.prompt}</label>
      <textarea id={`reflection-${block.id}`} className="ui-field session-short-answer" rows={4} maxLength={block.maxChars} placeholder={block.placeholder || 'Write a takeaway for your future self…'} value={response} disabled={disabled} onChange={(event) => change(event.target.value)} />
      <p className="session-character-count" aria-live="polite">{response.length} / {block.maxChars} characters</p>
      {persistedBlockState.status === 'completed' || readOnly
        ? <p className="session-complete-label" role="status">Takeaway saved</p>
        : <button type="button" className="ui-button ui-button-primary" disabled={busy || !response.trim()} onClick={() => onComplete?.({ action: 'continue', response })}>{busy ? 'Saving…' : 'Save takeaway'}</button>}
    </div>
  )
}
