import { useState } from 'react'
import ActivityFeedback from './ActivityFeedback.jsx'

export default function ShortAnswerBlock({ block, persistedBlockState = {}, busy = false, onSubmit, readOnly = false, draft, onDraftChange }) {
  const [localResponse, setLocalResponse] = useState(persistedBlockState.response || '')
  const response = draft ?? localResponse
  const change = (value) => { setLocalResponse(value); onDraftChange?.(value) }
  const disabled = busy || readOnly || persistedBlockState.status === 'passed'
  const criteria = persistedBlockState.criteria || []
  return (
    <div className="session-block-body">
      <label className="session-prompt" htmlFor={`answer-${block.id}`}>{block.prompt}</label>
      <p className="session-response-hint">{block.responseHint}</p>
      <textarea id={`answer-${block.id}`} className="ui-field session-short-answer" value={response} maxLength={block.maxChars} rows={5} disabled={disabled} onChange={(event) => change(event.target.value)} />
      <p className="session-character-count" aria-live="polite">{response.length} / {block.maxChars} characters · at least {block.minChars}</p>
      <ActivityFeedback>{persistedBlockState.feedback}</ActivityFeedback>
      {criteria.length > 0 && <ul className="session-criteria-feedback" aria-label="Response feedback">{criteria.map((criterion) => <li key={criterion.id}><span aria-hidden="true">{criterion.passed ? '✓' : '↻'}</span>{criterion.feedback}</li>)}</ul>}
      {persistedBlockState.nextStep && <p className="session-next-step"><strong>Next step:</strong> {persistedBlockState.nextStep}</p>}
      {persistedBlockState.status === 'passed' || readOnly
        ? <p className="session-complete-label" role="status">Response saved</p>
        : <button type="button" className="ui-button ui-button-primary" disabled={busy || response.trim().length < block.minChars} onClick={() => onSubmit?.(response)}>{busy ? 'Checking…' : persistedBlockState.status === 'needs_retry' ? 'Try again' : 'Submit response'}</button>}
    </div>
  )
}
