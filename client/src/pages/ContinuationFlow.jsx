import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import CurriculumConfirmation from './CurriculumConfirmation.jsx'
import { readCurriculumStream } from '../curriculumStream.js'
import {
  confirmContinuation,
  generateContinuation,
  getContinuationOptions,
  getContinuationReadiness,
  tweakContinuation,
} from '../api.js'

const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const TIME_COMMITMENTS = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day']

function courseLabel(course) {
  if (!course) return 'Course'
  const stage = Number(course.course_stage || 0)
  return stage > 0 ? `Advanced · Stage ${stage}` : 'Core · 80/20 foundation'
}

function Lineage({ lineage = [] }) {
  if (lineage.length < 2) return null
  return (
    <div className="ui-surface ui-surface-inset p-4" aria-label="Course lineage">
      <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide mb-2">What this builds on</p>
      <ol className="flex flex-wrap items-center gap-2 text-sm ui-text-secondary">
        {lineage.map((course, index) => (
          <li key={course.id} className="flex items-center gap-2">
            {index > 0 && <span aria-hidden="true">→</span>}
            <span className={index === lineage.length - 1 ? 'font-semibold ui-text' : ''}>
              {course.title} {course.course_stage > 0 ? `(Stage ${course.course_stage})` : '(Core)'}
            </span>
          </li>
        ))}
      </ol>
    </div>
  )
}

function ProfileControls({ level, timeCommitment, onLevelChange, onTimeChange, disabled }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <label className="ui-field-label">
        Learner level
        <select className="ui-field mt-1 w-full" value={level} onChange={(event) => onLevelChange(event.target.value)} disabled={disabled}>
          {LEVELS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
      <label className="ui-field-label">
        Time commitment
        <select className="ui-field mt-1 w-full" value={timeCommitment} onChange={(event) => onTimeChange(event.target.value)} disabled={disabled}>
          {TIME_COMMITMENTS.map((value) => <option key={value} value={value}>{value}</option>)}
        </select>
      </label>
    </div>
  )
}

function LaneOption({ option, selected, onSelect, disabled }) {
  return (
    <button
      type="button"
      className={`ui-surface ui-surface-raised w-full p-4 text-left transition-shadow ${selected ? 'ui-choice is-selected' : ''}`}
      onClick={() => onSelect(option)}
      disabled={disabled}
      aria-pressed={selected}
    >
      <span className="flex items-start justify-between gap-3">
        <span className="font-semibold ui-text">{option.title}</span>
        {selected && <span aria-hidden="true" className="ui-text-link">✓</span>}
      </span>
      <span className="mt-1 block text-sm ui-text-secondary">{option.rationale}</span>
      <span className="mt-3 block text-xs ui-text-muted">Builds on: {option.builds_on.join(', ')}</span>
      <span className="mt-1 block text-xs ui-text-muted">Outcome: {option.target_outcomes.join(' · ')}</span>
      <span className="mt-2 block text-xs ui-text-muted">Free path: {option.free_stack.primary.description} Fallback: {option.free_stack.fallback.description}</span>
    </button>
  )
}

