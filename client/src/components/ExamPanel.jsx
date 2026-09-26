import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
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
import CheckpointIntro from './checkpoint/CheckpointIntro.jsx'
import CheckpointQuestion from './checkpoint/CheckpointQuestion.jsx'
import CheckpointResults from './checkpoint/CheckpointResults.jsx'

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
  const answerControlRef = useRef(null)
  const navigate = useNavigate()

  const outcomes = exam?.outcomes?.length ? exam.outcomes : chapterOutcomes
  const currentQuestion = questions[currentIndex]
  const answeredCount = questions.filter((question) => hasAnswer(answers[question.id])).length
  const firstIncompleteLesson = useMemo(() => moduleLessons.find((lesson) => lesson.state !== 'passed'), [moduleLessons])
  const incompleteLessonCount = moduleLessons.filter((lesson) => lesson.state !== 'passed').length

  const persistAnswers = useCallback((snapshot) => {
    const nextSave = saveChainRef.current.catch(() => {}).then(() => saveExamProgress(topicId, moduleId, snapshot))
    saveChainRef.current = nextSave
    return nextSave
  }, [topicId, moduleId])

  const acceptAttempt = useCallback((data, partial = false) => {
    setExam(data)
    setQuestions(data.questions || [])
    setAnswers(data.answers || {})
    setEvaluation(null)
    setCurrentIndex(0)
    setFocusQuestionId(null)
    setIsPartialRetest(partial || data.type === 'partial')
    setRetestId(data.id || null)
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
          setError(loadError.message || 'We couldn’t load your checkpoint.')
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
    setLoading(true)
    setError('')
    try {
      const data = await action()
      acceptAttempt(data, partial)
    } catch (actionError) {
      setError(actionError.message || 'We couldn’t prepare this checkpoint. Please try again.')
    } finally {
      setLoading(false)
    }
  }, [acceptAttempt])

  const handleAnswerChange = useCallback((questionId, value) => {
    setAnswers((previous) => {
      const next = { ...previous, [questionId]: value }
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
      setSaveState('saving')
      saveTimerRef.current = setTimeout(() => {
        persistAnswers(next)
          .then(() => setSaveState('saved'))
          .catch(() => setSaveState('error'))
      }, SAVE_DEBOUNCE_MS)
      return next
    })
    setError('')
  }, [persistAnswers])

  const handleSubmit = useCallback(async () => {
    const incompleteIndex = questions.findIndex((question) => !hasAnswer(answers[question.id]))
    if (incompleteIndex >= 0) {
      const missingQuestion = questions[incompleteIndex]
      setCurrentIndex(incompleteIndex)
      setFocusQuestionId(missingQuestion.id)
      setError(`There ${questions.length - answeredCount === 1 ? 'is' : 'are'} still ${questions.length - answeredCount} unanswered ${questions.length - answeredCount === 1 ? 'question' : 'questions'}. We’ve taken you to the first one.`)
      return
    }

    if (saveTimerRef.current) clearTimeout(saveTimerRef.current)
    setLoading(true)
    setError('')
    try {
      await persistAnswers(answers)
      setSaveState('saved')
      const result = isPartialRetest && retestId
        ? await submitPartialRetest(topicId, moduleId, retestId, answers, getLocalDate())
        : await submitExam(topicId, moduleId, answers, getLocalDate())
      setEvaluation(result)
      setPhase('results')
    } catch (submitError) {
      if (submitError.unansweredQuestionIds?.length) {
        const missingIndex = questions.findIndex((question) => question.id === submitError.unansweredQuestionIds[0])
        if (missingIndex >= 0) {
          setCurrentIndex(missingIndex)
          setFocusQuestionId(questions[missingIndex].id)
        }
      }
      setError(submitError.message || 'Your checkpoint couldn’t be submitted. Your answers are still here; try again when you’re ready.')
    } finally {
      setLoading(false)
    }
  }, [answers, answeredCount, isPartialRetest, moduleId, persistAnswers, questions, retestId, topicId])

  const handlePartialRetest = useCallback(() => {
    const failedOutcomeIds = evaluation?.failedOutcomeIds || []
    if (!failedOutcomeIds.length) return
    launchAttempt(() => startPartialRetest(topicId, moduleId, failedOutcomeIds), true)
  }, [evaluation, launchAttempt, moduleId, topicId])

  const handleReviewLesson = useCallback((lessonId) => {
    navigate(`/topic/${topicId}/lesson/${lessonId}`)
  }, [navigate, topicId])

  if (loading && phase === 'intro' && !error && !exam) {
    return <div className="checkpoint-loading" role="status">Getting your Chapter ready…</div>
  }

  if (phase === 'results' && evaluation) {
    return (
      <CheckpointResults
        evaluation={evaluation}
        outcomes={outcomes}
        moduleLessons={moduleLessons}
        questions={questions}
        answers={answers}
        loading={loading}
        error={error}
        onBack={onBack}
        onRetake={() => launchAttempt(() => retakeExam(topicId, moduleId))}
        onPartialRetest={handlePartialRetest}
        onReviewLesson={handleReviewLesson}
      />
    )
  }

  if (phase === 'intro') {
    return (
      <CheckpointIntro
        moduleTitle={exam?.moduleTitle || moduleTitle}
        outcomes={outcomes}
        lessonCount={moduleLessons.length}
        ready={ready}
        lessonsRemaining={lessonsRemaining || incompleteLessonCount}
        loading={loading}
        error={error}
        onStart={() => launchAttempt(() => startExam(topicId, moduleId))}
        onContinueLearning={firstIncompleteLesson ? () => handleReviewLesson(firstIncompleteLesson.id) : null}
      />
    )
  }

  return (
    <section className="checkpoint-player" aria-labelledby="checkpoint-player-title">
      <header className="checkpoint-player-header">
        <div>
          <div className="checkpoint-eyebrow">{isPartialRetest ? 'Targeted practice' : 'Chapter checkpoint'}</div>
          <h2 id="checkpoint-player-title">{exam?.moduleTitle || moduleTitle || 'Your learning, together'}</h2>
        </div>
        <div className="checkpoint-save-state" role="status" aria-live="polite">
          {saveState === 'saving' ? 'Saving your place…' : saveState === 'saved' ? 'Saved as you go' : saveState === 'error' ? 'Save paused — we’ll retry when you continue' : 'Autosave is on'}
        </div>
      </header>

      <div className="checkpoint-progress-row">
        <span>{answeredCount} of {questions.length} answered</span>
        <div className="checkpoint-progress-track" role="progressbar" aria-label="Checkpoint questions answered" aria-valuemin={0} aria-valuemax={questions.length} aria-valuenow={answeredCount}>
          <span style={{ width: `${questions.length ? (answeredCount / questions.length) * 100 : 0}%` }} />
        </div>
      </div>

      {error && <div className="ui-alert ui-alert-danger checkpoint-inline-error" role="alert">{error}</div>}

      <nav className="checkpoint-question-nav" aria-label="Checkpoint questions">
        {questions.map((question, index) => {
          const answered = hasAnswer(answers[question.id])
          return (
            <button
              key={question.id}
              type="button"
              className={`checkpoint-question-nav-item${index === currentIndex ? ' is-current' : ''}${answered ? ' is-answered' : ''}`}
              aria-label={`Question ${index + 1}${index === currentIndex ? ', current' : ''}${answered ? ', answered' : ', unanswered'}`}
              aria-current={index === currentIndex ? 'step' : undefined}
              onClick={() => { setCurrentIndex(index); setFocusQuestionId(null) }}
            >{answered ? '✓' : index + 1}</button>
          )
        })}
      </nav>

      {currentQuestion && (
        <CheckpointQuestion
          question={currentQuestion}
          answer={answers[currentQuestion.id] || ''}
          index={currentIndex}
          total={questions.length}
          onAnswerChange={handleAnswerChange}
          answerRef={answerControlRef}
          disabled={loading}
        />
      )}

      <footer className="checkpoint-player-actions">
        <button className="ui-button ui-button-secondary" type="button" onClick={() => { setCurrentIndex((index) => Math.max(0, index - 1)); setFocusQuestionId(null) }} disabled={currentIndex === 0 || loading}>← Previous</button>
        {currentIndex < questions.length - 1 ? (
          <button className="ui-button ui-button-primary" type="button" onClick={() => { setCurrentIndex((index) => Math.min(questions.length - 1, index + 1)); setFocusQuestionId(null) }} disabled={loading}>Next question →</button>
        ) : (
          <button className="ui-button ui-button-primary" type="button" onClick={handleSubmit} disabled={loading}>{loading ? 'Checking your work…' : 'Finish checkpoint'}</button>
        )}
      </footer>
    </section>
  )
}
