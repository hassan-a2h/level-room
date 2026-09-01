import { useState, useCallback, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getExam,
  startExam,
  saveExamProgress,
  submitExam,
  retakeExam,
  startPartialRetest,
  submitPartialRetest,
  getLocalDate,
} from '../api.js'
import StatusBadge from './ui/StatusBadge.jsx'
import ProgressBar from './ui/ProgressBar.jsx'

const TYPE_LABELS = {
  conceptual: 'Conceptual',
  'open-ended': 'Open-ended',
  application: 'Application',
  debugging: 'Debugging',
}

const TYPE_WEIGHTS = {
  conceptual: 1,
  'open-ended': 2,
  application: 2,
  debugging: 2,
}

function QuestionCard({ question, answer, onAnswerChange, index, total, disabled, feedback }) {
  const questionId = `exam-question-${question.id}`
  const hasAnswer = Boolean(answer?.trim())
  return (
    <section className="ui-panel mb-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500">Question {index + 1} of {total}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {TYPE_LABELS[question.type] || question.type} (×{TYPE_WEIGHTS[question.type] || 1})
          </span>
          {!feedback && <StatusBadge status={hasAnswer ? 'progress' : 'neutral'}>{hasAnswer ? 'Answered' : 'Not answered'}</StatusBadge>}
        </div>
      </div>
      <p id={questionId} className="text-sm font-medium ui-text mb-3">{question.text}</p>
      <textarea
        aria-labelledby={questionId}
        value={answer || ''}
        onChange={(e) => onAnswerChange(question.id, e.target.value)}
        placeholder="Type your answer here..."
        disabled={disabled}
        rows={4}
        className="ui-field w-full resize-none disabled:cursor-not-allowed"
      />
      {feedback && (
        <div className="ui-surface ui-surface-inset mt-3 rounded-lg p-3">
          <div className="flex items-center gap-2 mb-1">
            <CorrectnessBadge correctness={feedback.correctness} />
            <span className="text-xs ui-text-muted">Score: {feedback.score}</span>
          </div>
          <p className="text-sm ui-text-secondary">{feedback.explanation}</p>
        </div>
      )}
    </section>
  )
}

function CorrectnessBadge({ correctness }) {
  const labels = {
    correct: 'Correct',
    partial: 'Partial',
    incorrect: 'Incorrect',
  }
  const status = { correct: 'success', partial: 'warning', incorrect: 'danger' }[correctness] || 'danger'
  return <StatusBadge status={status}>{labels[correctness] || correctness}</StatusBadge>
}

function CelebrationOverlay({ onDismiss }) {
  useEffect(() => {
    const timer = setTimeout(onDismiss, 4000)
    return () => clearTimeout(timer)
  }, [onDismiss])

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="ui-panel max-w-sm mx-4 p-8 text-center" role="status" aria-live="polite" aria-label="Module completed">
        <div className="text-6xl mb-4">🎉</div>
        <h2 className="text-xl font-bold text-gray-900 mb-2">Module Complete!</h2>
        <p className="text-sm text-gray-600">You demonstrated mastery across all lessons. Great work!</p>
      </div>
    </div>
  )
}

