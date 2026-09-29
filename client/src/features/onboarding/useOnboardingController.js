import { useCallback, useEffect, useRef, useState } from 'react'
import {
  confirmCurriculum, createTopic, generateCurriculum, getCurriculumRecovery, getSettings,
  getSetupQuestions, regenerateCurriculum, saveProfile,
  startPlacementAssessment, submitPlacementAssessment, tweakCurriculum,
  waitForCurriculumGeneration,
} from '../../api.js'
import { readCurriculumStream } from '../../curriculumStream.js'
import { normalizeSetupQuestions as normalizeQuestions } from '../../setupQuestions.js'
import { toPublicError } from '../../lib/publicError.js'

const STAGE_INDEX = { destination: 0, starting_point: 1, 'placement-choice': 1, placement: 1, learning_rhythm: 2, generating: 3, preview: 3 }
const GENERATION_STAGES = ['Reading your Trail', 'Balancing depth and breadth', 'Designing practice', 'Validating the Track']
const PACE_OPTIONS = [
  { value: 'steady', label: 'Steady pace', description: 'A sustainable rhythm with room to reflect.' },
  { value: 'balanced', label: 'Balanced pace', description: 'A mix of focused practice and breathing room.' },
  { value: 'focused', label: 'Focused pace', description: 'Move through each week with extra momentum.' },
]

function sanitizeTopic(name) {
  return name.replace(/<script[^>]*>.*?<\/script>/gi, '').replace(/<[^>]+>/g, '').trim()
}

function safeError(error, fallback) {
  return toPublicError(error, fallback).message
}

