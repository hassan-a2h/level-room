import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { cancelReview, getLocalDate, getReviewCount, getReviews, startReviewSession, submitReview } from '../../api.js'
import { toPublicError } from '../../lib/publicError.js'

const ANSWER_ERROR = 'Answer every question before reviewing your answers.'

export function buildReviewViewModel(state = {}) {
  const questions = Array.isArray(state.questions) ? state.questions : []
  const currentQuestion = questions[state.currentIndex] || null
  const feedbackByQuestionId = state.feedbackByQuestionId || {}
  return {
    phase: state.phase || 'queue',
    counts: state.counts || {},
    dueItems: Array.isArray(state.dueItems) ? state.dueItems : [],
    sessionId: state.sessionId || null,
    questions,
    currentQuestion,
    currentIndex: Number.isInteger(state.currentIndex) ? state.currentIndex : 0,
    totalQuestions: questions.length,
    remainingCount: Number.isFinite(state.remainingCount) ? state.remainingCount : 0,
    answers: state.answers || {},
    feedbackByQuestionId,
    feedbackIndex: Number.isInteger(state.feedbackIndex) ? state.feedbackIndex : 0,
    result: state.phase === 'complete' ? state.result || null : null,
    currentFeedback: currentQuestion ? feedbackByQuestionId[currentQuestion.id] || null : null,
    ui: state.ui || {},
    busy: { submitting: false, ...(state.busy || {}) },
    error: state.error || null,
  }
}

