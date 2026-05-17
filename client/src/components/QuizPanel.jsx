import { useState, useCallback, useEffect } from 'react'
import { startQuiz, getQuiz, submitQuiz } from '../api.js'

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
  const styles = {
    correct: 'bg-green-100 text-green-800',
    partial: 'bg-yellow-100 text-yellow-800',
    incorrect: 'bg-red-100 text-red-800',
  }
  const labels = {
    correct: 'Correct',
    partial: 'Partial',
    incorrect: 'Incorrect',
  }
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${styles[correctness] || styles.incorrect}`}>
      {labels[correctness] || correctness}
    </span>
  )
}

function QuestionCard({ question, answer, onAnswerChange, index, total, disabled, feedback }) {
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">Question {index + 1} of {total}</span>
        <span className="text-xs font-medium text-gray-400">
          {TYPE_LABELS[question.type] || question.type} (×{TYPE_WEIGHTS[question.type] || 1})
        </span>
      </div>
      <p className="text-sm font-medium text-gray-900 mb-3">{question.text}</p>
      <textarea
        value={answer || ''}
        onChange={(e) => onAnswerChange(question.id, e.target.value)}
        placeholder="Type your answer here..."
        disabled={disabled}
        rows={4}
        className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed"
      />
      {feedback && (
        <div className="mt-3 rounded-lg bg-gray-50 p-3">
          <div className="flex items-center gap-2 mb-1">
            <CorrectnessBadge correctness={feedback.correctness} />
            <span className="text-xs text-gray-500">Score: {feedback.score}</span>
          </div>
          <p className="text-sm text-gray-700">{feedback.explanation}</p>
        </div>
      )}
    </div>
  )
}

function EvaluationResult({ evaluation, onBack, onRetry }) {
  const isPass = evaluation.passed
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className={`rounded-xl border p-6 mb-6 ${isPass ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center gap-3 mb-2">
          <div className={`text-3xl ${isPass ? 'text-green-600' : 'text-red-600'}`}>
            {isPass ? '✅' : '❌'}
          </div>
          <div>
            <h2 className={`text-lg font-bold ${isPass ? 'text-green-900' : 'text-red-900'}`}>
              {isPass ? 'You passed!' : 'Not quite — let\'s look at the gaps'}
            </h2>
            <p className={`text-sm ${isPass ? 'text-green-700' : 'text-red-700'}`}>
              Overall score: <span className="font-semibold">{evaluation.overallScore}%</span>
              {evaluation.criticalGap && (
                <span className="ml-2 font-medium">Critical gap detected</span>
              )}
            </p>
          </div>
        </div>
        {evaluation.gaps && evaluation.gaps.length > 0 && (
          <div className="mt-3">
            <p className="text-sm font-medium text-gray-700 mb-1">Identified gaps:</p>
            <ul className="list-disc list-inside text-sm text-gray-700 space-y-0.5">
              {evaluation.gaps.map((gap, idx) => (
                <li key={idx}>{gap}</li>
              ))}
            </ul>
          </div>
        )}
      </div>

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
              onClick={onRetry}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              Try Again
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
  const [answers, setAnswers] = useState({})
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  // Load existing quiz on mount
  useEffect(() => {
    async function loadQuiz() {
      try {
        const data = await getQuiz(topicId, lessonId)
        if (data.questions) {
          setQuestions(data.questions)
        }
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
        setAnswers({})
        setEvaluation(null)
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
      const result = await submitQuiz(topicId, lessonId, answers)
      setEvaluation({ ...result, _questions: questions, _answers: answers })
    } catch (err) {
      setError(err.message || 'Failed to submit quiz.')
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId, answers, questions])

  const handleRetry = useCallback(() => {
    setEvaluation(null)
    setAnswers({})
    setError('')
  }, [])

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
            Ready to test what you have learned? A short quiz with {3}–{8} free-text questions will help confirm your understanding.
          </p>
          <button
            onClick={handleStartQuiz}
            disabled={loading}
            className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating questions…' : 'Start Quiz'}
          </button>
          {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
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