function ExamResult({ evaluation, onBack, onRetake, onPartialRetest, moduleLessons }) {
  const isPass = evaluation.passed
  const navigate = useNavigate()

  const weakLessonDetails = (evaluation.weakLessons || []).map((lessonId) => {
    const lesson = moduleLessons.find((l) => l.id === lessonId)
    const score = evaluation.perLessonScores?.[lessonId]?.score ?? 0
    return { id: lessonId, title: lesson?.title || `Lesson ${lessonId}`, score }
  })

  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <section className={`ui-alert ${isPass ? 'ui-alert-success' : 'ui-alert-warning'} mb-6`} aria-live="polite">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-3xl ui-text">
            {isPass ? '✅' : '❌'}
          </div>
          <div>
            <h2 className="text-lg font-bold ui-text">
              {isPass ? 'You passed the module exam!' : 'Not quite — review your weak areas'}
            </h2>
            <p className="text-sm ui-text-secondary">
              Overall score: <span className="font-semibold">{evaluation.overallScore}%</span>
              {evaluation.criticalGap && <span className="ml-2"><StatusBadge status="warning">Critical gap detected</StatusBadge></span>}
            </p>
          </div>
        </div>

        {evaluation.gaps && evaluation.gaps.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium ui-text-secondary mb-1">Identified gaps:</p>
            <ul className="list-disc list-inside text-sm ui-text-secondary space-y-0.5">
              {evaluation.gaps.map((gap, idx) => (
                <li key={idx}>{gap}</li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* Per-lesson breakdown */}
      <div className="mb-6">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Per-Lesson Breakdown</h3>
        <div className="space-y-2">
          {Object.entries(evaluation.perLessonScores || {}).map(([lessonId, data]) => {
            const lesson = moduleLessons.find((l) => String(l.id) === String(lessonId))
            const title = lesson?.title || `Lesson ${lessonId}`
            const score = data?.score ?? 0
            const isWeak = score < 50
            return (
              <div key={lessonId} className="ui-surface ui-surface-flat flex items-center justify-between gap-3 p-3">
                <span className="text-sm ui-text">{title}</span>
                <StatusBadge status={isWeak ? 'warning' : 'success'}>{score}%</StatusBadge>
              </div>
            )
          })}
        </div>
      </div>

      {/* Feedback per question */}
      <div className="space-y-4">
        {evaluation.feedback && evaluation.feedback.map((fb) => {
          const q = evaluation._questions?.find((qq) => qq.id === fb.questionId)
          if (!q) return null
          return (
            <QuestionCard
              key={q.id}
              question={q}
              answer={evaluation._answers?.[q.id] || ''}
              index={evaluation._questions?.indexOf(q) || 0}
              total={evaluation._questions?.length || 0}
              disabled={true}
              feedback={fb}
              onAnswerChange={() => {}}
            />
          )
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
        {isPass ? (
          <button
            onClick={onBack}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Back to Dashboard
          </button>
        ) : (
          <>
            {weakLessonDetails.length > 0 && (
              <button
                onClick={onPartialRetest}
                className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition-colors"
              >
                Retest Weak Areas ({weakLessonDetails.length})
              </button>
            )}
            <button
              onClick={onRetake}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              Retake Full Exam
            </button>
            <button
              onClick={onBack}
              className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
            >
              Back to Dashboard
            </button>
          </>
        )}
      </div>

      {/* Study links for weak lessons */}
      {!isPass && weakLessonDetails.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold text-gray-900 mb-2">Study these lessons before retesting:</h3>
          <div className="flex flex-wrap gap-2">
            {weakLessonDetails.map((wl) => (
              <button
                key={wl.id}
                onClick={() => navigate(`/topic/${evaluation._topicId}/lesson/${wl.id}`)}
                className="rounded-lg bg-white border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-colors"
              >
                {wl.title} ({wl.score}%)
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

export default function ExamPanel({ topicId, moduleId, moduleLessons, onBack }) {
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [showCelebration, setShowCelebration] = useState(false)
  const [isPartialRetest, setIsPartialRetest] = useState(false)
  const [retestId, setRetestId] = useState(null)
  const saveTimerRef = useRef(null)

  // Load existing exam on mount
  useEffect(() => {
    async function loadExam() {
      try {
        const data = await getExam(topicId, moduleId)
        if (data.questions) {
          setQuestions(data.questions)
          setAnswers(data.answers || {})
          setIsPartialRetest(data.type === 'partial')
          setRetestId(data.id || null)
        }
        if (data.evaluation) {
          setEvaluation({ ...data.evaluation, _questions: data.questions, _answers: data.answers, _topicId: topicId })
        }
        setExam(data)
      } catch (err) {
        if (err.message?.includes('No exam started')) {
          // Not started yet, that's fine
        } else if (err.message?.includes('examNotReady')) {
          setError('Complete all lessons in this module to unlock the exam.')
        } else {
          setError(err.message || 'Failed to load exam.')
        }
      }
    }
    loadExam()
  }, [topicId, moduleId])

  const handleStartExam = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await startExam(topicId, moduleId)
      if (data.questions) {
        setQuestions(data.questions)
        setAnswers(data.answers || {})
        setEvaluation(null)
        setCurrentIndex(0)
        setIsPartialRetest(false)
        setRetestId(data.id || null)
        setExam(data)
      }
    } catch (err) {
      setError(err.message || 'Failed to start exam.')
    } finally {
      setLoading(false)
    }
  }, [topicId, moduleId])

  const handleAnswerChange = useCallback((questionId, value) => {
    setAnswers((prev) => {
      const next = { ...prev, [questionId]: value }
      // Debounced auto-save
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      saveTimerRef.current = setTimeout(() => {
        saveExamProgress(topicId, moduleId, next).catch(() => {})
      }, 1500)
      return next
    })
  }, [topicId, moduleId])

  const handleSubmit = useCallback(async () => {
    const answeredCount = Object.values(answers).filter((a) => a && a.trim().length > 0).length
    if (answeredCount < questions.length) {
      setError(`Please answer all ${questions.length} questions before submitting. ${questions.length - answeredCount} unanswered.`)
      // Jump to first unanswered
      const firstUnanswered = questions.findIndex((q) => !answers[q.id] || answers[q.id].trim().length === 0)
      if (firstUnanswered >= 0) setCurrentIndex(firstUnanswered)
      return
    }

    setLoading(true)
    setError('')
    try {
      let result
      if (isPartialRetest && retestId) {
        result = await submitPartialRetest(topicId, moduleId, retestId, answers, getLocalDate())
      } else {
        result = await submitExam(topicId, moduleId, answers, getLocalDate())
      }
      setEvaluation({ ...result, _questions: questions, _answers: answers, _topicId: topicId })
      if (result.passed) {
        setShowCelebration(true)
      }
    } catch (err) {
      setError(err.message || 'Failed to submit exam.')
    } finally {
      setLoading(false)
    }
  }, [topicId, moduleId, answers, questions, isPartialRetest, retestId])

  const handleRetake = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await retakeExam(topicId, moduleId)
      if (data.questions) {
        setQuestions(data.questions)
        setAnswers({})
        setEvaluation(null)
        setCurrentIndex(0)
        setIsPartialRetest(false)
        setRetestId(data.id || null)
        setExam(data)
      }
    } catch (err) {
      setError(err.message || 'Failed to start retake.')
    } finally {
      setLoading(false)
    }
  }, [topicId, moduleId])

  const handlePartialRetest = useCallback(async () => {
    if (!evaluation?.weakLessons?.length) return
    setLoading(true)
    setError('')
    try {
      const data = await startPartialRetest(topicId, moduleId, evaluation.weakLessons)
      if (data.questions) {
        setQuestions(data.questions)
        setAnswers({})
        setEvaluation(null)
        setCurrentIndex(0)
        setIsPartialRetest(true)
        setRetestId(data.id || null)
        setExam(data)
      }
    } catch (err) {
      setError(err.message || 'Failed to start partial retest.')
    } finally {
      setLoading(false)
    }
  }, [topicId, moduleId, evaluation])

  if (evaluation) {
    return (
      <div className="flex-1 overflow-y-auto relative">
        {showCelebration && (
          <CelebrationOverlay onDismiss={() => setShowCelebration(false)} />
        )}
        <ExamResult
          evaluation={evaluation}
          onBack={onBack}
          onRetake={handleRetake}
          onPartialRetest={handlePartialRetest}
          moduleLessons={moduleLessons || []}
        />
      </div>
    )
  }

  if (questions.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center px-4">
        <div className="text-center max-w-sm">
          <div className="text-4xl mb-3">📋</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Module Exam</h2>
          <p className="text-sm text-gray-600 mb-4">
            When you have passed all lessons in this module, you can take the comprehensive exam to demonstrate mastery.
          </p>
          {error && (
            <div className="ui-alert ui-alert-danger mb-4" role="alert">
              {error}
            </div>
          )}
          <button
            onClick={handleStartExam}
            disabled={loading}
            className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating questions…' : 'Start Exam'}
          </button>
        </div>
      </div>
    )
  }

  const currentQuestion = questions[currentIndex]
  const answeredCount = questions.filter((q) => answers[q.id] && answers[q.id].trim().length > 0).length

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">
            {isPartialRetest ? 'Partial Retest' : 'Module Exam'}
          </h2>
          <span className="text-xs text-gray-500">{answeredCount}/{questions.length} answered</span>
        </div>

        <ProgressBar value={answeredCount} max={questions.length} label="Exam questions answered" className="mb-6" />

        {error && (
          <div className="ui-alert ui-alert-danger mb-4" role="alert">
            {error}
          </div>
        )}

        {/* Question navigator dots */}
        <div className="flex flex-wrap gap-1.5 mb-4">
          {questions.map((q, idx) => {
            const isAnswered = answers[q.id] && answers[q.id].trim().length > 0
            const isCurrent = idx === currentIndex
            return (
              <button
                key={q.id}
                onClick={() => setCurrentIndex(idx)}
                className={`w-8 h-8 rounded-full text-xs font-medium flex items-center justify-center transition-colors ${
                  isCurrent
                    ? 'bg-indigo-600 text-white ring-2 ring-offset-2'
                    : isAnswered
                      ? 'bg-green-100 text-green-700 border border-green-300'
                      : 'bg-gray-100 text-gray-500 border border-gray-200'
                }`}
                aria-label={`Go to question ${idx + 1}${isCurrent ? ' (current)' : ''}${isAnswered ? ' (answered)' : ' (unanswered)'}`}
                aria-current={isCurrent ? 'step' : undefined}
              >
                <span>{idx + 1}</span>
                <span aria-hidden="true">{isAnswered ? '✓' : '—'}</span>
              </button>
            )
          })}
        </div>

        {/* Current question */}
        {currentQuestion && (
          <QuestionCard
            question={currentQuestion}
            answer={answers[currentQuestion.id] || ''}
            onAnswerChange={handleAnswerChange}
            index={currentIndex}
            total={questions.length}
            disabled={loading}
          />
        )}

        {/* Navigation buttons */}
        <div className="flex items-center justify-between mt-4">
          <button
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            disabled={currentIndex === 0 || loading}
            className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            ← Previous
          </button>
          {currentIndex < questions.length - 1 ? (
            <button
              onClick={() => setCurrentIndex((i) => Math.min(questions.length - 1, i + 1))}
              disabled={loading}
              className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Next →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? 'Evaluating…' : 'Submit Exam'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
