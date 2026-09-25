import { useCallback, useEffect, useRef, useState } from 'react'
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

const LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const TIME_COMMITMENTS = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day']
const GENERATION_STAGES = [
  'Reading your Trail',
  'Balancing depth and breadth',
  'Designing practical sessions',
  'Validating the plan',
]

function displayOutcome(outcome) {
  return typeof outcome === 'string' ? outcome : outcome?.title || ''
}

function uniqueOutcomes(dashboard, summary) {
  const outcomes = Array.isArray(summary?.outcomes) ? summary.outcomes : []
  if (outcomes.length) return outcomes
  const seen = new Set()
  return (dashboard?.modules || []).flatMap((module) => module.skill_outcomes || []).filter((outcome) => {
    if (!outcome?.id || seen.has(outcome.id)) return false
    seen.add(outcome.id)
    return true
  })
}

function CompletionSummary({ readiness, dashboard, onReview }) {
  const chapters = dashboard?.modules || []
  const outcomes = uniqueOutcomes(dashboard, readiness?.summary)
  const builds = chapters.flatMap((chapter) => (chapter.lessons || [])
    .filter((session) => session.artifact_required)
    .map((session) => ({ ...session, chapterTitle: chapter.title })))
  const strengths = readiness?.summary?.strengths || []
  const focusAreas = readiness?.summary?.gaps || []

  return (
    <section className="ui-panel p-5 sm:p-7" aria-labelledby="track-complete-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Track complete</p>
          <h1 id="track-complete-heading" className="mt-2 text-2xl sm:text-3xl font-bold ui-text">Your Track is complete</h1>
          <p className="mt-2 max-w-2xl ui-text-secondary">
            {readiness?.course?.title || 'This Track'} is a finished chapter in your learning. Your progress stays on your Trail while the next plan takes shape.
          </p>
        </div>
        <button type="button" className="ui-button ui-button-secondary shrink-0" onClick={onReview}>
          Review this Track
        </button>
      </div>

      <div className="mt-6 grid gap-5 sm:grid-cols-2">
        <section aria-labelledby="completed-chapters-heading">
          <h2 id="completed-chapters-heading" className="text-sm font-semibold ui-text">Chapters</h2>
          {chapters.length ? (
            <ol className="mt-2 space-y-2">
              {chapters.map((chapter, index) => (
                <li key={chapter.id ?? chapter.title} className="flex gap-3 text-sm ui-text-secondary">
                  <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold" style={{ backgroundColor: 'var(--ui-success-bg)', color: 'var(--ui-success-text)' }} aria-hidden="true">{index + 1}</span>
                  <span>{chapter.title}</span>
                </li>
              ))}
            </ol>
          ) : <p className="mt-2 text-sm ui-text-muted">Your completed Chapters are saved on this Track.</p>}
        </section>

        <section aria-labelledby="completed-outcomes-heading">
          <h2 id="completed-outcomes-heading" className="text-sm font-semibold ui-text">Outcomes practiced</h2>
          {outcomes.length ? (
            <ul className="mt-2 space-y-2">
              {outcomes.slice(0, 8).map((outcome, index) => <li key={outcome?.id || `${displayOutcome(outcome)}-${index}`} className="text-sm ui-text-secondary">{displayOutcome(outcome)}</li>)}
            </ul>
          ) : <p className="mt-2 text-sm ui-text-muted">Your outcomes will appear here as your Trail grows.</p>}
        </section>

        <section aria-labelledby="completed-builds-heading">
          <h2 id="completed-builds-heading" className="text-sm font-semibold ui-text">Builds completed <span className="ui-text-muted">({builds.length})</span></h2>
          {builds.length ? (
            <ul className="mt-2 space-y-2">
              {builds.slice(0, 8).map((build) => <li key={build.id ?? build.title} className="text-sm ui-text-secondary">{build.title}<span className="ui-text-muted"> · {build.chapterTitle}</span></li>)}
            </ul>
          ) : <p className="mt-2 text-sm ui-text-muted">You have completed the practical work in this Track.</p>}
        </section>

        <div className="space-y-4">
          {strengths.length > 0 && (
            <section aria-labelledby="strengths-heading">
              <h2 id="strengths-heading" className="text-sm font-semibold ui-text">Strengths to build on</h2>
              <ul className="mt-2 space-y-1 text-sm ui-text-secondary">
                {strengths.slice(0, 4).map((strength, index) => <li key={strength?.id || `${displayOutcome(strength)}-${index}`}>{displayOutcome(strength)}</li>)}
              </ul>
            </section>
          )}
          {focusAreas.length > 0 && (
            <section aria-labelledby="focus-areas-heading">
              <h2 id="focus-areas-heading" className="text-sm font-semibold ui-text">Focus areas to carry forward</h2>
              <ul className="mt-2 space-y-1 text-sm ui-text-secondary">
                {focusAreas.slice(0, 4).map((area, index) => <li key={`${area}-${index}`}>{area}</li>)}
              </ul>
            </section>
          )}
        </div>
      </div>
    </section>
  )
}

