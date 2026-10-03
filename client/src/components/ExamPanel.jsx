import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import { useThemeView } from '../theme/ThemeProvider.jsx'
import { buildCheckpointViewModel } from '../features/checkpoint/controller.js'
import { toPublicError } from '../lib/publicError.js'

const SAVE_DEBOUNCE_MS = 500

function hasAnswer(answer) {
  return typeof answer === 'string' && answer.trim().length > 0
}

export default function ExamPanel({ topicId, moduleId, moduleTitle = '', moduleLessons = [], chapterOutcomes = [], onBack }) {
  const [phase, setPhase] = useState('intro')
  const [exam, setExam] = useState(null)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [evaluation, setEvaluation] = useState(null)
  const [ready, setReady] = useState(true)
  const [lessonsRemaining, setLessonsRemaining] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [currentIndex, setCurrentIndex] = useState(0)
  const [saveState, setSaveState] = useState('idle')
  const [focusQuestionId, setFocusQuestionId] = useState(null)
  const [isPartialRetest, setIsPartialRetest] = useState(false)
  const [retestId, setRetestId] = useState(null)
  const saveTimerRef = useRef(null)
  const saveChainRef = useRef(Promise.resolve())
  const saveGenerationRef = useRef(0)
  const attemptIdRef = useRef(null)
  const answersRevisionRef = useRef(null)
  const latestAnswersRef = useRef({})
  const actionLockRef = useRef(false)
  const answerControlRef = useRef(null)
  const navigate = useNavigate()
  const CheckpointThemeView = useThemeView('CheckpointView')

  const outcomes = exam?.outcomes?.length ? exam.outcomes : chapterOutcomes
  const currentQuestion = questions[currentIndex]
  const answeredCount = questions.filter((question) => hasAnswer(answers[question.id])).length
  const firstIncompleteLesson = useMemo(() => moduleLessons.find((lesson) => lesson.state !== 'passed'), [moduleLessons])
  const incompleteLessonCount = moduleLessons.filter((lesson) => lesson.state !== 'passed').length

  const persistAnswers = useCallback((snapshot, operation = {}) => {
    const generation = operation.generation ?? saveGenerationRef.current
    const attemptId = operation.attemptId ?? attemptIdRef.current
    const expectedAnswersRevision = operation.expectedAnswersRevision ?? answersRevisionRef.current
    const nextSave = saveChainRef.current.catch(() => {}).then(async () => {
      if (generation !== saveGenerationRef.current) return null
      const options = expectedAnswersRevision ? { attemptId, expectedAnswersRevision } : undefined
      const result = options ? await saveExamProgress(topicId, moduleId, snapshot, options) : await saveExamProgress(topicId, moduleId, snapshot)
      if (generation === saveGenerationRef.current && result?.answersRevision) answersRevisionRef.current = result.answersRevision
      return result
    })
    saveChainRef.current = nextSave
    return nextSave
  }, [topicId, moduleId])

  const acceptAttempt = useCallback((data, partial = false) => {
    saveGenerationRef.current += 1
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    saveChainRef.current = Promise.resolve()
    setExam(data)
    setQuestions(data.questions || [])
    setAnswers(data.answers || {})
    setEvaluation(null)
    setCurrentIndex(0)
    setFocusQuestionId(null)
    setIsPartialRetest(partial || data.type === 'partial')
    setRetestId(data.id || null)
    attemptIdRef.current = data.id || null
    answersRevisionRef.current = data.answersRevision || null
    latestAnswersRef.current = data.answers || {}
    setReady(true)
    setLessonsRemaining(0)
    setError('')
    setSaveState(Object.keys(data.answers || {}).length ? 'saved' : 'idle')
    setPhase('player')
  }, [])

  useEffect(() => {
    let active = true
    setLoading(true)
    getExam(topicId, moduleId)
      .then((data) => { if (active && data.questions?.length) acceptAttempt(data, data.type === 'partial') })
      .catch((loadError) => {
        if (!active) return
        if (loadError.code === 'CHECKPOINT_NOT_READY' || loadError.examNotReady) {
          setReady(false)
          setLessonsRemaining(loadError.lessonsRemaining || 0)
        } else if (loadError.code !== 'CHECKPOINT_NOT_FOUND' && loadError.status !== 404) {
          setError(toPublicError(loadError, 'We couldn’t load your checkpoint.').message)
        }
      })
      .finally(() => { if (active) setLoading(false) })
    return () => { active = false }
  }, [topicId, moduleId, acceptAttempt])

  useEffect(() => {
    if (focusQuestionId && currentQuestion?.id === focusQuestionId) answerControlRef.current?.focus()
  }, [focusQuestionId, currentQuestion])

  useEffect(() => () => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
  }, [])

  const launchAttempt = useCallback(async (action, partial = false) => {
    if (actionLockRef.current) return
    actionLockRef.current = true
    setLoading(true)
    setError('')
    try {
      const data = await action()
      acceptAttempt(data, partial)
    } catch (actionError) {
      setError(toPublicError(actionError, 'We couldn’t prepare this checkpoint. Please try again.').message)
    } finally {
      actionLockRef.current = false
      setLoading(false)
    }
  }, [acceptAttempt])

  const handleAnswerChange = useCallback((questionId, value) => {
    setAnswers((previous) => {
      const next = { ...previous, [questionId]: value }
      latestAnswersRef.current = next
      const operation = {
        generation: saveGenerationRef.current,
        attemptId: attemptIdRef.current,
        expectedAnswersRevision: answersRevisionRef.current,
      }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      setSaveState('saving')
      saveTimerRef.current = setTimeout(() => {
        persistAnswers(next, operation)
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
      }, SAVE_DEBOUNCE_MS)
      return next
    })
    setError('')
  }, [persistAnswers])

  const flushPendingSave = useCallback(async () => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
    if (!attemptIdRef.current || !Object.keys(latestAnswersRef.current).length) return null
    setSaveState('saving')
    try {
    const result = await persistAnswers(latestAnswersRef.current, {
      generation: saveGenerationRef.current,
      attemptId: attemptIdRef.current,
      expectedAnswersRevision: answersRevisionRef.current,
    })
      setSaveState('saved')
      return result
    } catch (saveError) {
      setSaveState('error')
      throw saveError
    }
  }, [persistAnswers])

  const handleReview = useCallback(() => {
    const incompleteIndex = questions.findIndex((question) => !hasAnswer(answers[question.id]))
    if (incompleteIndex >= 0) {
      const missingQuestion = questions[incompleteIndex]
      setCurrentIndex(incompleteIndex)
      setFocusQuestionId(missingQuestion.id)
      setError(`There ${questions.length - answeredCount === 1 ? 'is' : 'are'} still ${questions.length - answeredCount} unanswered ${questions.length - answeredCount === 1 ? 'question' : 'questions'}. We’ve taken you to the first one.`)
      return
    }
    setError('')
    setPhase('answer-review')
  }, [answers, answeredCount, questions])

  const handleSubmit = useCallback(async () => {
    if (phase !== 'answer-review' || actionLockRef.current) return
    const incompleteIndex = questions.findIndex((question) => !hasAnswer(answers[question.id]))
    if (incompleteIndex >= 0) {
      setPhase('player')
      setCurrentIndex(incompleteIndex)
      setFocusQuestionId(questions[incompleteIndex].id)
      setError('Please answer every question before submitting.')
      return
    }

    actionLockRef.current = true
    setLoading(true)
    setError('')
    try {
      latestAnswersRef.current = answers
      await flushPendingSave()
      const result = isPartialRetest && retestId
        ? answersRevisionRef.current
          ? await submitPartialRetest(topicId, moduleId, retestId, answers, getLocalDate(), { expectedAnswersRevision: answersRevisionRef.current })
          : await submitPartialRetest(topicId, moduleId, retestId, answers, getLocalDate())
        : answersRevisionRef.current
          ? await submitExam(topicId, moduleId, answers, getLocalDate(), { attemptId: attemptIdRef.current, expectedAnswersRevision: answersRevisionRef.current })
          : await submitExam(topicId, moduleId, answers, getLocalDate())
      setEvaluation(result)
      setPhase('results')
    } catch (submitError) {
      if (submitError.unansweredQuestionIds?.length) {
        const missingIndex = questions.findIndex((question) => question.id === submitError.unansweredQuestionIds[0])
        if (missingIndex >= 0) {
          setPhase('player')
          setCurrentIndex(missingIndex)
          setFocusQuestionId(questions[missingIndex].id)
        }
      }
      setError(toPublicError(submitError, 'Your checkpoint couldn’t be submitted. Your answers are still here; try again when you’re ready.').message)
    } finally {
      actionLockRef.current = false
      setLoading(false)
    }
  }, [answers, flushPendingSave, isPartialRetest, moduleId, phase, questions, retestId, topicId])

  const handlePartialRetest = useCallback(() => {
    const failedOutcomeIds = evaluation?.failedOutcomeIds || []
    if (!failedOutcomeIds.length) return
    launchAttempt(() => startPartialRetest(topicId, moduleId, failedOutcomeIds), true)
  }, [evaluation, launchAttempt, moduleId, topicId])

  const handleReviewLesson = useCallback((lessonId) => {
    navigate(`/topic/${topicId}/lesson/${lessonId}`)
  }, [navigate, topicId])

  if (loading && phase === 'intro' && !error && !exam) return <div className="checkpoint-loading" role="status">Getting your Chapter ready…</div>

  const checkpointModel = buildCheckpointViewModel({
    phase, exam, module: { title: exam?.moduleTitle || moduleTitle, lessons: moduleLessons }, outcomes,
    questions, answers, currentIndex, saveState, evaluation, isPartialRetest, ready,
    lessonsRemaining: lessonsRemaining || incompleteLessonCount,
    busy: { loading }, error: error ? { message: error } : null, answerRef: answerControlRef,
  })
  checkpointModel.actions = {
    start: () => launchAttempt(() => startExam(topicId, moduleId)),
    continueLearning: firstIncompleteLesson ? () => handleReviewLesson(firstIncompleteLesson.id) : null,
    answer: handleAnswerChange,
    previous: () => { setCurrentIndex((index) => Math.max(0, index - 1)); setFocusQuestionId(null) },
    next: () => { setCurrentIndex((index) => Math.min(questions.length - 1, index + 1)); setFocusQuestionId(null) },
    selectQuestion: (index) => { setCurrentIndex(index); setFocusQuestionId(null) },
    review: handleReview,
    submit: handleSubmit,
    backToQuestions: () => setPhase('player'),
    editQuestion: (index) => { setCurrentIndex(index); setFocusQuestionId(null); setPhase('player') },
    back: async () => { try { await flushPendingSave() } catch { setSaveState('error') } if (onBack) onBack(); else navigate('/') },
    retake: () => launchAttempt(() => retakeExam(topicId, moduleId)),
    partialRetest: () => { if (!actionLockRef.current) handlePartialRetest() },
    reviewLesson: handleReviewLesson,
  }
  return <Suspense fallback={<div className="checkpoint-loading" role="status">Preparing your Chapter checkpoint…</div>}><CheckpointThemeView model={checkpointModel} /></Suspense>
}
