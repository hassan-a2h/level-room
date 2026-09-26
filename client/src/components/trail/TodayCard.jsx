import { Link } from 'react-router-dom'

function primaryAction(nextAction, handlers) {
  if (!nextAction) return null
  const topicId = nextAction.topicId

  if (nextAction.kind === 'resume_session' || nextAction.kind === 'start_session') {
    if (!Number.isSafeInteger(nextAction.lessonId) || !Number.isSafeInteger(topicId)) return null
    const label = nextAction.kind === 'resume_session' ? 'Continue Session' : 'Start Session'
    return <Link className="ui-button ui-button-primary" to={`/topic/${topicId}/lesson/${nextAction.lessonId}`}>{label}</Link>
  }

  if (nextAction.kind === 'resume_checkpoint' || nextAction.kind === 'start_checkpoint') {
    if (!Number.isSafeInteger(nextAction.moduleId)) return null
    const label = nextAction.kind === 'resume_checkpoint' ? 'Resume checkpoint' : 'Start checkpoint'
    return (
      <button className="ui-button ui-button-primary" type="button" onClick={() => handlers.onStartCheckpoint?.(nextAction.moduleId)}>
        {label}
      </button>
    )
  }

  if (nextAction.kind === 'start_review') {
    return <Link className="ui-button ui-button-primary" to="/reviews">Start review</Link>
  }

  if (nextAction.kind === 'setup_track') {
    const href = Number.isSafeInteger(topicId) ? `/onboarding?topicId=${encodeURIComponent(topicId)}` : '/onboarding'
    return <Link className="ui-button ui-button-primary" to={href}>Finish setup</Link>
  }

  if (nextAction.kind === 'track_complete' && Number.isSafeInteger(topicId)) {
    return <Link className="ui-button ui-button-primary" to={`/topic/${topicId}/continue`}>Plan my next Track</Link>
  }

  return null
}

export default function TodayCard({ nextAction, reviewSummary, onStartCheckpoint }) {
  const action = nextAction || { kind: 'unavailable', title: 'Your next step is not available yet.' }
  const title = action.sessionTitle || action.chapterTitle || action.title || action.topicTitle || 'Your next step'
  const primary = primaryAction(action, { onStartCheckpoint })
  const showSecondaryReview = action.kind !== 'start_review' && (reviewSummary?.totalDue || 0) > 0

  return (
    <section className="ui-surface ui-surface-raised p-5 sm:p-6" aria-label="Today's next step">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-xs font-semibold uppercase tracking-[0.14em] ui-text-muted">Continue your Trail{action.topicTitle ? ` · ${action.topicTitle}` : ''}</p>
          <h2 id="today-next-step-title" className="mt-2 text-xl font-semibold ui-text">{title}</h2>
          {(action.kind === 'resume_session' || action.kind === 'start_session') && (
            <p className="mt-1 text-sm ui-text-secondary">{action.chapterTitle}</p>
          )}
          {action.currentActivity && <p className="mt-3 text-sm ui-text-secondary">Next up: {action.currentActivity}</p>}
          {Number.isInteger(action.estimatedMinutes) && action.estimatedMinutes > 0 && (
            <p className="mt-3 inline-flex rounded-full px-3 py-1 text-sm ui-text-secondary" style={{ backgroundColor: 'var(--ui-surface-alt)' }}>
              About {action.estimatedMinutes} min
            </p>
          )}
          {action.kind === 'start_review' && (
            <p className="mt-2 text-sm ui-text-secondary">{action.overdueReviews} overdue {action.overdueReviews === 1 ? 'item' : 'items'} are ready for a gentle refresh.</p>
          )}
          {action.kind === 'unavailable' && (
            <p className="mt-2 text-sm ui-text-secondary">The Trail data needs attention before we can suggest a Session. Your progress is safe.</p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2">
          {primary}
          {showSecondaryReview && (
            <Link className="ui-button ui-button-secondary" to="/reviews">Review due items <span aria-hidden="true">· {reviewSummary.totalDue}</span></Link>
          )}
        </div>
      </div>
    </section>
  )
}