export function useReviewController({
  sessionId,
  questions = [],
  totalQuestions,
  remainingCount = 0,
  submitReviewFn = submitReview,
  cancelReviewFn = cancelReview,
  getLocalDateFn = getLocalDate,
} = {}) {
  const validQuestions = useMemo(() => (Array.isArray(questions) ? questions : []), [questions])
  const initialPhase = sessionId && validQuestions.length ? 'answers' : 'expired'
  const [phase, setPhase] = useState(initialPhase)
  const [answers, setAnswers] = useState({})
  const [currentIndex, setCurrentIndex] = useState(0)
  const [feedbackIndex, setFeedbackIndex] = useState(0)
  const [feedbackByQuestionId, setFeedbackByQuestionId] = useState({})
  const [result, setResult] = useState(null)
  const [busy, setBusy] = useState({ submitting: false })
  const [error, setError] = useState(initialPhase === 'expired'
    ? { kind: 'expired', message: 'This review session is no longer available. Start a new session from your queue.', retryable: false }
    : null)
  const submittingRef = useRef(false)
  const cancelingRef = useRef(false)

  const setAnswer = useCallback((questionId, value) => {
    if (phase !== 'answers' || !validQuestions.some((question) => question.id === questionId)) return
    setAnswers((current) => ({ ...current, [questionId]: value }))
    setError(null)
  }, [phase, validQuestions])

  const nextQuestion = useCallback(() => {
    if (phase !== 'answers') return
    const question = validQuestions[currentIndex]
    if (!question || !String(answers[question.id] || '').trim()) {
      setError({ kind: 'validation', message: 'Write an answer before continuing.', retryable: false })
      return
    }
    setError(null)
    setCurrentIndex((index) => Math.min(validQuestions.length - 1, index + 1))
  }, [answers, currentIndex, phase, validQuestions])

  const previousQuestion = useCallback(() => {
    if (phase === 'answers') setCurrentIndex((index) => Math.max(0, index - 1))
  }, [phase])

  const reviewAnswers = useCallback(() => {
    if (phase !== 'answers') return
    if (validQuestions.some((question) => !String(answers[question.id] || '').trim())) {
      setError({ kind: 'validation', message: ANSWER_ERROR, retryable: false })
      return
    }
    setError(null)
    setPhase('answer-review')
  }, [answers, phase, validQuestions])

  const editAnswer = useCallback((index) => {
    if (phase !== 'answer-review') return
    setCurrentIndex(Math.max(0, Math.min(validQuestions.length - 1, index)))
    setPhase('answers')
  }, [phase, validQuestions.length])

  const backToAnswers = useCallback(() => {
    if (phase === 'answer-review') setPhase('answers')
  }, [phase])

  const submitAnswers = useCallback(async () => {
    if (phase !== 'answer-review' || submittingRef.current) return
    const completeAnswers = Object.fromEntries(validQuestions.map((question) => [question.id, String(answers[question.id] || '').trim()]))
    if (validQuestions.some((question) => !completeAnswers[question.id])) {
      setError({ kind: 'validation', message: ANSWER_ERROR, retryable: false })
      return
    }

    submittingRef.current = true
    setBusy({ submitting: true })
    setError(null)
    try {
      const response = await submitReviewFn(sessionId, completeAnswers, getLocalDateFn())
      const feedback = Object.fromEntries((Array.isArray(response?.feedback) ? response.feedback : [])
        .filter((item) => item?.questionId)
        .map((item) => [item.questionId, item]))
      for (const question of validQuestions) {
        if (!feedback[question.id]) feedback[question.id] = { questionId: question.id, explanation: 'Feedback is not available for this answer.' }
      }
      setFeedbackByQuestionId(feedback)
      setResult(response)
      setCurrentIndex(0)
      setFeedbackIndex(0)
      setPhase('feedback')
    } catch (requestError) {
      const publicError = toPublicError(requestError, 'Could not submit your answers. Try again.')
      setError(publicError)
      if (publicError.kind === 'expired') setPhase('expired')
    } finally {
      submittingRef.current = false
      setBusy({ submitting: false })
    }
  }, [answers, getLocalDateFn, phase, sessionId, submitReviewFn, validQuestions])

  const nextFeedback = useCallback(() => {
    if (phase !== 'feedback') return
    if (feedbackIndex >= validQuestions.length - 1) {
      setPhase('complete')
      return
    }
    const nextIndex = feedbackIndex + 1
    setFeedbackIndex(nextIndex)
    setCurrentIndex(nextIndex)
  }, [feedbackIndex, phase, validQuestions.length])

  const cancel = useCallback(async () => {
    if (!sessionId || cancelingRef.current) return
    cancelingRef.current = true
    try {
      await cancelReviewFn(sessionId)
    } catch {
      // Leaving the review remains available when cancellation cannot reach the server.
    } finally {
      cancelingRef.current = false
    }
  }, [cancelReviewFn, sessionId])

  const model = useMemo(() => buildReviewViewModel({
    phase,
    sessionId,
    questions: validQuestions,
    totalQuestions: totalQuestions || validQuestions.length,
    remainingCount,
    answers,
    currentIndex,
    feedbackIndex,
    result,
    busy,
    error,
    feedbackByQuestionId,
  }), [answers, busy, currentIndex, error, feedbackByQuestionId, feedbackIndex, phase, remainingCount, result, sessionId, totalQuestions, validQuestions])

  const actions = useMemo(() => ({
    answer: setAnswer,
    nextQuestion,
    previousQuestion,
    reviewAnswers,
    editAnswer,
    backToAnswers,
    submit: submitAnswers,
    nextFeedback,
    returnToQueue: () => {},
    returnToTrail: () => {},
  }), [backToAnswers, editAnswer, nextFeedback, nextQuestion, previousQuestion, reviewAnswers, setAnswer, submitAnswers])

  return { model: { ...model, actions }, setAnswer, nextQuestion, previousQuestion, reviewAnswers, editAnswer, backToAnswers, submitAnswers, nextFeedback, cancel }
}

export function useReviewQueueController({
  getReviewsFn = getReviews,
  getReviewCountFn = getReviewCount,
  startReviewSessionFn = startReviewSession,
} = {}) {
  const [reviews, setReviews] = useState(null)
  const [counts, setCounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [starting, setStarting] = useState(false)
  const [error, setError] = useState(null)

  const loadData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const [reviewData, countData] = await Promise.all([getReviewsFn(), getReviewCountFn()])
      setReviews(reviewData)
      setCounts(countData)
    } catch (requestError) {
      setError(toPublicError(requestError, 'Could not load retrieval practice. Check your connection and try again.'))
    } finally {
      setLoading(false)
    }
  }, [getReviewCountFn, getReviewsFn])

  useEffect(() => { loadData() }, [loadData])

  const startSession = useCallback(async () => {
    setStarting(true)
    setError(null)
    try {
      return await startReviewSessionFn()
    } catch (requestError) {
      setError(toPublicError(requestError, 'Could not start retrieval practice. Try again.'))
      setStarting(false)
      return null
    }
  }, [startReviewSessionFn])

  const model = useMemo(() => buildReviewViewModel({
    phase: 'queue',
    counts,
    dueItems: reviews?.due,
    busy: { loading, starting },
    error,
  }), [counts, error, loading, reviews, starting])

  return { model, loadData, startSession }
}
