import { useState, useCallback } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { submitReview, cancelReview, getLocalDate } from '../api.js'

function QuestionCard({ question, index, total, answer, onAnswerChange, onSubmit, disabled }) {
  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6 mb-4">
      <div className="mb-4 flex items-center justify-between">
        <span className="text-sm font-medium text-gray-500">
          Question {index + 1} of {total}
        </span>
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-700">
          {question.topicTitle}
        </span>
      </div>
      <p className="text-base text-gray-900 mb-4 font-medium">
        {question.text}
      </p>
      <textarea
        value={answer}
        onChange={(e) => onAnswerChange(e.target.value)}
        placeholder="Type your answer..."
        rows={4}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 focus:outline-none resize-y"
        disabled={disabled}
      />
      <div className="mt-4 flex justify-end">
        <button
          onClick={onSubmit}
          disabled={disabled || !answer.trim()}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
        >
          {disabled ? 'Submitting...' : 'Submit Answer'}
        </button>
      </div>
    </div>
  )
}

function FeedbackCard({ feedback, question, onNext }) {
  const isCorrect = feedback?.correct
  return (
    <div className={`bg-white rounded-xl border p-6 mb-4 ${isCorrect ? 'border-green-200' : 'border-red-200'}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-sm font-bold ${isCorrect ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
          {isCorrect ? '✓' : '✗'}
        </span>
        <span className={`text-sm font-semibold ${isCorrect ? 'text-green-700' : 'text-red-700'}`}>
          {isCorrect ? 'Correct' : 'Incorrect'}
        </span>
      </div>
      <p className="text-sm text-gray-700 mb-4">
        {feedback?.explanation || 'No explanation provided.'}
      </p>
      <div className="flex justify-end">
        <button
          onClick={onNext}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        >
          Next
        </button>
      </div>
    </div>
  )
}

function SummaryCard({ result, onBack }) {
  const { overallScore, passed, totalQuestions, perItemResults, accelerated, regressed } = result
  const correctCount = perItemResults?.reduce((sum, item) => sum + (item.correctCount || 0), 0) || 0
  const totalAnswered = perItemResults?.reduce((sum, item) => sum + (item.totalCount || 0), 0) || 0

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <h2 className="text-2xl font-bold text-gray-900 mb-4">Review Complete</h2>

      <div className="flex items-center gap-4 mb-6">
        <div className={`text-3xl font-bold ${passed ? 'text-green-600' : 'text-red-600'}`}>
          {overallScore}%
        </div>
        <div className="text-sm text-gray-600">
          {correctCount} / {totalAnswered} correct
        </div>
        {passed && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-3 py-1 text-sm font-medium text-green-800">
            Passed
          </span>
        )}
        {!passed && (
          <span className="inline-flex items-center rounded-full bg-red-100 px-3 py-1 text-sm font-medium text-red-800">
            Needs Review
          </span>
        )}
        {accelerated && (
          <span className="inline-flex items-center rounded-full bg-indigo-100 px-3 py-1 text-sm font-medium text-indigo-800">
            🚀 Accelerated
          </span>
        )}
        {regressed && (
          <span className="inline-flex items-center rounded-full bg-amber-100 px-3 py-1 text-sm font-medium text-amber-800">
            📉 Regressed
          </span>
        )}
      </div>

      {perItemResults && perItemResults.length > 0 && (
        <div className="space-y-2 mb-6">
          <h3 className="text-sm font-semibold text-gray-700 uppercase tracking-wider">Per Lesson</h3>
          {perItemResults.map((item, idx) => (
            <div key={idx} className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-2">
              <span className="text-sm text-gray-700">
                {item.lessonTitle || item.moduleTitle || 'Module Review'}
              </span>
              <span className={`text-sm font-medium ${item.score >= 80 ? 'text-green-600' : 'text-red-600'}`}>
                {item.score}%
              </span>
            </div>
          ))}
        </div>
      )}

      <div className="flex justify-end">
        <button
          onClick={onBack}
          className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
        >
          Back to Dashboard
        </button>
      </div>
    </div>
  )
}

export default function ReviewSession() {
  const navigate = useNavigate()
  const location = useLocation()
  const { sessionId, questions = [], totalQuestions = 0, remainingCount = 0 } = location.state || {}

  const [answers, setAnswers] = useState({})
  const [submitted, setSubmitted] = useState({})
  const [feedbackMap, setFeedbackMap] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [result, setResult] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')

  const handleAnswerChange = useCallback((value) => {
    const q = questions[currentIndex]
    if (!q) return
    setAnswers((prev) => ({ ...prev, [q.id]: value }))
  }, [currentIndex, questions])

  const handleSubmitAnswer = useCallback(async () => {
    const q = questions[currentIndex]
    if (!q || !answers[q.id]?.trim()) return

    setSubmitting(true)
    setError('')

    try {
      const allAnswers = { ...answers }
      const res = await submitReview(sessionId, allAnswers, getLocalDate())

      // Map feedback by question id
      const fbMap = {}
      for (const fb of res.feedback || []) {
        fbMap[fb.questionId] = fb
      }
      setFeedbackMap(fbMap)
      setSubmitted((prev) => ({ ...prev, [q.id]: true }))

      // If all questions answered, show summary
      const answeredIds = Object.keys(allAnswers)
      const allAnswered = questions.every((question) => answeredIds.includes(question.id) && allAnswers[question.id].trim())
      if (allAnswered) {
        setResult(res)
      }
    } catch (err) {
      setError(err.message || 'Failed to submit answer.')
    } finally {
      setSubmitting(false)
    }
  }, [answers, currentIndex, questions, sessionId])

  const handleNext = useCallback(() => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex((i) => i + 1)
    }
  }, [currentIndex, questions.length])

  const handleCancel = useCallback(async () => {
    try {
      await cancelReview(sessionId)
    } catch {}
    navigate('/reviews')
  }, [sessionId, navigate])

  const handleBack = useCallback(() => {
    navigate('/')
  }, [navigate])

  if (!sessionId || !questions || questions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">No active review session.</div>
      </div>
    )
  }

  if (result) {
    return (
      <div className="min-h-screen bg-gray-50">
        <header className="bg-white border-b border-gray-200">
          <div className="max-w-3xl mx-auto px-4 py-4">
            <h1 className="text-xl font-bold text-gray-900">Review Results</h1>
          </div>
        </header>
        <main className="max-w-3xl mx-auto px-4 py-6">
          <SummaryCard result={result} onBack={handleBack} />
        </main>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const isSubmitted = submitted[currentQuestion?.id]
  const currentFeedback = feedbackMap[currentQuestion?.id]

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Review Session</h1>
          <button
            onClick={handleCancel}
            className="text-sm text-gray-600 hover:text-gray-900 underline"
          >
            Cancel
          </button>
        </div>
      </header>

      {/* Progress bar */}
      <div className="bg-white border-b border-gray-100">
        <div className="max-w-3xl mx-auto px-4 py-2">
          <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
            <span>Progress</span>
            <span>{currentIndex + 1} / {questions.length}</span>
          </div>
          <div className="w-full h-1.5 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="h-full bg-indigo-600 rounded-full transition-all duration-300"
              style={{ width: `${((currentIndex + 1) / questions.length) * 100}%` }}
            />
          </div>
          {remainingCount > 0 && (
            <p className="text-xs text-gray-500 mt-1">
              {remainingCount} more review{remainingCount !== 1 ? 's' : ''} queued for later
            </p>
          )}
        </div>
      </div>

      {/* Main content */}
      <main className="max-w-3xl mx-auto px-4 py-6">
        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4" role="alert">
            {error}
          </div>
        )}

        {isSubmitted && currentFeedback ? (
          <FeedbackCard
            feedback={currentFeedback}
            question={currentQuestion}
            onNext={handleNext}
          />
        ) : (
          <QuestionCard
            question={currentQuestion}
            index={currentIndex}
            total={questions.length}
            answer={answers[currentQuestion?.id] || ''}
            onAnswerChange={handleAnswerChange}
            onSubmit={handleSubmitAnswer}
            disabled={submitting}
          />
        )}
      </main>
    </div>
  )
}
