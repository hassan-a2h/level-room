import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  confirmContinuation,
  generateContinuation,
  getContinuationReadiness,
  getDashboard,
  tweakContinuation,
} from '../api.js'
import { readCurriculumStream } from '../curriculumStream.js'
import AppHeader from '../components/AppHeader.jsx'
import { useThemeView, SceneSkeleton } from '../theme/ThemeProvider.jsx'

export default function ContinuationFlow() {
  const ContinuationView = useThemeView('ContinuationView')
  const { topicId } = useParams()
  const navigate = useNavigate()
  const requestRef = useRef(0)
  const curriculumRef = useRef(null)
  const [readiness, setReadiness] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [curriculum, setCurriculum] = useState(null)
  const [draftProfile, setDraftProfile] = useState(null)
  const [level, setLevel] = useState('Intermediate')
  const [timeCommitment, setTimeCommitment] = useState('30 min/day')
  const [phase, setPhase] = useState('loading')
  const [working, setWorking] = useState(false)
  const [adjusting, setAdjusting] = useState(false)
  const [adjustment, setAdjustment] = useState('')
  const [selectedChapterId, setSelectedChapterId] = useState(null)
  const [error, setError] = useState('')

  const generateDraft = useCallback(async (profile, sequence, keepPreview = false) => {
    const priorDraft = curriculumRef.current
    setWorking(true)
    setError('')
    setPhase('generating')
    try {
      const response = await generateContinuation(topicId, profile)
      const draft = await readCurriculumStream(response)
      if (requestRef.current !== sequence) return
      curriculumRef.current = draft
      setCurriculum(draft)
      setSelectedChapterId(draft.modules?.[0]?.id ?? '0')
      setDraftProfile(profile)
      setPhase('preview')
    } catch (generationError) {
      if (requestRef.current !== sequence) return
      setError(generationError.message || 'The next Track could not be prepared. Please try again.')
      setPhase(keepPreview && priorDraft ? 'preview' : 'error')
    } finally {
      if (requestRef.current === sequence) setWorking(false)
    }
  }, [topicId])

  const loadCompletion = useCallback(async () => {
    const sequence = ++requestRef.current
    setPhase('loading')
    setError('')
    curriculumRef.current = null
    setCurriculum(null)
    setDraftProfile(null)
    try {
      const completion = await getContinuationReadiness(topicId)
      if (requestRef.current !== sequence) return
      setReadiness(completion)
      if (completion.course?.level) setLevel(completion.course.level)
      if (completion.course?.time_per_week) setTimeCommitment(completion.course.time_per_week)
      if (!completion.eligible) {
        setPhase('ineligible')
        return
      }
      const track = await getDashboard(topicId)
      if (requestRef.current !== sequence) return
      setDashboard(track)
      await generateDraft({
        level: completion.course?.level || 'Intermediate',
        timeCommitment: completion.course?.time_per_week || '30 min/day',
      }, sequence)
    } catch (loadError) {
      if (requestRef.current !== sequence) return
      setError(loadError.message || 'Could not load your completed Track.')
      setPhase('error')
    }
  }, [generateDraft, topicId])

  useEffect(() => {
    loadCompletion()
    return () => { requestRef.current += 1 }
  }, [loadCompletion])

  const handleGenerate = useCallback(() => {
    const sequence = ++requestRef.current
    generateDraft({ level, timeCommitment }, sequence, true)
  }, [generateDraft, level, timeCommitment])

  const handleTweak = useCallback(async () => {
    if (!curriculum || !adjustment.trim()) return
    setWorking(true)
    setError('')
    try {
      const result = await tweakContinuation(topicId, { level, timeCommitment, curriculum, request: adjustment.trim() })
      if (!result?.curriculum) throw new Error('The revised Track draft was incomplete.')
      curriculumRef.current = result.curriculum
      setCurriculum(result.curriculum)
      setSelectedChapterId(result.curriculum.modules?.[0]?.id ?? '0')
      setDraftProfile({ level, timeCommitment })
      setAdjustment('')
      setAdjusting(false)
    } catch (tweakError) {
      setError(tweakError.message || 'The plan could not be adjusted. Your current preview is still here.')
    } finally {
      setWorking(false)
    }
  }, [adjustment, curriculum, level, timeCommitment, topicId])

  const handleConfirm = useCallback(async () => {
    if (!curriculum) return
    setWorking(true)
    setError('')
    try {
      const result = await confirmContinuation(topicId, { level, timeCommitment, curriculum })
      if (!result?.topic?.id) throw new Error('The new Track was not returned by the server.')
      const destination = typeof result.dashboardPath === 'string' && /^\/\?topicId=\d+$/.test(result.dashboardPath)
        ? result.dashboardPath
        : `/?topicId=${result.topic.id}`
      navigate(destination)
    } catch (confirmError) {
      setError(confirmError.message || 'The Track could not be added. Your preview is still here.')
    } finally {
      setWorking(false)
    }
  }, [curriculum, level, navigate, timeCommitment, topicId])

  const goToParent = useCallback(() => navigate(`/?topicId=${encodeURIComponent(topicId)}`), [navigate, topicId])

  const profileStale = Boolean(draftProfile && (draftProfile.level !== level || draftProfile.timeCommitment !== timeCommitment))
  const model = {
    phase,
    parentTrack: { readiness, dashboard },
    readiness: readiness || {},
    level,
    timeCommitment,
    profileStale,
    preview: curriculum,
    selectedChapterId,
    adjustmentDraft: adjustment,
    adjustmentOpen: adjusting,
    busy: { working },
    error,
    actions: {
      selectChapter: setSelectedChapterId,
      setLevel,
      setTimeCommitment,
      confirm: handleConfirm,
      toggleAdjustment: () => { setAdjusting((open) => !open); setError('') },
      setAdjustmentDraft: setAdjustment,
      applyAdjustment: handleTweak,
      refresh: handleGenerate,
      retry: dashboard ? handleGenerate : loadCompletion,
      defer: goToParent,
      review: () => navigate('/reviews'),
    },
  }

  return (
    <div className="ui-page min-h-screen">
      <AppHeader />
      <div className="ui-container mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8"><Suspense fallback={<SceneSkeleton />}><ContinuationView model={model} /></Suspense></div>
    </div>
  )
}
