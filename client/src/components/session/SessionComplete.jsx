import { Link } from 'react-router-dom'
import { Check } from 'lucide-react'

export default function SessionComplete({ session, activityDocument, activityState }) {
  const outcomes = Array.isArray(session?.outcomes) ? session.outcomes : []
  const reflectionIds = new Set((activityDocument?.blocks || []).filter((block) => block.type === 'reflection').map((block) => block.id))
  const takeaway = Object.entries(activityState?.blocks || {}).find(([blockId, entry]) => reflectionIds.has(blockId) && typeof entry?.response === 'string' && entry.response.trim())?.[1]?.response
  return (
    <section className="session-complete-card" aria-labelledby="session-complete-title" aria-live="polite">
      <span className="session-complete-mark" aria-hidden="true"><Check /></span>
      <p className="session-eyebrow">Session complete</p>
      <h2 id="session-complete-title">Session complete</h2>
      <p>You moved this idea into practice.</p>
      {outcomes.length > 0 && <div className="session-outcomes-practiced"><h3>Outcomes practiced</h3><ul>{outcomes.map((outcome) => <li key={outcome.id}>{outcome.title}</li>)}</ul></div>}
      <div className="session-takeaway-summary"><h3>Your takeaway</h3><p>{takeaway || `You worked through ${activityDocument?.blocks?.length || 0} focused activities in this Session.`}</p></div>
      <p className="session-review-timing">Review this idea tomorrow if it is due then; otherwise follow your review queue.</p>
      <Link className="ui-button ui-button-primary" to="/">Back to your Trail</Link>
    </section>
  )
}
