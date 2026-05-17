import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getReviews, getReviewCount, startReviewSession } from '../api.js'

function EmptyQueue() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[40vh] px-4">
      <div className="text-5xl mb-4">🎉</div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">No reviews due today</h2>
      <p className="text-gray-600 text-center max-w-md">
        You are all caught up! Come back when new reviews are scheduled.
      </p>
    </div>
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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading review queue...</div>
      </div>
    )
  }

  const dueItems = reviews?.due || []
  const totalDue = counts?.totalDue || 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-4xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Review Queue</h1>
          <button
            onClick={() => navigate('/')}
            className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </header>

      {/* Main content */}
      <main className="max-w-4xl mx-auto px-4 py-6">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4" role="alert">
            {error}
          </div>
        )}

        {totalDue > 0 && (
          <div className="mb-6 flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">
                <span className="font-semibold text-gray-900">{totalDue}</span> review{totalDue !== 1 ? 's' : ''} due
                {counts?.overdue > 0 && (
                  <span className="text-red-600 ml-1">({counts.overdue} overdue)</span>
                )}
              </p>
            </div>
            <button
              onClick={handleStartReview}
              disabled={startingSession}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
            >
              {startingSession ? 'Starting...' : 'Start Review'}
            </button>
          </div>
        )}

        {dueItems.length === 0 ? (
          <EmptyQueue />
        ) : (
          <div className="space-y-3">
            {dueItems.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border bg-white p-4 flex items-center justify-between ${
                  item.isOverdue ? 'border-red-200 bg-red-50' : 'border-gray-200'
                }`}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                      {item.topicTitle}
                    </span>
                    {item.isOverdue && (
                      <span className="inline-flex items-center rounded-full bg-red-100 px-2 py-0.5 text-xs font-medium text-red-800">
                        Overdue
                      </span>
                    )}
                    {item.reviewType === 'cumulative' && (
                      <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-800">
                        Module Review
                      </span>
                    )}
                  </div>
                  <h3 className="font-medium text-gray-900 truncate">
                    {item.lessonTitle}
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Due: {item.dueDate} · Interval: {item.intervalIndex + 1} of 5
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  )
}
