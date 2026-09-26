function OutcomeScore({ outcome, evidence }) {
  const score = evidence?.score
  const failed = !Number.isFinite(score) || score < 60
  return (
    <li className={`checkpoint-result-outcome${failed ? ' is-needs-practice' : ' is-solid'}`}>
      <span className="checkpoint-outcome-dot" aria-hidden="true">{failed ? '↗' : '✓'}</span>
      <span className="checkpoint-result-outcome-copy"><strong>{outcome.title}</strong><small>{outcome.role === 'core' ? 'Core skill' : 'Supporting idea'}{failed ? ' · worth another look' : ' · looking solid'}</small></span>
      <span className="checkpoint-score-pill">{Number.isFinite(score) ? `${score}%` : 'Not yet'}</span>
    </li>
  )
}

export default function CheckpointResults({ evaluation, outcomes = [], moduleLessons = [], questions = [], answers = {}, onBack, onRetake, onPartialRetest, onReviewLesson, loading = false, error = '' }) {
  const passed = evaluation.passed === true
  const failedIds = new Set(evaluation.failedOutcomeIds || [])
  const missedOutcomes = outcomes.filter((outcome) => failedIds.has(outcome.id))

  return (
    <section className={`checkpoint-results${passed ? ' is-passed' : ' is-review'}`} aria-labelledby="checkpoint-result-title" aria-live="polite">
      {passed && <span className="checkpoint-celebration-mark" aria-hidden="true">✦</span>}
      <div className="checkpoint-result-eyebrow">{passed ? 'A lovely bit of progress' : 'Every gap is a next step'}</div>
      <h2 id="checkpoint-result-title">{passed ? 'Chapter checkpoint cleared' : 'You’re close — let’s strengthen a few ideas'}</h2>
      <p className="checkpoint-result-lede">
        {passed
          ? 'You brought the Chapter together and showed the core ideas are sticking. Onward when you’re ready.'
          : 'Your overall score is a starting point, not a verdict. Let’s look at the outcomes that need another pass.'}
      </p>

      <div className="checkpoint-score-summary">
        <strong>{evaluation.overallScore}%</strong>
        <span>overall mastery</span>
        <span className="checkpoint-score-rule">{passed ? '80% goal reached' : '80% overall · 60% on each core outcome'}</span>
      </div>

      <section className="checkpoint-result-section" aria-labelledby="outcome-results-title">
        <div className="checkpoint-section-heading"><div><h3 id="outcome-results-title">Your outcome map</h3><p>Progress is made of small, specific skills.</p></div></div>
        <ul className="checkpoint-result-outcomes">
          {outcomes.map((outcome) => <OutcomeScore key={outcome.id} outcome={outcome} evidence={evaluation.perOutcomeEvidence?.[outcome.id]} />)}
        </ul>
      </section>

      {missedOutcomes.length > 0 && (
        <section className="checkpoint-result-section checkpoint-review-section" aria-labelledby="review-outcomes-title">
          <h3 id="review-outcomes-title">A gentle review path</h3>
          <p>Revisit the related Session, then try a short checkpoint just on these ideas.</p>
          <ul className="checkpoint-review-list">
            {missedOutcomes.map((outcome) => {
              const related = moduleLessons.filter((lesson) => (lesson.outcomes || []).some((item) => item.id === outcome.id))
              return (
                <li key={outcome.id}>
                  <span>{outcome.title}</span>
                  {related.map((lesson) => <button key={lesson.id} className="ui-button ui-button-secondary" type="button" onClick={() => onReviewLesson(lesson.id)}>Review {lesson.title}</button>)}
                </li>
              )
            })}
          </ul>
        </section>
      )}

      {evaluation.feedback?.length > 0 && (
        <details className="checkpoint-feedback-details">
          <summary>See feedback on your answers</summary>
          <ul>
            {evaluation.feedback.map((item, index) => {
              const question = questions.find((candidate) => candidate.id === item.questionId)
              const criteria = Array.isArray(item.criteria) ? item.criteria : []
              return <li key={`${item.questionId}-${index}`}><strong>{question?.text || `Question: ${item.questionId}`}</strong>{item.explanation && <p>{item.explanation}</p>}{criteria.map((criterion, criterionIndex) => <p key={`${item.questionId}-${index}-${criterionIndex}`}>{criterion.feedback}</p>)}{answers[item.questionId] && <p className="checkpoint-answer-echo">Your answer: {answers[item.questionId]}</p>}</li>
            })}
          </ul>
        </details>
      )}

      {error && <div className="ui-alert ui-alert-danger" role="alert">{error}</div>}
      <div className="checkpoint-result-actions">
        {passed ? (
          <button className="ui-button ui-button-primary" type="button" onClick={onBack}>Continue your Trail <span aria-hidden="true">→</span></button>
        ) : (
          <>
            {missedOutcomes.length > 0 && <button className="ui-button ui-button-primary" type="button" onClick={onPartialRetest} disabled={loading}>{loading ? 'Preparing practice…' : 'Practice missed outcomes'}</button>}
            <button className="ui-button ui-button-secondary" type="button" onClick={onRetake} disabled={loading}>Take full checkpoint again</button>
            <button className="ui-button ui-button-quiet" type="button" onClick={onBack}>Back to my Trail</button>
          </>
        )}
      </div>
    </section>
  )
}