function ProfileControls({ level, timeCommitment, onLevelChange, onTimeChange, disabled }) {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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

function GeneratingState() {
  return (
    <section className="ui-panel p-6 sm:p-8" aria-labelledby="generating-heading">
      <div className="flex items-center gap-3">
        <span className="ui-spinner" role="status" aria-label="Preparing your next Track" />
        <div>
          <h2 id="generating-heading" className="text-lg font-semibold ui-text">Designing your next Track</h2>
          <p className="text-sm ui-text-secondary" aria-live="polite">A thoughtful plan is taking shape from what you have learned.</p>
        </div>
      </div>
      <ol className="mt-5 grid gap-2 text-sm ui-text-secondary sm:grid-cols-2" aria-label="Plan design stages">
        {GENERATION_STAGES.map((stage, index) => <li key={stage} className="ui-surface ui-surface-inset p-3"><span className="ui-text-muted mr-2">{index + 1}.</span>{stage}</li>)}
      </ol>
    </section>
  )
}

function OutcomeTag({ outcome }) {
  const breadth = outcome?.role === 'breadth'
  return (
    <li className="flex items-center justify-between gap-2 text-sm ui-text-secondary" data-outcome-role={outcome?.role || 'core'}>
      <span>{displayOutcome(outcome)}</span>
      {breadth && <span className="ui-status ui-status-neutral">Breadth</span>}
    </li>
  )
}

function ContinuationPreview({ curriculum, readiness, level, timeCommitment, profileStale, onLevelChange, onTimeChange, onRefresh, onTweak, onConfirm, onDefer, onReview, working, error }) {
  const lessons = (curriculum.modules || []).flatMap((chapter) => chapter.lessons || [])
  const totalMinutes = lessons.reduce((total, lesson) => total + (Number.isInteger(lesson.estimated_time) ? lesson.estimated_time : 0), 0)
  const priorOutcomes = uniqueOutcomes(null, readiness?.summary)

  return (
    <section className="ui-panel p-5 sm:p-7" aria-labelledby="continuation-preview-heading">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Your next finite Track</p>
          <h2 id="continuation-preview-heading" className="mt-2 text-2xl font-bold ui-text">{curriculum.title || 'Your next Track'}</h2>
          <p className="mt-2 max-w-2xl ui-text-secondary">About 80% core learning and 20% breadth: keep building the skills that matter while exploring useful neighboring ideas.</p>
        </div>
        <button type="button" className="ui-button ui-button-secondary shrink-0" onClick={onReview} disabled={working}>Review this Track</button>
      </div>

      {priorOutcomes.length > 0 && (
        <section className="ui-surface ui-surface-inset mt-5 p-4" aria-labelledby="builds-on-heading">
          <h3 id="builds-on-heading" className="text-sm font-semibold ui-text">Builds on what you already know</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {priorOutcomes.slice(0, 8).map((outcome, index) => <li className="ui-status ui-status-neutral" key={outcome?.id || `${displayOutcome(outcome)}-${index}`}>{displayOutcome(outcome)}</li>)}
          </ul>
        </section>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        {curriculum.modules.map((chapter, index) => {
          const builds = (chapter.lessons || []).filter((lesson) => lesson.artifact_required)
          const outcomes = chapter.skill_outcomes || []
          return (
            <article className="ui-surface ui-surface-raised p-4" key={`${chapter.title}-${index}`}>
              <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">Chapter {index + 1}</p>
              <h3 className="mt-1 font-semibold ui-text">{chapter.title}</h3>
              {chapter.summary && <p className="mt-1 text-sm ui-text-secondary">{chapter.summary}</p>}
              <ul className="mt-3 space-y-2">
                {outcomes.map((outcome) => <OutcomeTag key={outcome.id} outcome={outcome} />)}
              </ul>
              <p className="mt-3 text-xs ui-text-muted">{(chapter.lessons || []).length} Sessions · {builds.length} practical Build{builds.length === 1 ? '' : 's'}</p>
              {builds.length > 0 && <p className="mt-1 text-sm ui-text-secondary">Build: {builds.map((build) => build.title).join(', ')}</p>}
            </article>
          )
        })}
      </div>

      <div className="ui-surface ui-surface-inset mt-5 p-4">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="font-semibold ui-text">A rhythm that fits your week</h3>
            <p className="mt-1 text-sm ui-text-secondary">{lessons.length} Sessions · about {totalMinutes} minutes of learning · planned for {timeCommitment}.</p>
          </div>
          <p className="text-sm ui-text-muted">Level: {level}</p>
        </div>
        <div className="mt-4"><ProfileControls level={level} timeCommitment={timeCommitment} onLevelChange={onLevelChange} onTimeChange={onTimeChange} disabled={working} /></div>
      </div>

      {profileStale && (
        <div className="ui-alert ui-alert-warning mt-4 flex flex-wrap items-center justify-between gap-3" role="status">
          <span>Your pace changed. Update the plan before adding it to your Trail.</span>
          <button type="button" className="ui-button ui-button-secondary min-h-0 px-3 py-1.5 text-sm" onClick={onRefresh} disabled={working}>Update plan for this rhythm</button>
        </div>
      )}
      {error && <div className="ui-alert ui-alert-danger mt-4" role="alert">{error}</div>}
      <div className="mt-5 flex flex-wrap gap-3">
        <button type="button" className="ui-button ui-button-primary" onClick={onConfirm} disabled={working || profileStale}>
          {working ? 'Adding to your Trail…' : 'Add to my Trail'}
        </button>
        <button type="button" className="ui-button ui-button-secondary" onClick={onTweak} disabled={working}>Adjust plan</button>
        <button type="button" className="ui-button ui-button-quiet" onClick={onDefer} disabled={working}>Not now</button>
      </div>
    </section>
  )
}

export default function ContinuationFlow() {
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

  return (
    <div className="ui-page min-h-screen">
      <AppHeader />
      <main className="ui-container max-w-5xl space-y-5 px-4 py-6 sm:py-8">
        {phase === 'loading' && <div className="ui-panel p-10 text-center"><span className="ui-spinner mx-auto" role="status" aria-label="Loading completed Track" /></div>}

        {readiness && <CompletionSummary readiness={readiness} dashboard={dashboard} onReview={() => navigate('/reviews')} />}

        {phase === 'ineligible' && (
          <section className="ui-panel p-6" aria-labelledby="ineligible-heading">
            <p className="ui-text-muted text-xs font-semibold uppercase tracking-wide">{readiness?.course?.title || 'Your Track'}</p>
            <h2 id="ineligible-heading" className="mt-2 text-xl font-bold ui-text">Finish this Track first</h2>
            <p className="mt-2 ui-text-secondary">{readiness?.reason || 'Complete each Chapter checkpoint to unlock your next Track.'}</p>
            <button type="button" className="ui-button ui-button-primary mt-5" onClick={goToParent}>Back to my Trail</button>
          </section>
        )}

        {phase === 'generating' && <GeneratingState />}

        {phase === 'error' && (
          <section className="ui-panel p-5 sm:p-7" aria-labelledby="generation-error-heading">
            <h2 id="generation-error-heading" className="text-xl font-semibold ui-text">Your next Track is still within reach</h2>
            {error && <div className="ui-alert ui-alert-warning mt-4" role="alert">{error}</div>}
            <div className="mt-5 flex flex-wrap gap-3">
              {readiness?.eligible && dashboard && <button type="button" className="ui-button ui-button-primary" onClick={handleGenerate} disabled={working}>{working ? 'Trying again…' : 'Retry generation'}</button>}
              {readiness?.eligible && !dashboard && <button type="button" className="ui-button ui-button-primary" onClick={loadCompletion} disabled={working}>Retry loading Track</button>}
              <button type="button" className="ui-button ui-button-secondary" onClick={goToParent}>Back to my Trail</button>
            </div>
          </section>
        )}

        {phase === 'preview' && curriculum && (
          <>
            <ContinuationPreview
              curriculum={curriculum}
              readiness={readiness}
              level={level}
              timeCommitment={timeCommitment}
              profileStale={Boolean(draftProfile && (draftProfile.level !== level || draftProfile.timeCommitment !== timeCommitment))}
              onLevelChange={setLevel}
              onTimeChange={setTimeCommitment}
              onRefresh={handleGenerate}
              onTweak={() => { setAdjusting((open) => !open); setError('') }}
              onConfirm={handleConfirm}
              onDefer={goToParent}
              onReview={() => navigate('/reviews')}
              working={working}
              error={error}
            />
            {adjusting && (
              <section className="ui-panel p-5" aria-labelledby="adjust-plan-heading">
                <h2 id="adjust-plan-heading" className="font-semibold ui-text">Adjust this plan</h2>
                <p className="mt-1 text-sm ui-text-secondary">Tell us what to change. Your current preview stays available if the adjustment fails.</p>
                <label htmlFor="continuation-adjustment" className="ui-field-label mt-4 block">What would you like to adjust?</label>
                <textarea
                  id="continuation-adjustment"
                  className="ui-field mt-1 min-h-28 w-full"
                  maxLength={1000}
                  value={adjustment}
                  onChange={(event) => setAdjustment(event.target.value)}
                  disabled={working}
                />
                <p className="mt-1 text-xs ui-text-muted">{adjustment.length}/1000 characters</p>
                <div className="mt-4 flex gap-3">
                  <button type="button" className="ui-button ui-button-primary" onClick={handleTweak} disabled={working || !adjustment.trim()}>{working ? 'Adjusting…' : 'Apply adjustment'}</button>
                  <button type="button" className="ui-button ui-button-secondary" onClick={() => setAdjusting(false)} disabled={working}>Keep current plan</button>
                </div>
              </section>
            )}
          </>
        )}
      </main>
    </div>
  )
}