export function useOnboardingController({ navigate, recoveryTopicId = null }) {
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
  const [placementPhase, setPlacementPhase] = useState('')
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
    getSettings().then((settings) => {
      if (active) setLlmConfigured(Boolean(settings.ready ?? settings.apiKeySet))
    }).catch(() => { if (active) setLlmConfigured(false) })
    return () => { active = false }
  }, [])

  useEffect(() => () => {
    generationAbortRef.current?.abort()
    generationAbortRef.current = null
  }, [])

  const applyRecovery = useCallback((data, requestedTopicId) => {
    const topic = data.topic || {}
    setTopicId(topic.id || requestedTopicId)
    setTopicName(topic.title || '')
    setAnswers({ level: topic.level || 'Beginner', timeCommitment: topic.timeCommitment || '30 min/day' })
    setVerifiedProfile(topic.level ? { level: topic.level, selfReportedLevel: topic.level } : null)
    setRecoveryCanResume(Boolean(data.resumeAvailable))
    if (data.curriculumState === 'draft_ready' && data.curriculum) {
      setCurriculum(data.curriculum)
      setStep('preview')
    } else if (data.curriculumState === 'setup') setStep('starting_point')
    else if (data.generation && ['queued', 'running', 'retrying'].includes(data.generation.state)) {
      setGenerationStatus(data.generation)
      setRecoveryCanResume(false)
      setGenerationMode('auto')
      setStep('generating')
    } else {
      setGenerationMode('manual')
      setError(safeError(data.curriculumError ? new Error(data.curriculumError) : null, 'Track generation is still in progress. Check again shortly.'))
      setStep('generating')
    }
  }, [])

  const refreshRecovery = useCallback(async () => {
    if (!topicId) return
    setSubmitting(true)
    setError('')
    try {
      const data = await getCurriculumRecovery(topicId)
      applyRecovery(data, topicId)
    } catch (requestError) {
      setError(safeError(requestError, 'Could not refresh the saved Track status. Please retry.'))
    } finally { setSubmitting(false) }
  }, [applyRecovery, topicId])

  useEffect(() => {
    if (!recoveryTopicId) return undefined
    const requestedTopicId = Number(recoveryTopicId)
    if (!Number.isSafeInteger(requestedTopicId) || requestedTopicId <= 0) {
      setError('The saved Trail could not be opened. Choose it again from your dashboard.')
      setRecoveryLoading(false)
      return undefined
    }
    let active = true
    setError('')
    getCurriculumRecovery(requestedTopicId).then((data) => {
      if (!active) return
      applyRecovery(data, requestedTopicId)
      setRecoveryLoading(false)
    }).catch((requestError) => {
      if (!active) return
      setTopicId(requestedTopicId)
      setGenerationMode('manual')
      setRecoveryCanResume(true)
      setError(safeError(requestError, 'Could not load the saved Track. Please retry.'))
      setStep('generating')
      setRecoveryLoading(false)
    })
    return () => { active = false }
  }, [applyRecovery, recoveryTopicId])

  const selectedLevel = answers.level || questions[0]?.options?.[0]?.value || ''
  const selectedTime = answers.timeCommitment || ''
  const levelOptions = questions.find((question) => question.id === 'level')?.options || []
  const timeOptions = questions.find((question) => question.id === 'timeCommitment')?.options || []

  const loadQuestions = useCallback(async () => {
    if (!topicId) return
    setQuestionsLoading(true)
    setError('')
    try {
      const data = await getSetupQuestions(topicId)
      setQuestions(normalizeQuestions(data.questions))
    } catch (requestError) {
      setError(safeError(requestError, 'We could not load your starting choices. Please retry.'))
      setQuestions([])
    } finally { setQuestionsLoading(false) }
  }, [topicId])

  useEffect(() => {
    if (step === 'starting_point' && topicId && questions.length === 0 && !questionsLoading) loadQuestions()
  }, [loadQuestions, questions.length, questionsLoading, step, topicId])

  const submitDestination = useCallback(async () => {
    setError('')
    const trimmed = sanitizeTopic(topicName)
    if (!trimmed) { setError('Please enter a destination for your learning Trail.'); return }
    if (trimmed.length > 100) { setError('That destination is too long. Use 100 characters or fewer.'); return }
    setSubmitting(true)
    try {
      const result = await createTopic(trimmed)
      setTopicId(result.topic.id)
      setTopicName(trimmed)
      setQuestions([])
      setStep('starting_point')
    } catch (requestError) { setError(safeError(requestError, 'We could not create that Trail. Please try again.')) }
    finally { setSubmitting(false) }
  }, [topicName])

  const chooseStartingPoint = useCallback((level) => {
    setAnswers((current) => ({ ...current, level }))
    setVerifiedProfile(null)
    setPlacementResult(null)
    setError('')
  }, [])

  const continueStartingPoint = useCallback(() => { if (selectedLevel) setStep('placement-choice') }, [selectedLevel])
  const skipPlacement = useCallback(() => {
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
      if (!Number.isInteger(data.assessmentId) || !Array.isArray(data.questions) || data.questions.length === 0) throw new Error('Placement check unavailable')
      setPlacementAssessmentId(data.assessmentId)
      setPlacementQuestions(data.questions)
    } catch (requestError) { setError(safeError(requestError, 'The placement check could not be prepared. Please retry or skip it.')) }
    finally { setPlacementLoading(false); setPlacementPhase('') }
  }, [selectedLevel, topicId])

  const submitPlacement = useCallback(async () => {
    if (placementQuestions.some((question) => typeof placementAnswers[question.id] !== 'string' || !placementAnswers[question.id].trim())) {
      setError('Please answer every placement question.')
      return
    }
    setPlacementLoading(true)
    setPlacementPhase('evaluating')
    setError('')
    try { setPlacementResult(await submitPlacementAssessment(topicId, placementAssessmentId, placementAnswers)) }
    catch (requestError) { setError(safeError(requestError, 'The placement result could not be prepared. Your answers are still here; retry when ready.')) }
    finally { setPlacementLoading(false); setPlacementPhase('') }
  }, [placementAnswers, placementAssessmentId, placementQuestions, topicId])

  const continuePlacement = useCallback(() => {
    if (!placementResult) return
    setVerifiedProfile({ level: placementResult.recommendedLevel, selfReportedLevel: placementResult.requestedLevel || selectedLevel, placementAssessmentId: placementResult.assessmentId })
    setAnswers((current) => ({ ...current, level: placementResult.recommendedLevel }))
    setStep('learning_rhythm')
    setRhythmSubstep('time')
    setError('')
  }, [placementResult, selectedLevel])
  const continueRhythm = useCallback(() => { if (selectedTime) setRhythmSubstep('pace') }, [selectedTime])

  const submitRhythm = useCallback(async () => {
    const profile = verifiedProfile || (selectedLevel ? { level: selectedLevel, selfReportedLevel: selectedLevel } : null)
    if (!profile?.level || !selectedTime) { setError('Choose a starting point and daily study time to continue.'); return }
    setSubmitting(true)
    setError('')
    try {
      const payload = { level: profile.level, timeCommitment: selectedTime }
      if (profile.selfReportedLevel) payload.selfReportedLevel = profile.selfReportedLevel
      if (profile.placementAssessmentId) payload.placementAssessmentId = profile.placementAssessmentId
      await saveProfile(topicId, payload)
      setGenerationMode('auto')
      setStep('generating')
    } catch (requestError) { setError(safeError(requestError, 'Your learning rhythm could not be saved. Please retry.')) }
    finally { setSubmitting(false) }
  }, [selectedLevel, selectedTime, topicId, verifiedProfile])

  const prepareWait = useCallback(() => {
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

  const runGeneration = useCallback(async (regenerate = false) => {
    if (!topicId) return
    setGenerating(true)
    setError('')
    setGenerationStatus(null)
    if (regenerate) { setGenerationMode('manual'); setStep('generating') }
    const controller = prepareWait()
    try {
      const started = regenerate ? await regenerateCurriculum(topicId) : await generateCurriculum(topicId)
      if (controller.signal.aborted) return
      const generated = await waitForGeneration(started, controller)
      if (!controller.signal.aborted && generated) { setCurriculum(generated); setStep('preview') }
    } catch (requestError) {
      if (requestError?.name === 'AbortError') return
      setError(safeError(requestError, regenerate ? 'The Track could not be refreshed. Your current preview is still here.' : 'The Track could not be prepared. Your choices are saved; try again when ready.'))
      if (regenerate) setStep('preview')
      else setGenerationMode('manual')
    } finally {
      if (generationAbortRef.current === controller) generationAbortRef.current = null
      if (!controller.signal.aborted) setGenerating(false)
    }
  }, [prepareWait, topicId, waitForGeneration])
  const generate = useCallback(() => runGeneration(false), [runGeneration])
  const regenerate = useCallback(() => runGeneration(true), [runGeneration])

  useEffect(() => { if (step === 'generating' && generationMode === 'auto') generate() }, [generate, generationMode, step])
  const resume = useCallback(() => { setError(''); setGenerationMode('auto'); setStep('generating') }, [])

  const confirm = useCallback(async () => {
    setSubmitting(true)
    setError('')
    try { await confirmCurriculum(topicId, curriculum); navigate('/') }
    catch (requestError) { setError(safeError(requestError, 'Your Track could not be added to the Trail. Please retry.')) }
    finally { setSubmitting(false) }
  }, [curriculum, navigate, topicId])
  const tweak = useCallback(async () => {
    setSubmitting(true)
    setError('')
    try { setCurriculum(await tweakCurriculum(topicId, tweakDraft.trim())); setTweakDraft(''); setTweakOpen(false) }
    catch (requestError) { setError(safeError(requestError, 'The Track could not be adjusted. Your current preview is still here.')) }
    finally { setSubmitting(false) }
  }, [topicId, tweakDraft])
  const back = useCallback(() => {
    if (step === 'placement') setStep('placement-choice')
    else if (step === 'placement-choice') setStep('starting_point')
    else if (step === 'starting_point') setStep('destination')
    else if (step === 'learning_rhythm' && rhythmSubstep === 'pace') setRhythmSubstep('time')
    else if (step === 'learning_rhythm') setStep('starting_point')
    else if (step === 'preview') setStep('learning_rhythm')
  }, [rhythmSubstep, step])

  const activeQuestion = placementQuestions[placementQuestionIndex]
  const canAdvancePlacement = Boolean(activeQuestion && typeof placementAnswers[activeQuestion.id] === 'string' && placementAnswers[activeQuestion.id].trim())
  const stage = ['placement', 'placement-choice'].includes(step) ? 'starting_point' : ['generating', 'preview'].includes(step) ? 'preview' : step
  const substep = step === 'placement' ? 'placement' : step === 'placement-choice' ? 'placement-choice' : step === 'generating' ? 'generating' : step === 'preview' ? 'preview' : step === 'learning_rhythm' ? rhythmSubstep : null
  const model = {
    stage, stageIndex: STAGE_INDEX[step] ?? 0, stageCount: 4, substep, destination: topicName, levelOptions, selectedLevel,
    placement: { questions: placementQuestions, answers: placementAnswers, result: placementResult, loading: placementLoading, questionIndex: placementQuestionIndex, canAdvance: canAdvancePlacement, phase: placementPhase },
    timeOptions, selectedTime, paceOptions: PACE_OPTIONS, selectedPace: pace,
    generation: { running: generating, canResume: recoveryCanResume, status: generationStatus, stages: GENERATION_STAGES },
    preview: { curriculum, selectedChapterId: selectedChapterId || curriculum?.modules?.[0]?.id || (curriculum ? '0' : null), timeCommitment: selectedTime, pace: PACE_OPTIONS.find((option) => option.value === pace)?.label || 'Steady pace', tweakOpen, tweakDraft },
    error, busy: { submitting: submitting || generating, placement: placementLoading, questions: questionsLoading }, providerReady: llmConfigured,
  }
  model.actions = {
    setDestination: setTopicName, submitDestination,
    chooseLevel: chooseStartingPoint, retryChoices: loadQuestions, continueStartingPoint,
    takePlacement: startPlacement, skipPlacement,
    answerPlacement: (id, value) => setPlacementAnswers((current) => ({ ...current, [id]: value })),
    nextPlacementQuestion: () => { if (canAdvancePlacement) setPlacementQuestionIndex((index) => Math.min(index + 1, placementQuestions.length - 1)) },
    previousPlacementQuestion: () => setPlacementQuestionIndex((index) => Math.max(index - 1, 0)),
    submitPlacement, acceptPlacement: continuePlacement,
    chooseTime: (value) => setAnswers((current) => ({ ...current, timeCommitment: value })), continueRhythm,
    choosePace: setPace, submitRhythm, resume: recoveryCanResume ? resume : refreshRecovery, refreshRecovery,
    openSettings: () => navigate('/settings'), confirm,
    toggleTweak: () => setTweakOpen((open) => !open), selectChapter: setSelectedChapterId,
    setTweakDraft, tweak, regenerate, back,
  }
  return { model, actions: model.actions, recoveryLoading }
}