export default function ContinuationFlow() {
  const { topicId } = useParams()
  const navigate = useNavigate()
  const [readiness, setReadiness] = useState(null)
  const [options, setOptions] = useState([])
  const [optionsLoading, setOptionsLoading] = useState(false)
  const [optionsError, setOptionsError] = useState('')
  const [selectedOption, setSelectedOption] = useState(null)
  const [customLane, setCustomLane] = useState('')
  const [level, setLevel] = useState('Intermediate')
  const [timeCommitment, setTimeCommitment] = useState('30 min/day')
  const [curriculum, setCurriculum] = useState(null)
  const [step, setStep] = useState('choose')
  const [loading, setLoading] = useState(true)
  const [working, setWorking] = useState(false)
  const [error, setError] = useState('')

  const lane = useMemo(() => customLane.trim() || selectedOption?.title || '', [customLane, selectedOption])

  const loadOptions = useCallback(async (isActive = () => true) => {
    setOptionsLoading(true)
    setOptionsError('')
    try {
      const suggestions = await getContinuationOptions(topicId)
      if (isActive()) setOptions(suggestions.options || [])
    } catch (err) {
      if (isActive()) setOptionsError(err.message || 'Could not load lane suggestions.')
    } finally {
      if (isActive()) setOptionsLoading(false)
    }
  }, [topicId])

  useEffect(() => {
    let cancelled = false
    async function load() {
      setLoading(true)
      setError('')
      try {
        const data = await getContinuationReadiness(topicId)
        if (cancelled) return
        setReadiness(data)
        if (data.course?.level) setLevel(data.course.level)
        if (data.course?.time_per_week) setTimeCommitment(data.course.time_per_week)
        if (!data.eligible) return
        if (data.eligible) await loadOptions(() => !cancelled)
      } catch (err) {
        if (!cancelled) setError(err.message || 'Could not load continuation choices.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [loadOptions, topicId])

  const handleGenerate = useCallback(async () => {
    if (!lane) {
      setError('Choose a suggested lane or name a specialization lane.')
      return
    }
    setWorking(true)
    setError('')
    setStep('generating')
    const previousCurriculum = curriculum
    try {
      const response = await generateContinuation(topicId, { lane, level, timeCommitment })
      const draft = await readCurriculumStream(response)
      setCurriculum(draft)
      setStep('review')
    } catch (err) {
      setError(err.message || 'Failed to generate the advanced course.')
      setStep(previousCurriculum ? 'review' : 'choose')
    } finally {
      setWorking(false)
    }
  }, [curriculum, lane, level, timeCommitment, topicId])

  const handleTweak = useCallback(async (request) => {
    setWorking(true)
    setError('')
    try {
      const result = await tweakContinuation(topicId, { lane, level, timeCommitment, curriculum, request })
      if (!result?.curriculum) throw new Error('The revised course draft was incomplete.')
      setCurriculum(result.curriculum)
    } catch (err) {
      setError(err.message || 'Failed to revise the draft.')
    } finally {
      setWorking(false)
    }
  }, [curriculum, lane, level, timeCommitment, topicId])

  const handleRegenerate = useCallback(() => {
    handleGenerate()
  }, [handleGenerate])

  const handleConfirm = useCallback(async () => {
    setWorking(true)
    setError('')
    try {
      const result = await confirmContinuation(topicId, { lane, level, timeCommitment, curriculum })
      if (!result?.topic?.id || !result?.firstLessonId) throw new Error('The new course was created without a starting lesson.')
      navigate(`/topic/${result.topic.id}/lesson/${result.firstLessonId}`)
    } catch (err) {
      setError(err.message || 'Failed to start the advanced course.')
    } finally {
      setWorking(false)
    }
  }, [curriculum, lane, level, timeCommitment, topicId, navigate])

  if (loading) {
    return <div className="ui-page min-h-screen"><AppHeader /><main className="ui-container max-w-3xl px-4 py-10"><div className="ui-spinner mx-auto" role="status" aria-label="Loading continuation choices" /></main></div>
  }

  if (error && !readiness) {
    return <div className="ui-page min-h-screen"><AppHeader /><main className="ui-container max-w-3xl px-4 py-10"><div className="ui-alert ui-alert-danger" role="alert">{error}</div><button type="button" className="ui-button ui-button-secondary mt-4" onClick={() => navigate('/')}>Back to Dashboard</button></main></div>
  }

  if (!readiness?.eligible) {
    return (
      <div className="ui-page min-h-screen">
        <AppHeader />
        <main className="ui-container max-w-3xl px-4 py-8">
          <div className="ui-panel p-6 sm:p-8">
            <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">{courseLabel(readiness?.course)}</p>
            <h1 className="mt-2 text-2xl font-bold ui-text">Finish this course before going deeper</h1>
            <p className="mt-3 ui-text-secondary">{readiness?.reason || 'Complete every module checkpoint to unlock an advanced lane.'}</p>
            <button type="button" className="ui-button ui-button-primary mt-6" onClick={() => navigate('/')}>Back to Dashboard</button>
          </div>
        </main>
      </div>
    )
  }

  return (
    <div className="ui-page min-h-screen">
      <AppHeader />
      <main className="ui-container max-w-4xl px-4 py-6 sm:py-8">
        {step === 'choose' && (
          <div className="space-y-6">
            <div>
              <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">{courseLabel(readiness.course)}</p>
              <h1 className="mt-2 text-3xl font-bold ui-text">Choose your next specialization</h1>
              <p className="mt-2 ui-text-secondary">{readiness.course.title} is complete. Start a separate finite course that deepens one lane while preserving everything you have already learned.</p>
            </div>
            <Lineage lineage={readiness.lineage} />
            <section className="space-y-3" aria-labelledby="lane-options-heading">
              <h2 id="lane-options-heading" className="text-lg font-semibold ui-text">Suggested lanes</h2>
              {optionsError && (
                <div className="ui-alert ui-alert-warning flex flex-wrap items-center justify-between gap-3" role="alert">
                  <span>{optionsError}</span>
                  <button type="button" className="ui-button ui-button-secondary min-h-0 px-3 py-1.5 text-sm" onClick={() => loadOptions()} disabled={optionsLoading}>{optionsLoading ? 'Retrying...' : 'Retry suggestions'}</button>
                </div>
              )}
              {options.length > 0 ? options.map((option) => <LaneOption key={option.id} option={option} selected={selectedOption?.id === option.id && !customLane} onSelect={(value) => { setSelectedOption(value); setCustomLane(''); setError('') }} disabled={working} />) : <p className="ui-text-muted">No suggestions are available yet. You can name your own lane below.</p>}
            </section>
            <section className="ui-panel p-4 sm:p-5 space-y-4" aria-labelledby="custom-lane-heading">
              <div>
                <h2 id="custom-lane-heading" className="text-lg font-semibold ui-text">Or name a lane</h2>
                <p className="text-sm ui-text-muted mt-1">Use a short specialization such as “Kubernetes security” or “incident response”.</p>
              </div>
              <label className="ui-field-label" htmlFor="custom-lane">Specialization lane</label>
              <input id="custom-lane" className="ui-field w-full" value={customLane} maxLength={100} onChange={(event) => { setCustomLane(event.target.value); setSelectedOption(null); setError('') }} placeholder="e.g. Kubernetes security" disabled={working} />
              <ProfileControls level={level} timeCommitment={timeCommitment} onLevelChange={setLevel} onTimeChange={setTimeCommitment} disabled={working} />
              {error && <div className="ui-alert ui-alert-danger" role="alert">{error}</div>}
              <div className="flex flex-wrap gap-3 pt-2">
                <button type="button" className="ui-button ui-button-primary" onClick={handleGenerate} disabled={working || !lane}>{working ? 'Preparing...' : 'Generate advanced course'}</button>
                <button type="button" className="ui-button ui-button-secondary" onClick={() => navigate('/')}>Cancel</button>
              </div>
            </section>
          </div>
        )}

        {step === 'generating' && (
          <div className="ui-panel p-8 text-center">
            <div className="ui-spinner mx-auto mb-4" role="status" aria-label="Generating advanced course" />
            <h1 className="text-xl font-bold ui-text">Designing {lane}</h1>
            <p className="mt-2 ui-text-secondary">Using your completed outcomes, strengths, and gaps to shape a finite practical course.</p>
          </div>
        )}

        {step === 'review' && curriculum && (
          <div className="space-y-4">
            <div className="ui-panel p-4 sm:p-5">
              <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Advanced lane · Stage {(readiness.course.course_stage || 0) + 1}</p>
              <h1 className="mt-1 text-2xl font-bold ui-text">Review {lane}</h1>
              <p className="mt-2 text-sm ui-text-secondary">This draft is temporary. Confirm only when the modules and hands-on tasks fit your goal.</p>
              <ProfileControls level={level} timeCommitment={timeCommitment} onLevelChange={setLevel} onTimeChange={setTimeCommitment} disabled={working} />
            </div>
            <CurriculumConfirmation curriculum={curriculum} onConfirm={handleConfirm} onTweak={handleTweak} onRegenerate={handleRegenerate} onBack={() => { setStep('choose'); setError('') }} submitting={working} error={error} />
          </div>
        )}
      </main>
    </div>
  )
}
