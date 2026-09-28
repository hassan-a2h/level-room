import { Suspense } from 'react'
import { useNavigate } from 'react-router-dom'
import { useReviewQueueController } from '../features/reviews/controller.js'
import AppHeader from '../components/AppHeader.jsx'
import { useThemeView } from '../theme/ThemeProvider.jsx'

export default function ReviewQueue() {
  const { model, loadData, startSession } = useReviewQueueController()
  const navigate = useNavigate()
  const ReviewQueueThemeView = useThemeView('ReviewQueueView')

  const handleStartReview = async () => {
    const session = await startSession()
    if (!session) return
    navigate(`/review/${session.sessionId}`, {
      state: {
        sessionId: session.sessionId,
        questions: session.questions,
        totalQuestions: session.totalQuestions,
        remainingCount: session.remainingCount,
      },
    })
  }

  const themedModel = {
    ...model,
    actions: {
      start: handleStartReview,
      retry: loadData,
      returnToTrail: () => navigate('/'),
    },
  }

  return (
    <div className="ui-page min-h-screen">
      <AppHeader dueCount={model.busy.loading ? undefined : model.counts.totalDue || 0} />
      <Suspense fallback={<main className="ui-container px-4 py-6" role="status">Preparing retrieval practice…</main>}><ReviewQueueThemeView model={themedModel} /></Suspense>
    </div>
  )
}
