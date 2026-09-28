import StatusBadge from '../../components/ui/StatusBadge.jsx'
import styles from './learningReviewSurface.module.css'

export default function ReviewQueueSurface({ model, className, variant }) {
  const { busy = {}, counts = {}, actions = {} } = model
  return <main className={[styles.root, className].filter(Boolean).join(' ')} data-theme-view="ReviewQueueView" data-view-model="connected" data-pack-style={variant}>
    <header className="review-page-heading"><p className="ui-text-muted">A small return to what you’ve learned</p><h1 className="ui-text">Retrieval practice</h1></header>
    {busy.loading && <p className="ui-text-secondary" role="status" aria-live="polite">Loading review queue…</p>}
    {model.error && <div className="ui-alert ui-alert-danger" role="alert">{model.error.message}</div>}
    {!busy.loading && model.dueItems.length === 0 && model.error && <section className="ui-surface ui-surface-raised review-empty" aria-labelledby="reviews-error-title"><h2 id="reviews-error-title">Practice could not be loaded</h2><p>Check your connection, then try again.</p><button className="ui-button ui-button-primary" type="button" onClick={actions.retry}>Try again</button></section>}
    {!busy.loading && model.dueItems.length === 0 && !model.error && <section className="ui-surface ui-surface-raised review-empty" aria-labelledby="empty-reviews-title"><span aria-hidden="true" className="review-empty-mark">✦</span><h2 id="empty-reviews-title">No retrieval practice due today</h2><p>Your queue is clear. Continue your Trail, and new practice will appear here when it is ready.</p><button className="ui-button ui-button-secondary" type="button" onClick={actions.returnToTrail}>Continue Trail</button></section>}
    {!busy.loading && model.dueItems.length > 0 && <>
      <section className="review-queue-summary" aria-label="Review summary"><p><strong>{counts.totalDue || 0} retrieval item{counts.totalDue !== 1 ? 's' : ''} due</strong>{counts.overdue > 0 && <StatusBadge status="danger">{counts.overdue} overdue</StatusBadge>}</p><button className="ui-button ui-button-primary" type="button" onClick={actions.start} disabled={busy.starting}>{busy.starting ? 'Starting…' : 'Start retrieval practice'}</button></section>
      <div className="review-queue-list" role="list" aria-label="Reviews due">{model.dueItems.map((item) => <article key={item.id} role="listitem" className={`review-queue-card${item.isOverdue ? ' is-overdue' : ''}`}>
        <div className="review-queue-card-meta"><span>Track: {item.topicTitle || 'Your Track'}</span>{item.isOverdue && <StatusBadge status="danger">Overdue</StatusBadge>}{item.reviewType === 'cumulative' && <StatusBadge status="progress">Cumulative review</StatusBadge>}</div>
        <h2>{item.lessonTitle || 'Retrieval practice item'}</h2><p>{item.moduleTitle && <><span>Chapter: {item.moduleTitle}</span><span aria-hidden="true"> · </span></>}{item.isOverdue ? (item.dueDate ? `Ready to revisit from ${item.dueDate}.` : 'Ready to revisit.') : (item.dueDate ? `Scheduled retrieval practice is ready on ${item.dueDate}.` : 'This retrieval practice is scheduled.')}</p>
      </article>)}</div>
    </>}
  </main>
}
