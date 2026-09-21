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

function sanitizeTopic(name) {
  // Basic XSS sanitization: strip script tags and dangerous attributes
  return name
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export default function OnboardingFlow() {
  const navigate = useNavigate()
  const [step, setStep] = useState('topic_input')
  const [topicName, setTopicName] = useState('')
  const [topicId, setTopicId] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [questions, setQuestions] = useState([])
  const [questionsLoading, setQuestionsLoading] = useState(false)
  const [answers, setAnswers] = useState({})
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
  const [searchParams] = useSearchParams()
  const recoveryTopicId = searchParams.get('topicId')

  // Check LLM configuration on mount
  useEffect(() => {
    async function check() {
      try {
        const settings = await getSettings()
        if (!(settings.ready ?? settings.apiKeySet)) {
          setLlmConfigured(false)
        }
      } catch {
        setLlmConfigured(false)
      }
    }
    check()
  }, [])

  useEffect(() => {
    if (!recoveryTopicId) return undefined

    const requestedTopicId = Number(recoveryTopicId)
    if (!Number.isInteger(requestedTopicId) || requestedTopicId <= 0) {
      setError('The saved learning topic could not be opened. Please choose it again from the dashboard.')
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
          0: topic.level || 'Beginner',
          1: topic.timeCommitment || '30 min/day',
        })
        setRecoveryCanResume(Boolean(data.resumeAvailable))

        if (data.curriculumState === 'draft_ready' && data.curriculum) {
          setCurriculum(data.curriculum)
          setStep('confirmation')
          return
        }

        if (data.curriculumState === 'setup') {
          setStep('setup_questions')
          return
        }

        setGenerationMode('manual')
        setError(
          data.curriculumError
          || (data.curriculumState === 'generating'
            ? 'Roadmap generation is still in progress. You can retry when it becomes available.'
            : 'Your roadmap is ready to resume.'),
        )
        setStep('generating')
      })
      .catch((err) => {
        if (!active) return
        setTopicId(requestedTopicId)
        setGenerationMode('manual')
        setRecoveryCanResume(true)
        setError(err.message || 'Could not load the saved roadmap. Please retry.')
        setStep('generating')
      })

    return () => {
      active = false
    }
  }, [recoveryTopicId])

  const handleTopicSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      setError('')
      const trimmed = sanitizeTopic(topicName)
      if (!trimmed || trimmed.length === 0) {
        setError('Please enter a topic.')
        return
      }
      if (trimmed.length > 100) {
        setError('Topic name is too long (max 100 characters).')
        return
      }
      setSubmitting(true)
      try {
        const result = await createTopic(trimmed)
        setTopicId(result.topic.id)
        setTopicName(trimmed)
        setStep('setup_questions')
      } catch (err) {
        setError(err.message || 'Failed to create topic.')
      } finally {
        setSubmitting(false)
      }
    },
    [topicName]
  )

  const loadQuestions = useCallback(async () => {
    if (!topicId) return
    setQuestionsLoading(true)
    setError('')
    try {
      const data = await getSetupQuestions(topicId)
      setQuestions(normalizeSetupQuestions(data.questions))
    } catch (err) {
      setError(err.message || 'Failed to load setup questions.')
      setQuestions([])
    } finally {
      setQuestionsLoading(false)
    }
  }, [topicId])

  useEffect(() => {
    if (step === 'setup_questions' && topicId) {
      loadQuestions()
    }
  }, [step, topicId, loadQuestions])

  const handleAnswerChange = (questionIndex, value) => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: value }))
  }

  const startPlacement = useCallback(async (level) => {
    setPlacementLoading(true)
    setPlacementPhase('starting')
    setPlacementResult(null)
    setPlacementQuestions([])
    setPlacementAnswers({})
    setError('')
    setStep('depth_check')
    try {
      const data = await startPlacementAssessment(topicId, level)
      if (!Number.isInteger(data.assessmentId) || !Array.isArray(data.questions) || data.questions.length === 0) {
        throw new Error('The placement check was incomplete. Please retry.')
      }
      setPlacementAssessmentId(data.assessmentId)
      setPlacementQuestions(data.questions)
      setPlacementPhase('')
    } catch (err) {
      setError(err.message || 'Failed to start the placement check. Please retry.')
      setPlacementPhase('')
    } finally {
      setPlacementLoading(false)
    }
  }, [topicId])

  const handleProfileSubmit = useCallback(async () => {
    setError('')
    if (questions.length > 0 && !answers[0]) {
      setError('Please answer all questions.')
      return
    }
    if (questions.length > 1 && !answers[1]) {
      setError('Please answer all questions.')
      return
    }

    // Map answers to level and time commitment
    const level = answers[0] || 'Beginner'
    const timeCommitment = answers[1] || '30 min/day'

    if (level !== 'Beginner') {
      await startPlacement(level)
      return
    }

    setSubmitting(true)
    try {
      await saveProfile(topicId, { level, timeCommitment })
      setGenerationMode('auto')
      setStep('generating')
    } catch (err) {
      setError(err.message || 'Failed to save profile.')
    } finally {
      setSubmitting(false)
    }
  }, [topicId, questions, answers, startPlacement])

  const handlePlacementAnswerChange = useCallback((questionId, value) => {
    setPlacementAnswers((prev) => ({ ...prev, [questionId]: value }))
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
      const result = await submitPlacementAssessment(topicId, placementAssessmentId, placementAnswers)
      setPlacementResult(result)
    } catch (err) {
      setError(err.message || 'Failed to evaluate the placement check. Please retry.')
    } finally {
      setPlacementLoading(false)
      setPlacementPhase('')
    }
  }, [topicId, placementAssessmentId, placementQuestions, placementAnswers])

  const handlePlacementConfirm = useCallback(async () => {
    if (!placementResult) return
    setSubmitting(true)
    setError('')
    try {
      await saveProfile(topicId, {
        level: placementResult.recommendedLevel,
        selfReportedLevel: placementResult.requestedLevel,
        timeCommitment: answers[1] || '30 min/day',
        placementAssessmentId: placementResult.assessmentId,
      })
      setGenerationMode('auto')
      setStep('generating')
    } catch (err) {
      setError(err.message || 'Failed to save your verified profile.')
    } finally {
      setSubmitting(false)
    }
  }, [topicId, placementResult, answers])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError('')
    setCurriculum(null)
    try {
      const res = await generateCurriculum(topicId)
      const parsed = await readCurriculumStream(res)
      setCurriculum(parsed)
      setStep('confirmation')
    } catch (err) {
      setError(err.message || 'Failed to generate curriculum. Please check your API key and try again.')
      setGenerationMode('manual')
    } finally {
      setGenerating(false)
    }
  }, [topicId])

  useEffect(() => {
    if (step === 'generating' && generationMode === 'auto') {
      handleGenerate()
    }
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
        setStep('confirmation')
      } else if (data.curriculumState === 'setup') {
        setStep('setup_questions')
      } else {
        setGenerationMode('manual')
        setError(data.curriculumError || 'Roadmap generation is still in progress. Check again shortly.')
        setStep('generating')
      }
    } catch (err) {
      setError(err.message || 'Could not refresh the saved roadmap status.')
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
      setError(err.message || 'Failed to confirm curriculum.')
    } finally {
      setSubmitting(false)
    }
  }, [topicId, curriculum, navigate])

  const handleTweak = useCallback(
    async (request) => {
      setSubmitting(true)
      setError('')
      try {
        const body = await tweakCurriculum(topicId, request)
        setCurriculum(body)
      } catch (err) {
        setError(err.message || 'Failed to tweak curriculum.')
      } finally {
        setSubmitting(false)
      }
    },
    [topicId]
  )

  const handleRegenerate = useCallback(async () => {
    setGenerating(true)
    setGenerationMode('manual')
    setStep('generating')
    setError('')
    try {
      const res = await regenerateCurriculum(topicId)
      const parsed = await readCurriculumStream(res)
      setCurriculum(parsed)
      setStep('confirmation')
    } catch (err) {
      setError(err.message || 'Failed to regenerate curriculum.')
      setStep('confirmation')
    } finally {
      setGenerating(false)
    }
  }, [topicId])

  const handleBack = () => {
    if (step === 'setup_questions') {
      setStep('topic_input')
    } else if (step === 'depth_check') {
      setStep('setup_questions')
    } else if (step === 'confirmation') {
      setStep('setup_questions')
    }
  }

  const stageLabels = ['Topic', 'Setup', 'Generation', 'Review']
  const stageByStep = { topic_input: 0, setup_questions: 1, generating: 2, confirmation: 3 }
  const currentStage = stageByStep[step]

  return (
    <div className="ui-page min-h-screen">
      <AppHeader />

      <main className="max-w-4xl mx-auto px-4 py-6 sm:py-8">
        <nav className="ui-step-navigation mb-8" aria-label="Learning path setup">
          <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide mb-3">Step {currentStage + 1} of 4</p>
          <ol className="ui-step-list">
            {stageLabels.map((label, index) => (
              <li key={label} aria-label={label} aria-current={currentStage === index ? 'step' : undefined} className={currentStage === index ? 'is-current' : index < currentStage ? 'is-complete' : ''}>
                <span className="ui-step-marker" aria-hidden="true">{index < currentStage ? '✓' : index + 1}</span>
                <span>{label}</span>
              </li>
            ))}
          </ol>
        </nav>
        {/* LLM not configured banner */}
        {!llmConfigured && (
          <div className="ui-alert ui-alert-warning mb-6" role="alert">
            Connect an LLM provider in Settings to generate lessons.
            <button
              onClick={() => navigate('/settings')}
              className="ml-2 underline font-medium"
            >
              Go to Settings → LLM Configuration
            </button>
          </div>
        )}

        {error && step !== 'topic_input' && step !== 'confirmation' && (
          <div className="ui-alert ui-alert-danger mb-6" role="alert">
            {error}
          </div>
        )}

        {/* Step 1: Topic Input */}
        {step === 'topic_input' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <h1 className="text-3xl font-bold ui-text mb-2">What do you want to learn?</h1>
            <p className="ui-text-secondary mb-8 text-center max-w-md">
              Enter any topic — React, Calculus, Negotiation, Japanese — and we will build a finite 80/20 foundation with clear module checkpoints.
            </p>
            <form onSubmit={handleTopicSubmit} className="w-full max-w-md">
              <div className="flex flex-col gap-2">
                <label htmlFor="topic-name" className="ui-field-label">Topic</label>
                <input
                  id="topic-name"
                  type="text"
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder="Enter a topic (e.g., React, Calculus)"
                  maxLength={100}
                  className="ui-field w-full"
                  disabled={submitting}
                  aria-invalid={Boolean(error && step === 'topic_input')}
                  aria-describedby={error && step === 'topic_input' ? 'topic-error' : undefined}
                  autoFocus
                />
                {error && step === 'topic_input' && (
                  <p id="topic-error" className="text-sm text-red-600" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full rounded-lg bg-indigo-600 px-4 py-3 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Creating...' : 'Start Learning'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 2: Setup Questions */}
        {step === 'setup_questions' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <h1 className="text-2xl font-bold ui-text mb-2 max-w-full break-words">Quick setup for {topicName}</h1>
            <p className="ui-text-secondary mb-6 text-center max-w-md">
              Answer 1–2 quick questions so we can tailor your learning path.
            </p>

            <div className="w-full max-w-md space-y-6">
              {questions.map((q, i) => (
                <div key={i} className="ui-panel p-4">
                  <p className="font-medium text-gray-900 mb-3">{q.text}</p>
                  <div className="flex flex-wrap gap-2" role="group" aria-label={q.text}>
                    {q.options.map((opt) => (
                      <button
                        key={opt.value}
                        type="button"
                        onClick={() => handleAnswerChange(i, opt.value)}
                        aria-pressed={answers[i] === opt.value}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          answers[i] === opt.value
                            ? 'ui-choice is-selected'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {opt.label}
                        {answers[i] === opt.value && <span className="ml-2" aria-hidden="true">✓</span>}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {questionsLoading && (
                <div className="text-gray-500 text-center" role="status">Loading questions...</div>
              )}

              {!questionsLoading && questions.length === 0 && error && (
                <div className="ui-panel p-4 text-center">
                  <p className="ui-text-secondary text-sm mb-3">We could not load the setup questions.</p>
                  <button
                    type="button"
                    onClick={loadQuestions}
                    className="ui-button ui-button-secondary"
                  >
                    Retry questions
                  </button>
                </div>
              )}

              {!questionsLoading && questions.length > 0 && error && answers[0] && answers[0] !== 'Beginner' && (
                <div className="ui-panel p-4 text-center">
                  <p className="ui-text-secondary text-sm mb-3">The level check did not start.</p>
                  <button
                    type="button"
                    onClick={() => startPlacement(answers[0])}
                    disabled={placementLoading}
                    className="ui-button ui-button-secondary"
                  >
                    Retry placement check
                  </button>
                </div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleBack}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  Back
                </button>
                <button
                  onClick={handleProfileSubmit}
                  disabled={submitting || questionsLoading || placementLoading || questions.length === 0}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Setup sub-step: verify a claimed Intermediate/Advanced level. */}
        {step === 'depth_check' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <h1 className="text-2xl font-bold ui-text mb-2 max-w-full break-words">Let&apos;s verify your {answers[0]} level</h1>
            <p className="ui-text-secondary mb-6 text-center max-w-lg">
              Answer a few practical questions. Your result helps us start at the right depth; it will not delete or change any existing learning.
            </p>

            <div className="w-full max-w-2xl space-y-5">
              {placementResult ? (
                <div className="ui-panel p-5" role="status" aria-live="polite">
                  <h2 className="text-lg font-bold ui-text mb-2">
                    {placementResult.passed ? 'Level confirmed' : 'We found a better starting point'}
                  </h2>
                  <p className="ui-text-secondary mb-3">
                    Score: <strong>{placementResult.score}%</strong>. We recommend starting at <strong>{placementResult.recommendedLevel}</strong>.
                  </p>
                  {placementResult.gaps?.length > 0 && (
                    <ul className="list-disc list-inside text-sm ui-text-secondary mb-3 space-y-1">
                      {placementResult.gaps.map((gap, index) => <li key={index}>{gap}</li>)}
                    </ul>
                  )}
                  {placementResult.feedback?.length > 0 && (
                    <p className="text-sm ui-text-secondary mb-4">{placementResult.feedback[0]}</p>
                  )}
                  <div className="flex flex-wrap gap-3">
                    <button
                      type="button"
                      onClick={handlePlacementConfirm}
                      disabled={submitting}
                      className="ui-button ui-button-primary"
                    >
                      {submitting ? 'Saving...' : `Continue with ${placementResult.recommendedLevel}`}
                    </button>
                    <button
                      type="button"
                      onClick={() => startPlacement(answers[0])}
                      disabled={placementLoading || submitting}
                      className="ui-button ui-button-secondary"
                    >
                      Try another check
                    </button>
                  </div>
                </div>
              ) : (
                <>
                  {placementQuestions.map((question, index) => (
                    <div key={question.id} className="ui-panel p-4">
                      <p className="font-medium ui-text mb-3">{index + 1}. {question.text}</p>
                      {question.type === 'multiple_choice' ? (
                        <div className="flex flex-wrap gap-2" role="group" aria-label={question.text}>
                          {(question.options || []).map((option) => (
                            <button
                              key={option.value}
                              type="button"
                              onClick={() => handlePlacementAnswerChange(question.id, option.value)}
                              aria-pressed={placementAnswers[question.id] === option.value}
                              className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                                placementAnswers[question.id] === option.value
                                  ? 'ui-choice is-selected'
                                  : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                              }`}
                            >
                              {option.label}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <textarea
                          aria-label={question.text}
                          value={placementAnswers[question.id] || ''}
                          onChange={(event) => handlePlacementAnswerChange(question.id, event.target.value)}
                          rows={4}
                          maxLength={2000}
                          placeholder="Explain your reasoning in your own words..."
                          className="ui-field w-full resize-none"
                          disabled={placementLoading}
                        />
                      )}
                    </div>
                  ))}

                  {placementLoading && <div className="text-gray-500 text-center" role="status">
                    {placementPhase === 'starting' ? 'Preparing your level check...' : 'Checking your level...'}
                  </div>}
                  <div className="flex items-center gap-3">
                    <button onClick={handleBack} className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500">
                      Back
                    </button>
                    {placementQuestions.length === 0 && error && !placementLoading ? (
                      <button
                        type="button"
                        onClick={() => startPlacement(answers[0])}
                        className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                      >
                        Retry placement check
                      </button>
                    ) : (
                      <button
                        onClick={handlePlacementSubmit}
                        disabled={placementLoading || placementQuestions.length === 0}
                        className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                      >
                        {placementLoading ? 'Checking...' : 'Check my level'}
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        )}

        {/* Step 3: Generating */}
        {step === 'generating' && (
          generating ? (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
              <div className="ui-spinner mb-4" role="status" aria-label="Generating your learning path" />
              <h1 className="text-xl font-bold ui-text mb-2">Designing your learning path...</h1>
              <p className="ui-text-secondary text-center max-w-md text-sm sm:text-base">
                Our AI tutor is building a finite 80/20 curriculum with modules, practical tasks, and skill checks.
                This takes about 30–60 seconds.
              </p>
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[50vh]">
              <h1 className="text-xl font-bold ui-text mb-2">Resume your roadmap generation</h1>
              <p className="ui-text-secondary text-center max-w-md text-sm sm:text-base mb-6">
                The roadmap was not saved completely. Resume the generation step and we will save the draft before showing it for review.
              </p>
              <button
                type="button"
                onClick={recoveryCanResume ? handleResumeGeneration : handleRefreshRecovery}
                disabled={submitting}
                className="ui-button ui-button-primary disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {recoveryCanResume ? 'Resume roadmap generation' : 'Check generation status'}
              </button>
            </div>
          )
        )}

        {/* Step 4: Confirmation */}
        {step === 'confirmation' && curriculum && (
          <CurriculumConfirmation
            topicId={topicId}
            curriculum={curriculum}
            onConfirm={handleConfirm}
            onTweak={handleTweak}
            onRegenerate={handleRegenerate}
            onBack={handleBack}
            submitting={submitting}
            error={error}
          />
        )}
      </main>
    </div>
  )
}
