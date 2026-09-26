export default function CheckpointIntro({
  moduleTitle,
  outcomes = [],
  lessonCount = 0,
  ready = true,
  lessonsRemaining = 0,
  loading = false,
  error = '',
  onStart,
  onContinueLearning,
}) {
  const coreCount = outcomes.filter((outcome) => outcome.role === 'core').length
  return (
    <section className="checkpoint-intro" aria-labelledby="checkpoint-title">
      <div className="checkpoint-eyebrow"><span aria-hidden="true">✦</span> Chapter checkpoint</div>
      <h2 id="checkpoint-title" className="checkpoint-title">Show what you can do</h2>
      <p className="checkpoint-lede">
        {moduleTitle ? `Bring the ideas from ${moduleTitle} together in one calm, focused review.` : 'Bring the ideas from this Chapter together in one calm, focused review.'}
      </p>

      <div className="checkpoint-facts" aria-label="Checkpoint details">
        <span><strong>~8 min</strong><small>take your time</small></span>
        <span><strong>80% overall</strong><small>to clear the Chapter</small></span>
        <span><strong>{coreCount ? '60%+' : 'Every Session'}</strong><small>{coreCount ? 'on every core outcome' : `${lessonCount} Sessions completed`}</small></span>
      </div>

      <div className="checkpoint-outcome-panel">
        <div className="checkpoint-section-heading">
          <div><h3>What you’ll bring together</h3><p>{outcomes.length} learning outcomes from {lessonCount} Sessions</p></div>
          <span className="checkpoint-spark" aria-hidden="true">✧</span>
        </div>
        <ul className="checkpoint-outcome-list">
          {outcomes.map((outcome) => (
            <li key={outcome.id}>
              <span className={outcome.role === 'core' ? 'checkpoint-outcome-dot is-core' : 'checkpoint-outcome-dot'} aria-hidden="true">{outcome.role === 'core' ? '✦' : '·'}</span>
              <span>{outcome.title}</span>
              <span className="checkpoint-outcome-role">{outcome.role === 'core' ? 'Core' : 'Explore'}</span>
            </li>
          ))}
        </ul>
      </div>

      {error && <div className="ui-alert ui-alert-danger" role="alert">{error}</div>}
      {!ready ? (
        <div className="checkpoint-lock-note" role="status">
          <span aria-hidden="true">🌱</span>
          <div><strong>Your checkpoint will be here when you’re ready.</strong><p>Finish {lessonsRemaining} more {lessonsRemaining === 1 ? 'Session' : 'Sessions'} first. Your learning comes before the score.</p></div>
          {onContinueLearning && <button className="ui-button ui-button-primary" type="button" onClick={onContinueLearning}>Continue learning</button>}
        </div>
      ) : (
        <div className="checkpoint-intro-actions">
          <p>Answers save as you go. You can pause and come back whenever you need.</p>
          <button className="ui-button ui-button-primary checkpoint-start" type="button" onClick={onStart} disabled={loading}>
            {loading ? 'Making your checkpoint…' : 'Begin checkpoint'} <span aria-hidden="true">→</span>
          </button>
        </div>
      )}
    </section>
  )
}
