import { useState, useCallback, useEffect, useRef } from 'react'
import { getRemediationState, sendRemediateChat, startRetest, submitQuiz, deferLesson } from '../api.js'

const MAX_MESSAGE_LENGTH = 2000

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

function ChatMessage({ message, isStreaming }) {
  const isUser = message.role === 'user'
  if (isUser && message.content === '[Continue]') return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'bg-indigo-600 text-white rounded-br-md'
            : 'bg-gray-100 text-gray-900 rounded-bl-md'
        }`}
      >
        {message.content}
        {isStreaming && (
          <span className="inline-block ml-1 w-1.5 h-4 bg-current opacity-50 animate-pulse" />
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="bg-gray-100 rounded-2xl rounded-bl-md px-4 py-2.5">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function QuestionCard({ question, answer, onAnswerChange, index, total, disabled, feedback }) {
  return (
    <div className="mb-6 rounded-xl border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-gray-500">Question {index + 1} of {total}</span>
        <span className="text-xs font-medium text-gray-400">
          {question.type} (×{question.weight})
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

function DiagnosticBanner({ gaps, attemptNumber }) {
  return (
    <div className="rounded-xl border border-red-200 bg-red-50 p-4 mb-4">
      <div className="flex items-center gap-2 mb-2">
        <span className="text-xl">🔍</span>
        <h3 className="text-sm font-bold text-red-900">Diagnostic Feedback</h3>
      </div>
      <p className="text-sm text-red-800 mb-2">
        {attemptNumber === 1
          ? "Not quite — let's look at where the gap is."
          : "Still struggling — let's figure out the best next step."}
      </p>
      {gaps && gaps.length > 0 && (
        <div>
          <p className="text-xs font-semibold text-red-800 mb-1">Specific gaps identified:</p>
          <ul className="list-disc list-inside text-sm text-red-700 space-y-0.5">
            {gaps.map((gap, idx) => (
              <li key={idx}>{gap}</li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function RetestEvaluation({ evaluation, onBack, onRetry, onReteach, onPrereq, onDefer, attemptNumber }) {
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

      <div className="flex flex-col items-center gap-3 mt-6">
        {isPass ? (
          <button
            onClick={onBack}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Back to Dashboard
          </button>
        ) : (
          <>
            {attemptNumber >= 2 ? (
              <div className="w-full rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="text-sm font-semibold text-amber-900 mb-3">
                  You\'ve tried a few times. What would you like to do?
                </p>
                <div className="flex flex-wrap items-center justify-center gap-3">
                  <button
                    onClick={onReteach}
                    className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                  >
                    Re-teach
                  </button>
                  <button
                    onClick={onPrereq}
                    className="rounded-lg bg-amber-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-500 focus:ring-offset-2 transition-colors"
                  >
                    Study Prerequisites
                  </button>
                  <button
                    onClick={onDefer}
                    className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors"
                  >
                    Save & Come Back Later
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={onRetry}
                className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
              >
                Take Retest
              </button>
            )}
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

export default function RemediationPanel({
  topicId,
  lessonId,
  initialGaps = [],
  initialAttempts = 0,
  onBack,
  onReteach,
  onPrereq,
  onDefer,
}) {
  const [gaps, setGaps] = useState(initialGaps)
  const [attemptNumber, setAttemptNumber] = useState(initialAttempts || 0)
  const [messages, setMessages] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [retestMode, setRetestMode] = useState(false)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [evaluation, setEvaluation] = useState(null)
  const chatEndRef = useRef(null)
  const abortRef = useRef(null)

  useEffect(() => {
    async function loadState() {
      try {
        const data = await getRemediationState(topicId, lessonId)
        if (data.gaps) setGaps(data.gaps)
        if (typeof data.remediationAttempts === 'number') setAttemptNumber(data.remediationAttempts)
      } catch {
        // ignore
      }
    }
    loadState()
  }, [topicId, lessonId])

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [messages, streamText])

  const handleSend = useCallback(async () => {
    const trimmed = input.trim()
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return
    if (isStreaming) return

    setInput('')
    setError('')
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, id: Date.now() }])
    setIsStreaming(true)
    setStreamText('')

    try {
      const res = await sendRemediateChat(topicId, lessonId, trimmed)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullText = ''

      abortRef.current = reader

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          const raw = line.slice(6)
          try {
            const parsed = JSON.parse(raw)
            if (parsed === '[DONE]') continue
            fullText += parsed
            setStreamText(fullText)
          } catch {
            // ignore malformed lines
          }
        }
      }

      if (fullText.trim()) {
        setMessages((prev) => [...prev, { role: 'assistant', content: fullText.trim(), id: Date.now() }])
      }
      setStreamText('')
    } catch (err) {
      setError(err.message || 'Failed to send message.')
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isStreaming, topicId, lessonId])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleInputChange = useCallback((e) => {
    const val = e.target.value
    if (val.length > MAX_MESSAGE_LENGTH) {
      setInput(val.slice(0, MAX_MESSAGE_LENGTH))
    } else {
      setInput(val)
    }
  }, [])

  const handleStartRetest = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const data = await startRetest(topicId, lessonId)
      if (data.questions) {
        setQuestions(data.questions)
        setAnswers({})
        setEvaluation(null)
        setRetestMode(true)
      }
    } catch (err) {
      setError(err.message || 'Failed to start retest.')
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId])

  const handleAnswerChange = useCallback((questionId, value) => {
    setAnswers((prev) => ({ ...prev, [questionId]: value }))
  }, [])

  const handleSubmitRetest = useCallback(async () => {
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
      if (!result.passed) {
        setAttemptNumber((prev) => prev + 1)
      }
    } catch (err) {
      setError(err.message || 'Failed to submit retest.')
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId, answers, questions])

  const handleRetryAfterFail = useCallback(() => {
    setEvaluation(null)
    setAnswers({})
    setError('')
    setRetestMode(false)
  }, [])

  const handleReteach = useCallback(() => {
    setEvaluation(null)
    setAnswers({})
    setError('')
    setRetestMode(false)
    if (onReteach) onReteach()
  }, [onReteach])

  const handlePrereq = useCallback(() => {
    if (onPrereq) onPrereq()
  }, [onPrereq])

  const handleDefer = useCallback(async () => {
    setLoading(true)
    try {
      await deferLesson(topicId, lessonId)
      if (onDefer) onDefer()
    } catch (err) {
      setError(err.message || 'Failed to defer lesson.')
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId, onDefer])

  if (evaluation) {
    return (
      <div className="flex-1 overflow-y-auto">
        <RetestEvaluation
          evaluation={evaluation}
          onBack={onBack}
          onRetry={handleRetryAfterFail}
          onReteach={handleReteach}
          onPrereq={handlePrereq}
          onDefer={handleDefer}
          attemptNumber={attemptNumber}
        />
      </div>
    )
  }

  if (retestMode) {
    return (
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-3xl mx-auto px-4 py-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-bold text-gray-900">Retest</h2>
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
              onClick={handleSubmitRetest}
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

  return (
    <div className="flex-1 overflow-y-auto flex flex-col">
      <div className="max-w-3xl mx-auto px-4 py-4 w-full">
        <DiagnosticBanner gaps={gaps} attemptNumber={attemptNumber} />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-3" role="alert">
            {error}
          </div>
        )}

        <div className="mb-4">
          <p className="text-sm text-gray-600 mb-3">
            The tutor will re-explain the missed concept with a different approach. Feel free to ask questions at any time.
          </p>
          {messages.map((msg, idx) => (
            <ChatMessage key={msg.id || idx} message={msg} isStreaming={false} />
          ))}
          {isStreaming && streamText && (
            <ChatMessage message={{ role: 'assistant', content: streamText }} isStreaming={true} />
          )}
          {isStreaming && !streamText && <TypingIndicator />}
          <div ref={chatEndRef} />
        </div>

        <div className="flex items-center justify-center gap-3 mb-4">
          <button
            onClick={handleStartRetest}
            disabled={loading || isStreaming}
            className="rounded-lg bg-green-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Generating retest…' : 'Take Retest'}
          </button>
          {attemptNumber >= 2 && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                onClick={handleReteach}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 transition-colors"
              >
                Re-teach
              </button>
              <button
                onClick={handlePrereq}
                className="rounded-lg bg-amber-600 px-4 py-2 text-sm font-medium text-white hover:bg-amber-700 transition-colors"
              >
                Study Prerequisites
              </button>
              <button
                onClick={handleDefer}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors"
              >
                Save & Come Back Later
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Chat input */}
      <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <div className="flex-1 relative">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Type a message..."
              rows={1}
              maxLength={MAX_MESSAGE_LENGTH}
              disabled={isStreaming}
              className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
              style={{ minHeight: '44px', maxHeight: '120px' }}
            />
            <div className="absolute right-2 bottom-2 text-[10px] text-gray-400 pointer-events-none">
              {input.length}/{MAX_MESSAGE_LENGTH}
            </div>
          </div>
          <button
            onClick={handleSend}
            disabled={isStreaming || !input.trim()}
            className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
            aria-label="Send message"
          >
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
