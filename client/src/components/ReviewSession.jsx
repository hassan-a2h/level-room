import { useNavigate, useLocation } from 'react-router-dom'
import { useReviewController } from '../features/reviews/controller.js'
import AppHeader from './AppHeader.jsx'
import Button from './ui/Button.jsx'
import ProgressBar from './ui/ProgressBar.jsx'
import StatusBadge from './ui/StatusBadge.jsx'

function QuestionCard({ question, index, total, answer, onAnswerChange, onSubmit, onPrevious, showPrevious, actionLabel, disabled }) {
  return (
    <section className="ui-panel p-5 sm:p-7" aria-labelledby="review-question-title">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium ui-text-muted">
          Question {index + 1} of {total}
        </span>
        <StatusBadge status="neutral">{question.topicTitle}</StatusBadge>
      </div>
      <h2 id="review-question-title" className="mb-5 text-lg font-semibold ui-text">
        {question.text}
      </h2>
      <label htmlFor="review-answer" className="ui-field-label">Your answer</label>
      <textarea
        id="review-answer"
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="Type your answer..."
        rows={4}
        className="ui-field w-full resize-y"
        disabled={disabled}
      />
      <div className="mt-4 flex justify-between">
        {showPrevious
          ? <Button variant="secondary" onClick={onPrevious} disabled={disabled}>Previous</Button>
          : <span />}
        <Button
          onClick={onSubmit}
          disabled={disabled || !answer.trim()}
        >
          {disabled ? 'Submitting...' : actionLabel}
        </Button>
      </div>
    </section>
  )
}

function FeedbackCard({ feedback, onNext }) {
  const score = Number(feedback?.score)
  const label = feedback?.correct
    ? 'Remembered'
    : feedback?.almost || feedback?.nearCorrect || (Number.isFinite(score) && score > 0)
      ? 'Almost'
      : 'Revisit'
  const status = label === 'Remembered' ? 'success' : label === 'Almost' ? 'progress' : 'warning'
  return (
    <section className="ui-panel p-5 sm:p-7" aria-live="polite">
      <div className="mb-4 flex items-center gap-3">
        <span aria-hidden="true" className="text-lg">{label === 'Remembered' ? '✓' : '↻'}</span>
        <StatusBadge status={status}>{label}</StatusBadge>
      </div>
      <p className="mb-5 ui-text-secondary">
        {feedback?.explanation || 'No explanation provided.'}
      </p>
      <div className="flex justify-end">
        <Button onClick={onNext}>Next</Button>
      </div>
    </section>
  )
}

function SummaryCard({ result, onBack }) {
  const { overallScore, passed, perItemResults, accelerated, regressed } = result
  const correctCount = perItemResults?.reduce((sum, item) => sum + (item.correctCount || 0), 0) || 0
  const totalAnswered = perItemResults?.reduce((sum, item) => sum + (item.totalCount || 0), 0) || 0

  return (
    <section className="ui-panel p-5 sm:p-7" aria-labelledby="review-complete-title">
      <h2 id="review-complete-title" className="mb-5 text-2xl font-bold ui-text">{passed ? 'Ready to continue' : 'Revisit when ready'}</h2>

      <div className="mb-6 flex flex-wrap items-center gap-3">
        <div className="text-3xl font-bold ui-text">
          {overallScore}%
        </div>
        <div className="text-sm ui-text-secondary">
          {correctCount} remembered · {Math.max(0, totalAnswered - correctCount)} to revisit
        </div>
        {accelerated && <StatusBadge status="progress">Next review spaced further</StatusBadge>}
        {regressed && <StatusBadge status="warning">More practice scheduled</StatusBadge>}
      </div>

      {perItemResults && perItemResults.length > 0 && (
        <div className="space-y-2 mb-6">
          <h3 className="text-sm font-semibold ui-text-muted uppercase tracking-wider">By Chapter</h3>
          {perItemResults.map((item, idx) => (
            <div key={idx} className="ui-surface ui-surface-flat flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2">
              <span className="text-sm ui-text-secondary">
                {item.chapterTitle || item.moduleTitle || item.lessonTitle || 'Chapter review'}
              </span>
              <StatusBadge status={item.score >= 80 ? 'success' : 'warning'}>{item.score}%</StatusBadge>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <Button onClick={onBack}>Continue Trail</Button>
      </div>
    </section>
  )
}

export default function ReviewSession() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sessionId, questions = [], totalQuestions = 0, remainingCount = 0 } = location.state || {}
  const controller = useReviewController({ sessionId, questions, totalQuestions, remainingCount })
  const { model } = controller

  if (model.phase === 'expired') {
    return (
      <div className="ui-page min-h-screen">
        <AppHeader variant="focus" title="Retrieval practice" returnTo="/reviews" returnLabel="Review Queue" />
        <main className="ui-container max-w-3xl px-4 py-10">
          <section className="ui-panel p-6 text-center" aria-labelledby="missing-review-title">
            <h2 id="missing-review-title" className="mb-2 text-xl font-semibold ui-text">Review session unavailable</h2>
            <p className="mb-5 ui-text-secondary">{model.error?.message || 'This review session is no longer available.'}</p>
            <Button variant="secondary" onClick={() => navigate('/reviews')}>Return to Review Queue</Button>
          </section>
        </main>
      </div>
    )
  }

  if (model.phase === 'complete' && model.result) {
    return (
      <div className="ui-page min-h-screen">
        <AppHeader variant="focus" title="Review results" returnTo="/" returnLabel="Dashboard" />
        <main className="ui-container max-w-3xl px-4 py-6 sm:py-8">
          <SummaryCard result={model.result} onBack={() => navigate('/')} />
        </main>
      </div>
    )
  }

  const currentQuestion = model.currentQuestion
  const isCollecting = model.phase === 'answers'

  return (
    <div className="ui-page min-h-screen">
      <AppHeader
        variant="focus"
        title={currentQuestion?.lessonTitle || 'Review session'}
        returnLabel="Review Queue"
        onReturn={async () => { await controller.cancel(); navigate('/reviews') }}
        detail={`Question ${model.currentIndex + 1} of ${questions.length}`}
      />
      <main className="ui-container max-w-3xl px-4 py-6 sm:py-8">
        <section className="ui-surface ui-surface-flat mb-5 p-4" aria-label="Review progress">
          <ProgressBar value={isCollecting ? model.currentIndex + 1 : model.feedbackIndex + 1} max={questions.length} label="Review question progress" />
          {remainingCount > 0 && (
            <p className="mt-2 text-sm ui-text-muted">
              {remainingCount} more retrieval item{remainingCount !== 1 ? 's' : ''} queued for later
            </p>
          )}
        </section>
        {model.error && (
          <div className="ui-alert ui-alert-danger mb-4" role="alert">
            {model.error.message}
          </div>
        )}

        {!isCollecting ? (
          <FeedbackCard feedback={model.currentFeedback} onNext={controller.nextFeedback} />
        ) : (
          <QuestionCard
            question={currentQuestion}
            index={model.currentIndex}
            total={questions.length}
            answer={model.answers[currentQuestion?.id] || ''}
            onAnswerChange={(value) => controller.setAnswer(currentQuestion?.id, value)}
            onPrevious={controller.previousQuestion}
            showPrevious={model.currentIndex > 0}
            onSubmit={model.currentIndex === questions.length - 1 ? controller.submitAnswers : controller.nextQuestion}
            actionLabel={model.currentIndex === questions.length - 1 ? 'Submit all answers' : 'Next question'}
            disabled={model.busy.submitting}
          />
        )}
      </main>
    </div>
  )
}
