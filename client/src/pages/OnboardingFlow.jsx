import { useState, useEffect, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import {
  createTopic,
  getSetupQuestions,
  saveProfile,
  generateCurriculum,
  regenerateCurriculum,
  confirmCurriculum,
  tweakCurriculum,
  getCurriculumRecovery,
  getSettings,
  startPlacementAssessment,
  submitPlacementAssessment,
} from '../api.js'
import { readCurriculumStream } from '../curriculumStream.js'
import { normalizeSetupQuestions } from '../setupQuestions.js'
import CurriculumConfirmation from './CurriculumConfirmation.jsx'
import { SkeletonOnboarding } from '../components/Skeleton.jsx'
import AppHeader from '../components/AppHeader.jsx'

const STEPS = ['Destination', 'Starting point', 'Learning rhythm', 'Track preview']
const STEP_INDEX = {
  destination: 0,
  starting_point: 1,
  placement: 1,
  learning_rhythm: 2,
  generating: 3,
  preview: 3,
}
const GENERATION_STAGES = [
  'Reading your Trail',
  'Balancing depth and breadth',
  'Designing practice',
  'Validating the Track',
]
const PACE_OPTIONS = [
  { value: 'steady', label: 'Steady pace', description: 'A sustainable rhythm with room to reflect.' },
  { value: 'balanced', label: 'Balanced pace', description: 'A mix of focused practice and breathing room.' },
  { value: 'focused', label: 'Focused pace', description: 'Move through each week with extra momentum.' },
]

function sanitizeTopic(name) {
  return name.replace(/<script[^>]*>.*?<\/script>/gi, '').replace(/<[^>]+>/g, '').trim()
}

function safeError(error, fallback) {
  const message = typeof error?.message === 'string' ? error.message : ''
  if (!message || /sqlite|sql error|sql syntax|database|foreign key|constraint failed|no such (?:table|column)|\btable\b|\bcolumn\b/i.test(message)) {
    return fallback
  }
  return message
}

export default function OnboardingFlow() {
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const recoveryTopicId = searchParams.get('topicId')
  const [recoveryLoading, setRecoveryLoading] = useState(Boolean(recoveryTopicId))
  const [step, setStep] = useState('destination')
  const [topicName, setTopicName] = useState('')
  const [topicId, setTopicId] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [questions, setQuestions] = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [answers, setAnswers] = useState({})
  const [pace, setPace] = useState('steady')
  const [verifiedProfile, setVerifiedProfile] = useState(null)
  const [placementAssessmentId, setPlacementAssessmentId] = useState(null)
  const [placementQuestions, setPlacementQuestions] = useState([])
  const [placementAnswers, setPlacementAnswers] = useState({})
  const [placementResult, setPlacementResult] = useState(null)
  const [placementLoading, setPlacementLoading] = useState(false)
  const [placementPhase, setPlacementPhase] = useState('')
  const [generating, setGenerating] = useState(false)
  const [curriculum, setCurriculum] = useState(null)
  const [llmConfigured, setLlmConfigured] = useState(true)
  const [generationMode, setGenerationMode] = useState('auto')
  const [recoveryCanResume, setRecoveryCanResume] = useState(true)

  useEffect(() => {
    let active = true
    getSettings()
      .then((settings) => {
        if (active) setLlmConfigured(Boolean(settings.ready ?? settings.apiKeySet))
      })
      .catch(() => {
        if (active) setLlmConfigured(false)
      })
    return () => { active = false }
  }, [])

  useEffect(() => {
    if (!recoveryTopicId) return undefined

    const requestedTopicId = Number(recoveryTopicId)
    if (!Number.isInteger(requestedTopicId) || requestedTopicId <= 0) {
      setError('The saved Trail could not be opened. Choose it again from your dashboard.')
      setRecoveryLoading(false)
      return undefined
    }

    let active = true
    setError('')
    getCurriculumRecovery(requestedTopicId)
      .then((data) => {
        if (!active) return
        const topic = data.topic || {}
        setTopicId(topic.id || requestedTopicId)
        setTopicName(topic.title || '')
        setAnswers({
          level: topic.level || 'Beginner',
          timeCommitment: topic.timeCommitment || '30 min/day',
        })
        setVerifiedProfile(topic.level ? { level: topic.level, selfReportedLevel: topic.level } : null)
        setRecoveryCanResume(Boolean(data.resumeAvailable))

        if (data.curriculumState === 'draft_ready' && data.curriculum) {
          setCurriculum(data.curriculum)
          setStep('preview')
        } else if (data.curriculumState === 'setup') {
          setStep('starting_point')
        } else {
          setGenerationMode('manual')
          setError(safeError(data.curriculumError ? new Error(data.curriculumError) : null, 'Track generation is still in progress. Check again shortly.'))
          setStep('generating')
        }
        setRecoveryLoading(false)
      })
      .catch((err) => {
        if (!active) return
        setTopicId(requestedTopicId)
        setGenerationMode('manual')
        setRecoveryCanResume(true)
        setError(safeError(err, 'Could not load the saved Track. Please retry.'))
        setStep('generating')
        setRecoveryLoading(false)
      })

    return () => { active = false }
  }, [recoveryTopicId])

  const loadQuestions = useCallback(async () => {
    if (!topicId) return
    setQuestionsLoading(true)
    setError('')
    try {
      const data = await getSetupQuestions(topicId)
      setQuestions(normalizeSetupQuestions(data.questions))
    } catch (err) {
      setError(safeError(err, 'We could not load your starting choices. Please retry.'))
      setQuestions([])
    } finally {
      setQuestionsLoading(false)
    }
  }, [topicId])

  useEffect(() => {
    if (step === 'starting_point' && topicId && questions.length === 0 && !questionsLoading) loadQuestions()
  }, [step, topicId, questions.length, questionsLoading, loadQuestions])

  const handleTopicSubmit = useCallback(async (event) => {
    event.preventDefault()
    setError('')
    const trimmed = sanitizeTopic(topicName)
    if (!trimmed) {
      setError('Please enter a destination for your learning Trail.')
      return
    }
    if (trimmed.length > 100) {
      setError('That destination is too long. Use 100 characters or fewer.')
      return
    }

    setSubmitting(true)
    try {
      const result = await createTopic(trimmed)
      setTopicId(result.topic.id)
      setTopicName(trimmed)
      setQuestions([])
      setStep('starting_point')
    } catch (err) {
      setError(safeError(err, 'We could not create that Trail. Please try again.'))
    } finally {
      setSubmitting(false)
    }
  }, [topicName])

  const selectedLevel = answers.level || questions[0]?.options?.[0]?.value || ''
  const selectedTime = answers.timeCommitment || ''
  const levelOptions = questions.find((question) => question.id === 'level')?.options || []
  const timeOptions = questions.find((question) => question.id === 'timeCommitment')?.options || []

  const chooseStartingPoint = useCallback((level) => {
    setAnswers((current) => ({ ...current, level }))
    setVerifiedProfile(null)
    setPlacementResult(null)
    setError('')
  }, [])

  const handleSkipPlacement = useCallback(() => {
    if (!selectedLevel) return
    setVerifiedProfile({ level: selectedLevel, selfReportedLevel: selectedLevel })
    setStep('learning_rhythm')
    setError('')
  }, [selectedLevel])

  const startPlacement = useCallback(async () => {
    if (!topicId || !selectedLevel) return
    setPlacementLoading(true)
    setPlacementPhase('starting')
    setPlacementResult(null)
    setPlacementQuestions([])
    setPlacementAnswers({})
    setError('')
    setStep('placement')
    try {
      const data = await startPlacementAssessment(topicId, selectedLevel)
      if (!Number.isInteger(data.assessmentId) || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('Placement check unavailable')
      }
      setPlacementAssessmentId(data.assessmentId)
      setPlacementQuestions(data.questions)
      setPlacementPhase('')
    } catch (err) {
      setError(safeError(err, 'The placement check could not be prepared. Please retry or skip it.'))
      setPlacementPhase('')
    } finally {
      setPlacementLoading(false)
    }
  }, [topicId, selectedLevel])

  const handlePlacementAnswerChange = useCallback((questionId, value) => {
    setPlacementAnswers((current) => ({ ...current, [questionId]: value }))
  }, [])

  const handlePlacementSubmit = useCallback(async () => {
    if (placementQuestions.some((question) => typeof placementAnswers[question.id] !== 'string' || !placementAnswers[question.id].trim())) {
      setError('Please answer every placement question.')
      return
    }
    setPlacementLoading(true)
    setPlacementPhase('evaluating')
    setError('')
    try {
      setPlacementResult(await submitPlacementAssessment(topicId, placementAssessmentId, placementAnswers))
    } catch (err) {
      setError(safeError(err, 'The placement result could not be prepared. Your answers are still here; retry when ready.'))
    } finally {
      setPlacementLoading(false)
      setPlacementPhase('')
    }
  }, [topicId, placementAssessmentId, placementQuestions, placementAnswers])

  const handlePlacementContinue = useCallback(() => {
    if (!placementResult) return
    setVerifiedProfile({
      level: placementResult.recommendedLevel,
      selfReportedLevel: placementResult.requestedLevel || selectedLevel,
      placementAssessmentId: placementResult.assessmentId,
    })
    setAnswers((current) => ({ ...current, level: placementResult.recommendedLevel }))
    setStep('learning_rhythm')
    setError('')
  }, [placementResult, selectedLevel])

  const handleProfileSubmit = useCallback(async () => {
    const profile = verifiedProfile || (selectedLevel ? { level: selectedLevel, selfReportedLevel: selectedLevel } : null)
    if (!profile?.level || !selectedTime) {
      setError('Choose a starting point and daily study time to continue.')
      return
    }
    setSubmitting(true)
    setError('')
    try {
      const payload = {
        level: profile.level,
        timeCommitment: selectedTime,
      }
      if (profile.selfReportedLevel) payload.selfReportedLevel = profile.selfReportedLevel
      if (profile.placementAssessmentId) payload.placementAssessmentId = profile.placementAssessmentId
      await saveProfile(topicId, payload)
      setGenerationMode('auto')
      setStep('generating')
    } catch (err) {
      setError(safeError(err, 'Your learning rhythm could not be saved. Please retry.'))
    } finally {
      setSubmitting(false)
    }
  }, [topicId, verifiedProfile, selectedLevel, selectedTime])

  const handleGenerate = useCallback(async () => {
    if (!topicId) return
    setGenerating(true)
    setError('')
    try {
      const response = await generateCurriculum(topicId)
      setCurriculum(await readCurriculumStream(response))
      setStep('preview')
    } catch (err) {
      setError(safeError(err, 'The Track could not be prepared. Your choices are saved; try again when ready.'))
      setGenerationMode('manual')
    } finally {
      setGenerating(false)
    }
  }, [topicId])

  useEffect(() => {
    if (step === 'generating' && generationMode === 'auto') handleGenerate()
  }, [step, generationMode, handleGenerate])

  const handleResumeGeneration = useCallback(() => {
    setError('')
    setGenerationMode('auto')
    setStep('generating')
  }, [])

  const handleRefreshRecovery = useCallback(async () => {
    if (!topicId) return
    setSubmitting(true)
    setError('')
    try {
      const data = await getCurriculumRecovery(topicId)
      setRecoveryCanResume(Boolean(data.resumeAvailable))
      if (data.curriculumState === 'draft_ready' && data.curriculum) {
        setCurriculum(data.curriculum)
        setStep('preview')
      } else if (data.curriculumState === 'setup') {
        setStep('starting_point')
      } else {
        setGenerationMode('manual')
        setError(safeError(data.curriculumError ? new Error(data.curriculumError) : null, 'Track generation is still in progress. Check again shortly.'))
        setStep('generating')
      }
    } catch (err) {
      setError(safeError(err, 'Could not refresh the saved Track status. Please retry.'))
    } finally {
      setSubmitting(false)
    }
  }, [topicId])

  const handleConfirm = useCallback(async () => {
    setSubmitting(true)
    setError('')
    try {
      await confirmCurriculum(topicId, curriculum)
      navigate('/')
    } catch (err) {
      setError(safeError(err, 'Your Track could not be added to the Trail. Please retry.'))
    } finally {
      setSubmitting(false)
    }
  }, [topicId, curriculum, navigate])

  const handleTweak = useCallback(async (request) => {
    setSubmitting(true)
    setError('')
    try {
      setCurriculum(await tweakCurriculum(topicId, request))
    } catch (err) {
      setError(safeError(err, 'The Track could not be adjusted. Your current preview is still here.'))
    } finally {
      setSubmitting(false)
    }
  }, [topicId])

  const handleRegenerate = useCallback(async () => {
    setGenerating(true)
    setGenerationMode('manual')
    setStep('generating')
    setError('')
    try {
      const response = await regenerateCurriculum(topicId)
      setCurriculum(await readCurriculumStream(response))
      setStep('preview')
    } catch (err) {
      setError(safeError(err, 'The Track could not be refreshed. Your current preview is still here.'))
      setStep('preview')
    } finally {
      setGenerating(false)
    }
  }, [topicId])

  const handleBack = useCallback(() => {
    if (step === 'starting_point' || step === 'placement') setStep('destination')
    else if (step === 'learning_rhythm') setStep('starting_point')
    else if (step === 'preview') setStep('learning_rhythm')
  }, [step])

  const currentStage = STEP_INDEX[step] ?? 0

  if (recoveryLoading) return <SkeletonOnboarding />

  return (
    <div className="ui-page ui-onboarding-page min-h-screen">
      <AppHeader />
      <main className="ui-container ui-onboarding-container max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <nav className="ui-step-navigation mb-8" aria-label="Learning path setup">
          <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide mb-3">Step {currentStage + 1} of 4</p>
          <ol className="ui-step-list">
            {STEPS.map((label, index) => (
              <li key={label} aria-label={label} aria-current={currentStage === index ? 'step' : undefined} className={currentStage === index ? 'is-current' : index < currentStage ? 'is-complete' : ''}>
                <span className="ui-step-marker" aria-hidden="true">{index < currentStage ? '✓' : index + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </nav>

        {!llmConfigured && (
          <div className="ui-alert ui-alert-warning mb-6" role="alert">
            Connect an AI provider in Settings before creating a Track.
            <button type="button" onClick={() => navigate('/settings')} className="ui-text-link ml-2 underline font-medium">Open Settings</button>
          </div>
        )}

        {error && step !== 'preview' && <div className="ui-alert ui-alert-danger mb-6" role="alert">{error}</div>}

        {step === 'destination' && (
          <section className="ui-onboarding-step ui-panel mx-auto flex min-h-[45vh] max-w-xl flex-col justify-center p-6 sm:p-8" aria-labelledby="destination-title">
            <h1 id="destination-title" className="text-3xl font-bold ui-text mb-2">What do you want to be able to do?</h1>
            <p className="ui-text-secondary mb-8">Choose a destination such as React, Calculus, negotiation, or Japanese. We will shape a finite Track around it.</p>
            <form onSubmit={handleTopicSubmit}>
              <label htmlFor="topic-name" className="ui-field-label">Your learning destination</label>
              <input
                id="topic-name"
                type="text"
                value={topicName}
                onChange={(event) => setTopicName(event.target.value)}
                placeholder="For example, React or Japanese"
                maxLength={100}
                className="ui-field mt-2 w-full"
                disabled={submitting}
                aria-invalid={Boolean(error)}
                aria-describedby={error ? 'destination-error' : undefined}
                autoFocus
              />
              {error && <p id="destination-error" className="ui-text-danger mt-2 text-sm" role="alert">{error}</p>}
              <button type="submit" disabled={submitting} className="ui-button ui-button-primary mt-5 w-full">
                {submitting ? 'Saving destination…' : 'Set my destination'}
              </button>
            </form>
          </section>
        )}

        {step === 'starting_point' && (
          <section className="ui-onboarding-step mx-auto max-w-2xl" aria-labelledby="starting-point-title">
            <h1 id="starting-point-title" className="text-2xl font-bold ui-text mb-2">Choose your starting point</h1>
            <p className="ui-text-secondary mb-6">A quick self-report is enough. You can take the placement check if you would like a second signal.</p>
            {questionsLoading && <p className="ui-text-muted py-10 text-center" role="status">Loading your starting choices…</p>}
            {!questionsLoading && questions.length === 0 && (
              <section className="ui-panel p-5 text-center">
                <p className="ui-text-secondary mb-4">We could not load your starting choices.</p>
                <button type="button" onClick={loadQuestions} className="ui-button ui-button-secondary">Retry choices</button>
              </section>
            )}
            {!questionsLoading && levelOptions.length > 0 && (
              <div className="ui-panel p-5 sm:p-6">
                <p className="ui-field-label mb-3" id="starting-point-question">What is your starting point?</p>
                <div className="flex flex-wrap gap-2" role="group" aria-labelledby="starting-point-question">
                  {levelOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      aria-pressed={selectedLevel === option.value}
                      onClick={() => chooseStartingPoint(option.value)}
                      className={`ui-choice ${selectedLevel === option.value ? 'is-selected' : ''}`}
                    >
                      {option.label}
                      {selectedLevel === option.value && <span aria-hidden="true" className="ml-2">✓</span>}
                    </button>
                  ))}
                </div>
                <div className="ui-choice-panel mt-6" aria-label="Placement check choice">
                  <p className="ui-text-secondary mb-3">Would you like to verify that starting point?</p>
                  <div className="flex flex-wrap gap-3">
                    <button type="button" onClick={startPlacement} disabled={!selectedLevel || placementLoading} className="ui-button ui-button-secondary">
                      Take a placement check
                    </button>
                    <button type="button" onClick={handleSkipPlacement} disabled={!selectedLevel} className="ui-button ui-button-primary">
                      Skip placement check
                    </button>
                  </div>
                </div>
                <button type="button" onClick={handleBack} className="ui-text-link mt-5 min-h-11 underline">Back to destination</button>
              </div>
            )}
          </section>
        )}

        {step === 'placement' && (
          <section className="ui-onboarding-step mx-auto max-w-2xl" aria-labelledby="placement-title">
            <h1 id="placement-title" className="text-2xl font-bold ui-text mb-2">Optional placement check</h1>
            <p className="ui-text-secondary mb-6">Your answers help us choose a useful starting depth. This is only a recommendation.</p>
            {placementResult ? (
              <section className="ui-panel p-5" role="status" aria-live="polite">
                <h2 className="text-lg font-bold ui-text mb-2">A good starting point is {placementResult.recommendedLevel}</h2>
                <p className="ui-text-secondary mb-3">Your self-reported level was {placementResult.requestedLevel || selectedLevel}.</p>
                {placementResult.gaps?.length > 0 && <ul className="list-disc list-inside text-sm ui-text-secondary mb-3 space-y-1">{placementResult.gaps.map((gap, index) => <li key={index}>{gap}</li>)}</ul>}
                {placementResult.feedback?.length > 0 && <p className="text-sm ui-text-secondary mb-4">{placementResult.feedback[0]}</p>}
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={handlePlacementContinue} className="ui-button ui-button-primary">Continue with {placementResult.recommendedLevel}</button>
                  <button type="button" onClick={handleSkipPlacement} className="ui-button ui-button-secondary">Keep my self-reported level</button>
                </div>
              </section>
            ) : (
              <div className="space-y-4">
                {placementQuestions.map((question, index) => (
                  <section key={question.id} className="ui-panel p-4">
                    <p className="font-medium ui-text mb-3">{index + 1}. {question.text}</p>
                    {question.type === 'multiple_choice' ? (
                      <div className="flex flex-wrap gap-2" role="group" aria-label={question.text}>
                        {(question.options || []).map((option) => (
                          <button key={option.value} type="button" onClick={() => handlePlacementAnswerChange(question.id, option.value)} aria-pressed={placementAnswers[question.id] === option.value} className={`ui-choice ${placementAnswers[question.id] === option.value ? 'is-selected' : ''}`}>
                            {option.label}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <textarea aria-label={question.text} value={placementAnswers[question.id] || ''} onChange={(event) => handlePlacementAnswerChange(question.id, event.target.value)} rows={4} maxLength={2000} placeholder="Explain your reasoning in your own words…" className="ui-field w-full resize-y" disabled={placementLoading} />
                    )}
                  </section>
                ))}
                {placementLoading && <p className="ui-text-muted text-center" role="status">{placementPhase === 'starting' ? 'Preparing your placement check…' : 'Reviewing your answers…'}</p>}
                {error && <div className="ui-alert ui-alert-danger" role="alert">{error}</div>}
                {!placementLoading && placementQuestions.length === 0 && error && (
                  <button type="button" onClick={startPlacement} className="ui-button ui-button-secondary">Retry placement check</button>
                )}
                {placementQuestions.length > 0 && (
                  <button type="button" onClick={handlePlacementSubmit} disabled={placementLoading} className="ui-button ui-button-primary">
                    {placementLoading ? 'Checking…' : 'Check my starting point'}
                  </button>
                )}
                <button type="button" onClick={handleSkipPlacement} className="ui-text-link ml-4 min-h-11 underline">Skip this check</button>
              </div>
            )}
          </section>
        )}

        {step === 'learning_rhythm' && (
          <section className="ui-onboarding-step mx-auto max-w-2xl" aria-labelledby="learning-rhythm-title">
            <h1 id="learning-rhythm-title" className="text-2xl font-bold ui-text mb-2">Set your learning rhythm</h1>
            <p className="ui-text-secondary mb-6">Choose a daily study window and a pace that feels sustainable. You can adjust your schedule for future Tracks.</p>
            <div className="ui-panel p-5 sm:p-6 space-y-6">
              <fieldset>
                <legend className="ui-field-label mb-3">Daily study time</legend>
                <div className="flex flex-wrap gap-2">
                  {timeOptions.map((option) => (
                    <button key={option.value} type="button" aria-pressed={selectedTime === option.value} onClick={() => setAnswers((current) => ({ ...current, timeCommitment: option.value }))} className={`ui-choice ${selectedTime === option.value ? 'is-selected' : ''}`}>
                      {option.label}
                    </button>
                  ))}
                </div>
              </fieldset>
              <fieldset>
                <legend className="ui-field-label mb-3">Preferred pace</legend>
                <div className="grid gap-3 sm:grid-cols-3">
                  {PACE_OPTIONS.map((option) => (
                    <button key={option.value} type="button" aria-pressed={pace === option.value} onClick={() => setPace(option.value)} className={`ui-choice-card text-left ${pace === option.value ? 'is-selected' : ''}`}>
                      <span className="block font-semibold">{option.label}</span>
                      <span className="mt-1 block text-sm ui-text-secondary">{option.description}</span>
                    </button>
                  ))}
                </div>
              </fieldset>
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" onClick={handleBack} className="ui-button ui-button-secondary">Back</button>
                <button type="button" onClick={handleProfileSubmit} disabled={submitting || questionsLoading || !selectedTime} className="ui-button ui-button-primary flex-1">
                  {submitting ? 'Saving rhythm…' : 'Build my Track'}
                </button>
              </div>
            </div>
          </section>
        )}

        {step === 'generating' && (
          <section className="ui-onboarding-step ui-panel mx-auto flex min-h-[40vh] max-w-2xl flex-col justify-center p-6 sm:p-8" aria-labelledby="track-generation-title">
            {generating ? (
              <>
                <div className="ui-progress-indeterminate mb-5" role="status" aria-label="Preparing your Track" />
                <h1 id="track-generation-title" className="text-xl font-bold ui-text mb-2">Designing your Track…</h1>
                <p className="ui-text-secondary mb-5">We are shaping practice around your destination and available time.</p>
                <ol className="ui-generation-stages" aria-label="Track design stages">
                  {GENERATION_STAGES.map((stageLabel) => <li key={stageLabel}>{stageLabel}</li>)}
                </ol>
              </>
            ) : (
              <>
                <h1 id="track-generation-title" className="text-xl font-bold ui-text mb-2">Your Track is ready to resume</h1>
                <p className="ui-text-secondary mb-5">Your setup is saved. Resume preparation or check whether a saved preview is ready.</p>
                <div className="flex flex-wrap gap-3">
                  <button type="button" onClick={recoveryCanResume ? handleResumeGeneration : handleRefreshRecovery} disabled={submitting} className="ui-button ui-button-primary">
                    {recoveryCanResume ? 'Resume Track generation' : 'Check Track status'}
                  </button>
                  <button type="button" onClick={handleRefreshRecovery} disabled={submitting} className="ui-button ui-button-secondary">
                    {submitting ? 'Checking…' : 'Check again'}
                  </button>
                </div>
              </>
            )}
          </section>
        )}

        {step === 'preview' && curriculum && (
          <CurriculumConfirmation
            curriculum={curriculum}
            isTrackSetup
            topicName={topicName}
            timeCommitment={selectedTime}
            pace={PACE_OPTIONS.find((option) => option.value === pace)?.label || 'Steady pace'}
            onConfirm={handleConfirm}
            onTweak={handleTweak}
            onRegenerate={handleRegenerate}
            onBack={handleBack}
            submitting={submitting || generating}
            error={error}
          />
        )}
      </main>
    </div>
  )
}
