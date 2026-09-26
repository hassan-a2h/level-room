import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import {
  deleteTopic,
  getDashboard,
  getDefaultTopic,
  getLocalDate,
  getLocalTimeZone,
  getReviewCount,
  getTopics,
  selectTopic,
} from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import ExamPanel from '../components/ExamPanel.jsx'
import FocusAreas from '../components/trail/FocusAreas.jsx'
import TodayCard from '../components/trail/TodayCard.jsx'
import TrailMap from '../components/trail/TrailMap.jsx'
import WeeklyRhythm from '../components/trail/WeeklyRhythm.jsx'
import { SkeletonCard } from '../components/Skeleton.jsx'

function requestedTopicId(search) {
  const value = new URLSearchParams(search).get('topicId')
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function TopicSwitcher({ topics, activeTopicId, onSelect, onDelete }) {
  if (!topics?.length) return null

  return (
    <nav className="mb-6" aria-label="Your Trails">
      <div className="mb-2 flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold ui-text">Your Trails</h2>
        <Link className="ui-button ui-button-quiet min-h-10 px-2 text-sm" to="/onboarding">New Trail</Link>
      </div>
      <ul className="flex gap-2 overflow-x-auto pb-2">
        {topics.map((topic) => (
          <li key={topic.id} className="flex shrink-0 items-center gap-1 rounded-xl border ui-border p-1">
            <button
              type="button"
              className="min-h-10 rounded-lg px-3 text-left text-sm ui-text"
              aria-pressed={topic.id === activeTopicId}
              onClick={() => onSelect(topic.id)}
              style={topic.id === activeTopicId ? { backgroundColor: 'var(--ui-action-soft)' } : undefined}
            >
              <span className="block max-w-48 truncate font-medium">{topic.title}</span>
              <span className="block text-xs ui-text-muted">
                {topic.status === 'completed' ? 'Track complete' : topic.status === 'archived' ? 'Archived' : `${Math.min(100, Math.max(0, topic.progress || 0))}% complete`}
              </span>
            </button>
            {!topic.hasChildren && (
              <button
                type="button"
                className="ui-button ui-button-quiet min-h-10 px-2 text-xs"
                aria-label={`Delete Trail ${topic.title}`}
                onClick={() => onDelete(topic.id)}
              >
                Delete
              </button>
            )}
          </li>
        ))}
      </ul>
    </nav>
  )
}

function ReviewDue({ summary }) {
  const totalDue = Number.isFinite(summary?.totalDue) ? Math.max(0, summary.totalDue) : 0
  const overdue = Number.isFinite(summary?.overdue) ? Math.max(0, summary.overdue) : 0
  const dueToday = Number.isFinite(summary?.dueToday) ? Math.max(0, summary.dueToday) : 0

  return (
    <section className="ui-surface ui-surface-raised p-4 sm:p-5" aria-label="Reviews due">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="font-semibold ui-text">Reviews due</h2>
          {totalDue > 0 ? (
            <p className="mt-1 text-sm ui-text-secondary">
              {overdue > 0 ? `${overdue} overdue · ` : ''}{dueToday} due today
            </p>
          ) : <p className="mt-1 text-sm ui-text-secondary">You’re clear for now.</p>}
        </div>
        <span className="rounded-full px-2.5 py-1 text-sm font-semibold ui-text" style={{ backgroundColor: 'var(--ui-surface-alt)' }} aria-label={`${totalDue} items due`}>
          {totalDue}
        </span>
      </div>
      <Link className="ui-button ui-button-secondary mt-3 min-h-10 text-sm" to="/reviews">
        {totalDue > 0 ? 'Start retrieval practice' : 'Open reviews'}
      </Link>
    </section>
  )
}

function DashboardError({ message, onRetry }) {
  if (!message) return null
  return (
    <div className="ui-surface mx-auto mb-4 flex max-w-7xl flex-col items-start gap-3 border p-4 sm:flex-row sm:items-center sm:justify-between" role="alert" style={{ backgroundColor: 'var(--ui-danger-bg)', borderColor: 'var(--ui-danger-border)', color: 'var(--ui-danger-text)' }}>
      <p className="text-sm">{message}</p>
      <button type="button" className="ui-button ui-button-secondary min-h-10 shrink-0" onClick={onRetry}>
        Retry loading Trail
      </button>
    </div>
  )
}

export default function Dashboard() {
  const [topics, setTopics] = useState(null)
  const [activeTopicId, setActiveTopicId] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [reviewCounts, setReviewCounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [switchingTopic, setSwitchingTopic] = useState(false)
  const [error, setError] = useState('')
  const [examModuleId, setExamModuleId] = useState(null)
  const dashboardRequestRef = useRef(0)
  const location = useLocation()
  const navigate = useNavigate()

  const loadDashboard = useCallback(async (topicId) => {
    const requestId = ++dashboardRequestRef.current
    try {
      const data = await getDashboard(topicId, getLocalDate(), getLocalTimeZone())
      if (requestId === dashboardRequestRef.current) {
        setDashboard(data)
        setActiveTopicId(topicId)
      }
      return data
    } catch (err) {
      if (requestId === dashboardRequestRef.current) setError(err.message || 'Failed to load your Trail.')
      throw err
    }
  }, [])

  const init = useCallback(async () => {
    setLoading(true)
    setError('')
    setTopics(null)
    setDashboard(null)
    try {
      const [topicResponse, reviewResponse] = await Promise.all([
        getTopics(),
        getReviewCount().catch(() => null),
      ])
      const topicList = Array.isArray(topicResponse?.topics) ? topicResponse.topics : []
      setTopics(topicList)
      setReviewCounts(reviewResponse)
      if (topicList.length === 0) {
        setActiveTopicId(null)
        return
      }

      const requestedId = requestedTopicId(location.search)
      const requested = requestedId === null ? null : topicList.find((topic) => topic.id === requestedId)
      let selectedTopic = requested
      if (requested) {
        await selectTopic(requested.id)
      } else {
        try {
          const defaultResponse = await getDefaultTopic()
          selectedTopic = topicList.find((topic) => topic.id === defaultResponse?.topic?.id) || topicList[0]
        } catch {
          selectedTopic = topicList[0]
        }
      }
      await loadDashboard(selectedTopic.id)
    } catch (err) {
      setError((current) => current || err.message || 'Failed to load your Trail.')
    } finally {
      setLoading(false)
    }
  }, [loadDashboard, location.search])

  useEffect(() => {
    init()
    return () => { dashboardRequestRef.current += 1 }
  }, [init])

  const handleTopicSelect = async (topicId) => {
    if (topicId === activeTopicId || !Number.isSafeInteger(topicId)) return
    setSwitchingTopic(true)
    setError('')
    try {
      await selectTopic(topicId)
      await loadDashboard(topicId)
    } catch (err) {
      setError(err.message || 'Could not switch Trails. Try again.')
    } finally {
      setSwitchingTopic(false)
    }
  }

  const handleTopicDelete = async (topicId) => {
    const topic = topics?.find((item) => item.id === topicId)
    if (!topic || topic.hasChildren) return
    if (!window.confirm(`Delete “${topic.title}” and its learning progress? This cannot be undone.`)) return
    setError('')
    try {
      await deleteTopic(topicId)
      const remainingResponse = await getTopics()
      const remaining = Array.isArray(remainingResponse?.topics) ? remainingResponse.topics : []
      setTopics(remaining)
      if (remaining.length === 0) {
        setDashboard(null)
        setActiveTopicId(null)
      } else if (topicId === activeTopicId) {
        const nextTopic = remaining[0]
        await selectTopic(nextTopic.id)
        await loadDashboard(nextTopic.id)
      }
    } catch (err) {
      setError(err.code === 'COURSE_HAS_CHILDREN'
        ? 'This Track anchors a later Track and cannot be deleted.'
        : err.message || 'Could not delete this Trail.')
    }
  }

  const handleStartSession = (session) => {
    if (!Number.isSafeInteger(activeTopicId) || !Number.isSafeInteger(session?.id)) return
    navigate(`/topic/${activeTopicId}/lesson/${session.id}`)
  }

  const handleStartCheckpoint = (moduleId) => {
    if (Number.isSafeInteger(moduleId)) setExamModuleId(moduleId)
  }

  const handleOpenFocusArea = (lessonId) => {
    if (!Number.isSafeInteger(activeTopicId) || !Number.isSafeInteger(lessonId)) return
    navigate(`/topic/${activeTopicId}/lesson/${lessonId}`)
  }

  const handleExamBack = useCallback(() => {
    setExamModuleId(null)
    if (activeTopicId) loadDashboard(activeTopicId).catch(() => {})
  }, [activeTopicId, loadDashboard])

  if (loading) {
    return (
      <div className="min-h-screen ui-bg-canvas ui-text">
        <AppHeader dueCount={reviewCounts?.totalDue} />
        <main className="mx-auto max-w-7xl px-4 py-6" aria-busy="true">
          <h1 className="mb-5 text-2xl font-semibold ui-text">Your learning Trail</h1>
          <SkeletonCard count={3} />
        </main>
      </div>
    )
  }

  const hasTopics = Array.isArray(topics) && topics.length > 0
  const modules = Array.isArray(dashboard?.modules) ? dashboard.modules : []
  const reviewSummary = dashboard?.reviewSummary || reviewCounts || { totalDue: 0, dueToday: 0, overdue: 0 }
  const nextAction = dashboard?.nextAction || { kind: 'unavailable', title: 'Your next step is not available yet.' }
  const currentModuleId = Number.isSafeInteger(nextAction.moduleId)
    ? nextAction.moduleId
    : modules.find((module) => module.status !== 'completed')?.id

  return (
    <div className="min-h-screen ui-bg-canvas ui-text">
      <AppHeader dueCount={reviewSummary.totalDue ?? reviewCounts?.totalDue} />
      <main className="mx-auto max-w-7xl px-4 py-5 sm:py-7">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] ui-text-muted">A steady path to mastery</p>
            <h1 className="mt-1 text-2xl font-semibold ui-text sm:text-3xl">Your learning Trail</h1>
          </div>
          {hasTopics && <p className="text-sm ui-text-muted">One Session at a time</p>}
        </div>

        <DashboardError message={error} onRetry={init} />

        {!hasTopics && topics && (
          <section className="ui-surface mx-auto flex min-h-[45vh] max-w-2xl flex-col items-center justify-center p-6 text-center sm:p-10" aria-label="Start learning">
            <span className="mb-3 grid h-14 w-14 place-items-center rounded-full text-2xl" style={{ backgroundColor: 'var(--ui-action-soft)' }} aria-hidden="true">✦</span>
            <p className="text-xs font-semibold uppercase tracking-[0.14em] ui-text-muted">A fresh page</p>
            <h2 className="mt-2 text-2xl font-semibold ui-text">Your first Trail starts here</h2>
            <p className="mt-3 max-w-md text-sm leading-6 ui-text-secondary">Choose something you want to be able to do. We’ll shape it into a clear path of practice, useful feedback, and real progress.</p>
            <Link className="ui-button ui-button-primary mt-6" to="/onboarding">Start learning</Link>
          </section>
        )}

        {hasTopics && (
          <>
            <TopicSwitcher topics={topics} activeTopicId={activeTopicId} onSelect={handleTopicSelect} onDelete={handleTopicDelete} />
            {examModuleId && dashboard ? (
              <section className="ui-surface ui-surface-raised p-4 sm:p-6" aria-label="Chapter checkpoint">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide ui-text-muted">Chapter checkpoint</p>
                    <h2 className="mt-1 text-xl font-semibold ui-text">{modules.find((module) => module.id === examModuleId)?.title || 'Show what you can do'}</h2>
                  </div>
                  <button type="button" className="ui-button ui-button-secondary" onClick={handleExamBack}>Back to Trail</button>
                </div>
                <ExamPanel
                  topicId={activeTopicId}
                  moduleId={examModuleId}
                  moduleTitle={modules.find((module) => module.id === examModuleId)?.title || ''}
                  chapterOutcomes={modules.find((module) => module.id === examModuleId)?.skill_outcomes || []}
                  moduleLessons={modules.find((module) => module.id === examModuleId)?.lessons || []}
                  onBack={handleExamBack}
                />
              </section>
            ) : dashboard?.topic?.resumeAvailable && modules.length === 0 ? (
              <section className="ui-surface ui-surface-raised mx-auto max-w-3xl p-6 sm:p-9" aria-label="Track setup">
                <p className="text-xs font-semibold uppercase tracking-wide ui-text-muted">One more step</p>
                <h2 className="mt-2 text-xl font-semibold ui-text">
                  {dashboard.topic.curriculumState === 'setup' ? 'Finish setting up your Track' : dashboard.topic.curriculumState === 'draft_ready' ? 'Your Track is ready to preview' : 'Resume building your Track'}
                </h2>
                <p className="mt-2 text-sm leading-6 ui-text-secondary">{dashboard.topic.curriculumError || 'Your learning path is safe. Continue setup to see the Chapters and practice ahead.'}</p>
                <Link className="ui-button ui-button-primary mt-5" to={`/onboarding?topicId=${encodeURIComponent(activeTopicId)}`}>Continue setup</Link>
              </section>
            ) : dashboard ? (
              <div className="grid grid-cols-1 gap-4 lg:grid-cols-12 lg:gap-5" aria-busy={switchingTopic}>
                <div className="lg:col-start-1 lg:col-span-8 lg:row-start-1">
                  <TodayCard nextAction={nextAction} reviewSummary={reviewSummary} onStartCheckpoint={handleStartCheckpoint} />
                </div>
                <div className="lg:col-start-1 lg:col-span-8 lg:row-start-2">
                  <TrailMap
                    topic={dashboard.topic}
                    modules={modules}
                    currentModuleId={currentModuleId}
                    part="so-far"
                    onStartSession={handleStartSession}
                    onStartCheckpoint={handleStartCheckpoint}
                    onOpenPriorTrack={handleTopicSelect}
                  />
                </div>
                <div className="lg:col-start-9 lg:col-span-4 lg:row-start-2">
                  <ReviewDue summary={reviewSummary} />
                </div>
                <div className="lg:col-start-1 lg:col-span-8 lg:row-start-3">
                  <TrailMap
                    topic={dashboard.topic}
                    modules={modules}
                    currentModuleId={currentModuleId}
                    part="remaining"
                    onStartSession={handleStartSession}
                    onStartCheckpoint={handleStartCheckpoint}
                  />
                </div>
                <div className="lg:col-start-9 lg:col-span-4 lg:row-start-1">
                  <WeeklyRhythm rhythm={dashboard.weeklyRhythm} />
                </div>
                <div className="lg:col-start-9 lg:col-span-4 lg:row-start-3">
                  <FocusAreas areas={dashboard.focusAreas} onOpenSession={handleOpenFocusArea} />
                </div>
              </div>
            ) : (
              <div className="ui-surface p-6 text-sm ui-text-secondary" role="status">Loading this Trail…</div>
            )}
          </>
        )}
      </main>
    </div>
  )
}
