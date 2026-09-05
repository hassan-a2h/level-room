import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getReviews, getReviewCount, startReviewSession } from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import Button from '../components/ui/Button.jsx'
import StatusBadge from '../components/ui/StatusBadge.jsx'

function EmptyQueue({ onReturn }) {
  return (
    <section className="ui-surface ui-surface-raised mx-auto flex min-h-[35vh] max-w-2xl flex-col items-center justify-center px-6 py-10 text-center" aria-labelledby="empty-reviews-title">
      <div className="mb-4 text-5xl" aria-hidden="true">🌿</div>
      <h2 id="empty-reviews-title" className="mb-2 text-xl font-bold ui-text">No reviews due today</h2>
      <p className="mb-6 max-w-md ui-text-secondary">
        You are all caught up! Come back when new reviews are scheduled.
      </p>
      <Button variant="secondary" onClick={onReturn}>Back to learning</Button>
    </section>
  )
}

function ReviewLoadError({ onRetry }) {
  return (
    <section className="ui-surface ui-surface-raised mx-auto max-w-2xl p-6 text-center" aria-labelledby="reviews-error-title">
      <h2 id="reviews-error-title" className="mb-2 text-lg font-semibold ui-text">Reviews could not be loaded</h2>
      <p className="mb-5 ui-text-secondary">Check your connection and try again.</p>
      <Button onClick={onRetry}>Try again</Button>
    </section>
  )
}

export default function ReviewQueue() {
  const [reviews, setReviews] = useState(null)
  const [counts, setCounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [startingSession, setStartingSession] = useState(false)
  const navigate = useNavigate()

  const loadData = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const [reviewsData, countData] = await Promise.all([
        getReviews(),
        getReviewCount(),
      ])
      setReviews(reviewsData)
      setCounts(countData)
    } catch (err) {
      setError(err.message || 'Failed to load review queue.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    loadData()
  }, [loadData])

  const handleStartReview = async () => {
    setStartingSession(true)
    setError('')
    try {
      const session = await startReviewSession()
      navigate(`/review/${session.sessionId}`, {
        state: {
          sessionId: session.sessionId,
          questions: session.questions,
          totalQuestions: session.totalQuestions,
          remainingCount: session.remainingCount,
        },
      })
    } catch (err) {
      setError(err.message || 'Failed to start review session.')
      setStartingSession(false)
    }
  }

  const dueItems = reviews?.due || []
  const totalDue = counts?.totalDue || 0

  return (
    <div className="ui-page min-h-screen">
      <AppHeader dueCount={loading ? undefined : totalDue} />
      <main className="ui-container max-w-5xl space-y-6 px-4 py-6 sm:py-8">
        <h1 className="text-3xl font-bold ui-text">Review Queue</h1>
        {loading && (
          <p className="ui-text-secondary" role="status" aria-live="polite">Loading review queue…</p>
        )}
        {error && (
          <div className="ui-alert ui-alert-danger" role="alert">
            {error}
          </div>
        )}

        {!loading && reviews === null && error && <ReviewLoadError onRetry={loadData} />}

        {!loading && reviews !== null && dueItems.length === 0 && <EmptyQueue onReturn={() => navigate('/')} />}

        {!loading && dueItems.length > 0 && (
          <>
          <section className="ui-surface ui-surface-flat flex flex-wrap items-center justify-between gap-4 p-4" aria-label="Review summary">
            <p className="flex flex-wrap items-center gap-2 text-sm ui-text-secondary">
              <strong className="ui-text">{totalDue} review{totalDue !== 1 ? 's' : ''} due</strong>
              {counts?.overdue > 0 && <StatusBadge status="danger">{counts.overdue} overdue</StatusBadge>}
            </p>
            <Button onClick={handleStartReview} disabled={startingSession}>
              {startingSession ? 'Starting…' : 'Start Review'}
            </Button>
          </section>
          <div className="space-y-3" aria-label="Reviews due" role="list">
            {dueItems.map((item) => (
              <article
                key={item.id}
                role="listitem"
                className={`ui-surface ui-surface-flat flex flex-wrap items-start justify-between gap-4 border-l-4 p-4 sm:p-5 ${item.isOverdue ? 'ui-review-item-overdue' : 'ui-review-item'}`}
              >
                <div className="flex-1 min-w-0">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider ui-text-muted">{item.topicTitle}</span>
                    {item.isOverdue && (
                      <StatusBadge status="danger">Overdue</StatusBadge>
                    )}
                    {item.reviewType === 'cumulative' && (
                      <StatusBadge status="progress">Module review</StatusBadge>
                    )}
                  </div>
                  <h2 className="truncate font-semibold ui-text">{item.lessonTitle}</h2>
                  <p className="mt-1 text-sm ui-text-secondary">
                    Due: {item.dueDate} · Interval: {item.intervalIndex + 1} of 5
                  </p>
                </div>
              </article>
            ))}
          </div>
          </>
        )}
      </main>
    </div>
  )
}
