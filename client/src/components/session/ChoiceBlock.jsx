import { useState } from 'react'
import ActivityFeedback from './ActivityFeedback.jsx'

export default function ChoiceBlock({ block, persistedBlockState = {}, busy = false, onSubmit, readOnly = false }) {
  const [selected, setSelected] = useState(persistedBlockState.response || '')
  const disabled = busy || readOnly || persistedBlockState.status === 'passed'
  return (
    <div className="session-block-body">
      <p className="session-prompt" id={`prompt-${block.id}`}>{block.prompt}</p>
      <fieldset className="session-choice-list" role="radiogroup" aria-labelledby={`prompt-${block.id}`}>
        {block.options.map((option) => (
          <label className={`session-choice-option${selected === option.id ? ' is-selected' : ''}`} key={option.id}>
            <input type="radio" name={`choice-${block.id}`} value={option.id} checked={selected === option.id} disabled={disabled} onChange={() => setSelected(option.id)} />
            <span>{option.label}</span>
          </label>
        ))}
      </fieldset>
      <ActivityFeedback>{persistedBlockState.feedback}</ActivityFeedback>
      {persistedBlockState.status === 'passed' || readOnly
        ? <p className="session-complete-label" role="status">Answer saved</p>
        : <button type="button" className="ui-button ui-button-primary" disabled={busy || !selected} onClick={() => onSubmit?.(selected)}>{busy ? 'Checking…' : persistedBlockState.status === 'needs_retry' ? 'Try again' : 'Check answer'}</button>}
    </div>
  )
}
