import { Suspense } from 'react'
import { useLocation, useNavigate, useParams } from 'react-router-dom'
import { useReviewController } from '../features/reviews/controller.js'
import AppHeader from './AppHeader.jsx'
import { useThemeView } from '../theme/ThemeProvider.jsx'

export default function ReviewSession() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sessionId: routeSessionId } = useParams()
  const state = location.state || {}
  const sessionId = state.sessionId === routeSessionId ? state.sessionId : null
  const questions = Array.isArray(state.questions) ? state.questions : []
  const controller = useReviewController({
    sessionId,
    questions,
    totalQuestions: state.totalQuestions,
    remainingCount: state.remainingCount,
  })
  const { model } = controller
  const ReviewSessionThemeView = useThemeView('ReviewSessionView')

  const actions = {
    answer: controller.setAnswer,
    nextQuestion: controller.nextQuestion,
    previousQuestion: controller.previousQuestion,
    reviewAnswers: controller.reviewAnswers,
    editAnswer: controller.editAnswer,
    backToAnswers: controller.backToAnswers,
    submit: controller.submitAnswers,
    nextFeedback: controller.nextFeedback,
    returnToQueue: async () => {
      await controller.cancel()
      navigate('/reviews')
    },
    returnToTrail: () => navigate('/'),
  }

  const title = model.phase === 'expired'
    ? 'Retrieval practice'
    : model.phase === 'complete' ? 'Review results' : model.currentQuestion?.lessonTitle || 'Review session'
  const returnTo = model.phase === 'complete' ? '/' : '/reviews'
  const returnLabel = model.phase === 'complete' ? 'Dashboard' : 'Review Queue'

  return <div className="ui-page min-h-screen">
    <AppHeader variant="focus" title={title} returnTo={returnTo} returnLabel={returnLabel}
      detail={model.phase === 'answers' ? `Question ${model.currentIndex + 1} of ${model.totalQuestions}` : undefined}
      onReturn={model.phase === 'answers' || model.phase === 'answer-review' ? actions.returnToQueue : undefined}
    />
    <Suspense fallback={<main className="ui-container max-w-3xl px-4 py-6" role="status">Preparing this review session…</main>}>
      <ReviewSessionThemeView model={{ ...model, actions }} />
    </Suspense>
  </div>
}
