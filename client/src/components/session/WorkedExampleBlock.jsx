import { useEffect, useState } from 'react'
import MarkdownContent from '../MarkdownContent.jsx'

export default function WorkedExampleBlock({ block, persistedBlockState = {}, busy = false, onComplete, readOnly = false }) {
  const isFinal = persistedBlockState.status === 'completed' || readOnly
  const [revealed, setRevealed] = useState(isFinal ? block.steps.length : 0)
  useEffect(() => { if (isFinal) setRevealed(block.steps.length) }, [isFinal, block.steps.length])
  const visibleSteps = block.steps.slice(0, revealed)

  return (
    <div className="session-block-body">
      <p className="session-prompt">{block.problem}</p>
      <ol className="session-worked-steps" aria-label="Worked example steps">
        {visibleSteps.map((step) => <li key={step.id}><span className="session-step-count">{block.steps.indexOf(step) + 1}</span><div><h4>{step.title}</h4><MarkdownContent content={step.content} /></div></li>)}
      </ol>
      {revealed === block.steps.length && <div className="session-takeaway"><strong>Takeaway</strong><MarkdownContent content={block.takeaway} /></div>}
      {!isFinal && revealed < block.steps.length && <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={() => setRevealed((count) => Math.min(count + 1, block.steps.length))}>Reveal next step</button>}
      {isFinal
        ? <p className="session-complete-label" role="status">Example completed</p>
        : revealed === block.steps.length && <button type="button" className="ui-button ui-button-primary" disabled={busy} onClick={() => onComplete?.({ action: 'continue' })}>Continue</button>}
    </div>
  )
}
