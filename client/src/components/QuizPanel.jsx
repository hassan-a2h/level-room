import { useState, useCallback, useEffect } from 'react'
import { startQuiz, getQuiz, submitQuiz, getLocalDate } from '../api.js'
import RemediationPanel from './RemediationPanel.jsx'
import { SkeletonQuiz } from '../components/Skeleton.jsx'
import StatusBadge from './ui/StatusBadge.jsx'
import ProgressBar from './ui/ProgressBar.jsx'

const TYPE_LABELS = {
  Recall: 'Recall',
  Explain: 'Explain',
  Apply: 'Apply',
  Diagnose: 'Diagnose',
  Transfer: 'Transfer',
}

const TYPE_WEIGHTS = {
  Recall: 1,
  Explain: 2,
  Apply: 2,
  Diagnose: 2,
  Transfer: 3,
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

function QuestionCard({ question, answer, onAnswerChange, index, total, disabled, feedback }) {
  const questionId = `quiz-question-${question.id}`
  const isChoice = question.format === 'multiple_choice'
  const hasAnswer = Boolean(typeof answer === 'string' && answer.trim())
  return (
    <section className="ui-panel mb-6 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
        <span className="text-xs font-medium text-gray-500">Question {index + 1} of {total}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">
            {TYPE_LABELS[question.category] || TYPE_LABELS[question.type] || question.category || question.type} (×{question.weight || TYPE_WEIGHTS[question.type] || 1})
          </span>
          {!feedback && <StatusBadge status={hasAnswer ? 'progress' : 'neutral'}>{hasAnswer ? 'Answered' : 'Not answered'}</StatusBadge>}
        </div>
      </div>
      <p id={questionId} className="text-sm font-medium ui-text mb-3">{question.prompt || question.text}</p>
      {isChoice ? (
        <fieldset aria-labelledby={questionId} className="space-y-2">
          <legend className="sr-only">Choose one answer</legend>
          {question.options.map((option) => (
            <label key={option.id} className="flex items-start gap-2 rounded-lg ui-surface ui-surface-flat p-3 text-sm ui-text cursor-pointer">
              <input
                type="radio"
                name={question.id}
                value={option.id}
                checked={answer === option.id}
                onChange={(e) => onAnswerChange(question.id, e.target.value)}
                disabled={disabled}
                className="mt-0.5"
              />
              <span>{option.text}</span>
            </label>
          ))}
        </fieldset>
      ) : (
        <>
          <textarea
            aria-labelledby={questionId}
            value={answer || ''}
            onChange={(e) => onAnswerChange(question.id, e.target.value)}
            placeholder="Type your answer here..."
            maxLength={question.max_words ? 2000 : undefined}
            disabled={disabled}
            rows={4}
            className="ui-field w-full resize-none disabled:cursor-not-allowed"
          />
          {question.max_words && <p className="mt-1 text-xs ui-text-muted">Keep this answer under {question.max_words} words and 2,000 characters.</p>}
        </>
      )}
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

function EvaluationResult({ evaluation, onBack, onRetry, onStartRemediation }) {
  const isPass = evaluation.passed
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <section className={`ui-alert ${isPass ? 'ui-alert-success' : 'ui-alert-danger'} mb-6`} aria-live="polite">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-3xl ui-text">
            {isPass ? '✅' : '❌'}
          </div>
          <div>
            <h2 className="text-lg font-bold ui-text">
              {isPass ? 'You passed!' : 'Not quite — let\'s look at the gaps'}
            </h2>
            <p className="text-sm ui-text-secondary">
              Overall score: <span className="font-semibold">{evaluation.overallScore}%</span>
              {evaluation.criticalGap && (
                <span className="ml-2"><StatusBadge status="warning">Critical gap detected</StatusBadge></span>
              )}
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

      <div className="flex items-center justify-center gap-3 mt-6">
        {isPass ? (
          <button
            onClick={onBack}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Back to Dashboard
          </button>
        ) : (
          <>
            <button
              onClick={onStartRemediation || onRetry}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              {onStartRemediation ? 'Review & Retest' : 'Try Again'}
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
    </div>
  )
}

export default function QuizPanel({ topicId, lessonId, onBack }) {
  const [questions, setQuestions] = useState([])
  const [attemptId, setAttemptId] = useState(null)
  const [answers, setAnswers] = useState({})
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [remediationMode, setRemediationMode] = useState(false)

  // Load existing quiz on mount
  useEffect(() => {
    async function loadQuiz() {
      try {
        const data = await getQuiz(topicId, lessonId)
        if (data.questions) {
          setQuestions(data.questions)
        }
        if (data.attemptId) setAttemptId(data.attemptId)
        if (data.answers) {
          setAnswers(data.answers)
        }
        if (data.evaluation) {
          setEvaluation({ ...data.evaluation, _questions: data.questions, _answers: data.answers })
        }
      } catch {
        // No existing quiz, that's fine
      }
    }
    loadQuiz()
  }, [topicId, lessonId])

  const handleStartQuiz = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await startQuiz(topicId, lessonId)
      if (data.questions) {
        setQuestions(data.questions)
        setAttemptId(data.attemptId || null)
        setAnswers({})
        setEvaluation(null)
        setRemediationMode(false)
      }
    } catch (err) {
      setError(err.message || 'Failed to start quiz.')
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId])

  const handleAnswerChange = useCallback((questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }, [])

  const handleSubmit = useCallback(async () => {
    const hasAnyAnswer = Object.values(answers).some((a) => a && a.trim().length > 0)
    if (!hasAnyAnswer) {
      setError('Please answer at least one question before submitting.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await submitQuiz(topicId, lessonId, answers, getLocalDate(), attemptId)
      setEvaluation({ ...result, _questions: questions, _answers: answers })
      if (!result.passed) {
        setRemediationMode(true)
      }
    } catch (err) {
      setError(err.message || 'Failed to submit quiz.')
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId, answers, questions, attemptId])

  const handleRetry = useCallback(() => {
    setEvaluation(null)
    setAnswers({})
    setError('')
    setRemediationMode(false)
  }, [])

  const handleRemediateBack = useCallback(() => {
    setRemediationMode(false)
    setEvaluation(null)
    setAnswers({})
    setError('')
  }, [])

  // If remediation mode is active, show the full remediation panel
  if (remediationMode) {
    return (
      <RemediationPanel
        topicId={topicId}
        lessonId={lessonId}
        initialGaps={evaluation?.gaps || []}
        initialAttempts={1}
        onBack={handleRemediateBack}
        onReteach={() => {}}
        onPrereq={onBack}
        onDefer={onBack}
      />
    )
  }

  // If evaluation already exists from prior attempt, show result
  if (evaluation) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EvaluationResult evaluation={evaluation} onBack={onBack} onRetry={handleRetry} />
      </div>
    )
  }

  // If no questions yet, show start prompt
  if (questions.length === 0) {
    return (
      <div className="flex-1 overflow-y-auto flex items-center justify-center px-4">
        <div className="text-center">
          <div className="text-4xl mb-3">📝</div>
          <h2 className="text-lg font-bold text-gray-900 mb-2">Check Your Understanding</h2>
          <p className="text-sm text-gray-600 mb-4 max-w-sm">
            Ready to test what you have learned? A short quiz will help confirm your understanding.
          </p>
          {loading ? (
            <SkeletonQuiz />
          ) : (
            <button
              onClick={handleStartQuiz}
              disabled={loading}
              className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Start Quiz
            </button>
          )}
          {error && !loading && <p className="mt-3 text-sm text-red-600">{error}</p>}
        </div>
      </div>
    )
  }

  // Show questions
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Quiz</h2>
          <span className="text-xs text-gray-500">{questions.length} questions</span>
        </div>

        <ProgressBar
          value={questions.filter((question) => typeof answers[question.id] === 'string' && answers[question.id].trim()).length}
          max={questions.length}
          label="Quiz questions answered"
          className="mb-5"
        />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4" role="alert">
            {error}
          </div>
        )}

        <div className="space-y-4">
          {questions.map((q, idx) => (
            <QuestionCard
              key={q.id}
              question={q}
              answer={answers[q.id] || ''}
              onAnswerChange={handleAnswerChange}
              index={idx}
              total={questions.length}
              disabled={loading}
            />
          ))}
        </div>

        <div className="flex items-center justify-center mt-6">
          <button
            onClick={handleSubmit}
            disabled={loading}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Evaluating…' : 'Submit Answers'}
          </button>
        </div>
      </div>
    </div>
  )
}
