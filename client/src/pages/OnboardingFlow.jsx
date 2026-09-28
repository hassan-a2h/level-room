import { Suspense, useState, useEffect, useCallback, useRef } from 'react'
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
  waitForCurriculumGeneration,
} from '../api.js'
import { readCurriculumStream } from '../curriculumStream.js'
import { normalizeSetupQuestions } from '../setupQuestions.js'
import { SkeletonOnboarding } from '../components/Skeleton.jsx'
import AppHeader from '../components/AppHeader.jsx'
import { useThemeView, SceneSkeleton } from '../theme/ThemeProvider.jsx'

const STEP_INDEX = {
  destination: 0,
  starting_point: 1,
  'placement-choice': 1,
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
  const OnboardingView = useThemeView('OnboardingView')
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
  const [placementQuestionIndex, setPlacementQuestionIndex] = useState(0)
  const [placementResult, setPlacementResult] = useState(null)
  const [placementLoading, setPlacementLoading] = useState(false)
  const [, setPlacementPhase] = useState('')
  const [generating, setGenerating] = useState(false)
  const [curriculum, setCurriculum] = useState(null)
  const [selectedChapterId, setSelectedChapterId] = useState(null)
  const [llmConfigured, setLlmConfigured] = useState(true)
  const [generationMode, setGenerationMode] = useState('auto')
  const [recoveryCanResume, setRecoveryCanResume] = useState(true)
  const [generationStatus, setGenerationStatus] = useState(null)
  const [rhythmSubstep, setRhythmSubstep] = useState('time')
  const [tweakOpen, setTweakOpen] = useState(false)
  const [tweakDraft, setTweakDraft] = useState('')
  const generationAbortRef = useRef(null)

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

  useEffect(() => () => {
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
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
        } else if (data.generation && ['queued', 'running', 'retrying'].includes(data.generation.state)) {
          setGenerationStatus(data.generation)
          setRecoveryCanResume(false)
          setGenerationMode('auto')
          setStep('generating')
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

  const continueStartingPoint = useCallback(() => {
    if (selectedLevel) setStep('placement-choice')
  }, [selectedLevel])

  const handleSkipPlacement = useCallback(() => {
    if (!selectedLevel) return
    setVerifiedProfile({ level: selectedLevel, selfReportedLevel: selectedLevel })
    setStep('learning_rhythm')
    setRhythmSubstep('time')
    setError('')
  }, [selectedLevel])

  const startPlacement = useCallback(async () => {
    if (!topicId || !selectedLevel) return
    setPlacementLoading(true)
    setPlacementPhase('starting')
    setPlacementResult(null)
    setPlacementQuestions([])
    setPlacementAnswers({})
    setPlacementQuestionIndex(0)
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

  const handleNextPlacementQuestion = useCallback(() => {
    const question = placementQuestions[placementQuestionIndex]
    if (!question || typeof placementAnswers[question.id] !== 'string' || !placementAnswers[question.id].trim()) return
    setPlacementQuestionIndex((index) => Math.min(index + 1, placementQuestions.length - 1))
  }, [placementAnswers, placementQuestionIndex, placementQuestions])

  const handlePreviousPlacementQuestion = useCallback(() => {
    setPlacementQuestionIndex((index) => Math.max(0, index - 1))
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
    setRhythmSubstep('time')
    setError('')
  }, [placementResult, selectedLevel])

  const continueRhythm = useCallback(() => {
    if (selectedTime) setRhythmSubstep('pace')
  }, [selectedTime])

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

  const prepareGenerationWait = useCallback(() => {
    generationAbortRef.current?.abort()
    const controller = new AbortController()
    generationAbortRef.current = controller
    return controller
  }, [])

  const waitForGeneration = useCallback(async (started, controller) => {
    if (controller.signal.aborted) return null
    if (started?.generation) {
      setGenerationStatus(started.generation)
      return waitForCurriculumGeneration(topicId, started.generation, setGenerationStatus, { signal: controller.signal })
    }
    if (started?.body) return readCurriculumStream(started)
    return started
  }, [topicId])

  const handleGenerate = useCallback(async () => {
    if (!topicId) return
    setGenerating(true)
    setError('')
    setGenerationStatus(null)
    const controller = prepareGenerationWait()
    try {
      const started = await generateCurriculum(topicId)
      if (controller.signal.aborted) return
      const generated = await waitForGeneration(started, controller)
      if (!controller.signal.aborted && generated) {
        setCurriculum(generated)
        setStep('preview')
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      setError(safeError(err, 'The Track could not be prepared. Your choices are saved; try again when ready.'))
      setGenerationMode('manual')
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null
      if (!controller.signal.aborted) setGenerating(false)
    }
  }, [topicId, prepareGenerationWait, waitForGeneration])

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
      setGenerationStatus(data.generation || null)
      if (data.curriculumState === 'draft_ready' && data.curriculum) {
        setCurriculum(data.curriculum)
        setStep('preview')
      } else if (data.curriculumState === 'setup') {
        setStep('starting_point')
      } else if (data.generation && ['queued', 'running', 'retrying'].includes(data.generation.state)) {
        setRecoveryCanResume(false)
        setGenerationMode('auto')
        setStep('generating')
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
      setTweakDraft('')
      setTweakOpen(false)
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
    const controller = prepareGenerationWait()
    try {
      const started = await regenerateCurriculum(topicId)
      if (controller.signal.aborted) return
      const generated = await waitForGeneration(started, controller)
      if (!controller.signal.aborted && generated) {
        setCurriculum(generated)
        setStep('preview')
      }
    } catch (err) {
      if (err?.name === 'AbortError') return
      setError(safeError(err, 'The Track could not be refreshed. Your current preview is still here.'))
      setStep('preview')
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null
      if (!controller.signal.aborted) setGenerating(false)
    }
  }, [topicId, prepareGenerationWait, waitForGeneration])

  const handleBack = useCallback(() => {
    if (step === 'placement-choice') setStep('starting_point')
    else if (step === 'starting_point' || step === 'placement') setStep('destination')
    else if (step === 'learning_rhythm' && rhythmSubstep === 'pace') setRhythmSubstep('time')
    else if (step === 'learning_rhythm') setStep('starting_point')
    else if (step === 'preview') setStep('learning_rhythm')
  }, [step, rhythmSubstep])

  if (recoveryLoading) return <SkeletonOnboarding />

  const currentStage = STEP_INDEX[step] ?? 0
  const activePlacementQuestion = placementQuestions[placementQuestionIndex]
  const placementCanAdvance = Boolean(activePlacementQuestion && typeof placementAnswers[activePlacementQuestion.id] === 'string' && placementAnswers[activePlacementQuestion.id].trim())
  const stage = ['placement', 'placement-choice'].includes(step) ? 'starting_point' : ['generating', 'preview'].includes(step) ? 'preview' : step
  const substep = step === 'placement' ? 'placement' : step === 'placement-choice' ? 'placement-choice' : step === 'generating' ? 'generating' : step === 'preview' ? 'preview' : step === 'learning_rhythm' ? rhythmSubstep : null
  const model = {
    stage,
    stageIndex: currentStage,
    stageCount: 4,
    substep,
    destination: topicName,
    levelOptions,
    selectedLevel,
    placement: {
      questions: placementQuestions,
      answers: placementAnswers,
      result: placementResult,
      loading: placementLoading,
      questionIndex: placementQuestionIndex,
      canAdvance: placementCanAdvance,
    },
    timeOptions,
    selectedTime,
    paceOptions: PACE_OPTIONS,
    selectedPace: pace,
    generation: {
      running: generating,
      canResume: recoveryCanResume,
      status: generationStatus,
      stages: GENERATION_STAGES,
    },
    preview: { curriculum, selectedChapterId: selectedChapterId || curriculum?.modules?.[0]?.id || (curriculum ? '0' : null), timeCommitment: selectedTime, pace: PACE_OPTIONS.find((option) => option.value === pace)?.label || 'Steady pace', tweakOpen, tweakDraft },
    error,
    busy: { submitting: submitting || generating, placement: placementLoading, questions: questionsLoading },
    providerReady: llmConfigured,
    actions: {
      setDestination: setTopicName,
      submitDestination: () => handleTopicSubmit({ preventDefault() {} }),
      chooseLevel: chooseStartingPoint,
      retryChoices: loadQuestions,
      continueStartingPoint,
      takePlacement: startPlacement,
      skipPlacement: handleSkipPlacement,
      answerPlacement: handlePlacementAnswerChange,
      nextPlacementQuestion: handleNextPlacementQuestion,
      previousPlacementQuestion: handlePreviousPlacementQuestion,
      submitPlacement: handlePlacementSubmit,
      acceptPlacement: handlePlacementContinue,
      chooseTime: (timeCommitment) => setAnswers((current) => ({ ...current, timeCommitment })),
      continueRhythm,
      choosePace: setPace,
      submitRhythm: handleProfileSubmit,
      resume: recoveryCanResume ? handleResumeGeneration : handleRefreshRecovery,
      refreshRecovery: handleRefreshRecovery,
      openSettings: () => navigate('/settings'),
      confirm: handleConfirm,
      toggleTweak: () => setTweakOpen((open) => !open),
      selectChapter: setSelectedChapterId,
      setTweakDraft,
      tweak: () => handleTweak(tweakDraft.trim()),
      regenerate: handleRegenerate,
      back: handleBack,
    },
  }

  return (
    <div className="ui-page ui-onboarding-page min-h-screen">
      <AppHeader />
      <div className="ui-container ui-onboarding-container mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <Suspense fallback={<SceneSkeleton />}><OnboardingView model={model} /></Suspense>
      </div>
    </div>
  )
}
