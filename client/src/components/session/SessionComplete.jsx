import { Link } from 'react-router-dom'

export default function SessionComplete({ session, activityDocument, activityState }) {
  const outcomes = Array.isArray(session?.outcomes) ? session.outcomes : []
  const takeaway = Object.values(activityState?.blocks || {}).find((entry) => typeof entry?.response === 'string' && entry.response.trim())?.response
  return (
    <section className="session-complete-card" aria-labelledby="session-complete-title" aria-live="polite">
      <span className="session-complete-mark" aria-hidden="true">✓</span>
      <p className="session-eyebrow">Session complete</p>
      <h2 id="session-complete-title">Session complete</h2>
      <p>You moved this idea into practice.</p>
      {outcomes.length > 0 && <div className="session-outcomes-practiced"><h3>Outcomes practiced</h3><ul>{outcomes.map((outcome) => <li key={outcome.id}>{outcome.title}</li>)}</ul></div>}
      <div className="session-takeaway-summary"><h3>Your takeaway</h3><p>{takeaway || `You worked through ${activityDocument?.blocks?.length || 0} focused activities in this Session.`}</p></div>
      <p className="session-review-timing">Review this idea tomorrow to help it stick.</p>
      <Link className="ui-button ui-button-primary" to="/">Back to your Trail</Link>
    </section>
  )
}
