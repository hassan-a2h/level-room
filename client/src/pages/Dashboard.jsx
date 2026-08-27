import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTopics,
  getDashboard,
  deleteTopic,
  selectTopic,
  getDefaultTopic,
  getReviewCount,
  getStreak,
  getLocalDate,
} from '../api.js'
import CompetenceGraph from '../components/CompetenceGraph.jsx'
import AppHeader from '../components/AppHeader.jsx'
import ExamPanel from '../components/ExamPanel.jsx'
import { SkeletonGraph, SkeletonCard } from '../components/Skeleton.jsx'

const ACTIONABLE_LESSON_STATES = new Set(['not_started', 'practicing', 'quiz_pending', 'remediating'])

function getNextLesson(modules = []) {
  const lessons = modules.flatMap((mod) => Array.isArray(mod.lessons) ? mod.lessons : [])
  const available = lessons.filter((lesson) => !lesson.locked && ACTIONABLE_LESSON_STATES.has(lesson.state))
  return available.find((lesson) => lesson.state === 'practicing') || available[0] || null
}

function GlobalStats({ topics }) {
  if (!topics || topics.length === 0) return null
  const activeTopicCount = topics.filter((topic) => topic.status === 'active' || !topic.status).length
  const totalPassed = topics.reduce((sum, t) => sum + (t.passedLessons || 0), 0)
  const totalLessons = topics.reduce((sum, t) => sum + (t.totalLessons || 0), 0)
  const masteredTopics = topics.filter((t) => (t.progress || 0) >= 100).length

  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div className="ui-surface ui-surface-flat p-3 text-center">
        <div className="text-xl font-bold ui-text">{activeTopicCount}</div>
        <div className="text-xs ui-text-muted">Active Topics</div>
      </div>
      <div className="ui-surface ui-surface-flat p-3 text-center">
        <div className="text-xl font-bold ui-text">{totalPassed}</div>
        <div className="text-xs ui-text-muted">Lessons Mastered</div>
      </div>
      <div className="ui-surface ui-surface-flat p-3 text-center">
        <div className="text-xl font-bold ui-text">{totalLessons > 0 ? Math.floor((totalPassed / totalLessons) * 100) : 0}%</div>
        <div className="text-xs ui-text-muted">Overall Progress</div>
      </div>
      <div className="ui-surface ui-surface-flat p-3 text-center">
        <div className="text-xl font-bold ui-text">{masteredTopics}</div>
        <div className="text-xs ui-text-muted">Topics Completed</div>
      </div>
    </div>
  )
}

function EmptyState({ onStart }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-6xl mb-4">🌱</div>
      <h2 className="text-2xl font-bold ui-text mb-2 text-center">You have not started learning anything yet</h2>
      <p className="ui-text-secondary mb-6 text-center max-w-md text-sm sm:text-base">
        Pick a topic and we will design a personalized competence graph just for you.
      </p>
      <button
        onClick={onStart}
        className="ui-button ui-button-primary"
      >
        Start Learning
      </button>
    </div>
  )
}

function TopicCard({ topic, isActive, onClick, onDelete }) {
  const progress = topic.progress ?? 0
  const courseLabel = topic.courseStage > 0
    ? `Advanced · Stage ${topic.courseStage}`
    : 'Core course'
  return (
    <div
      data-testid="topic-card"
      className="ui-surface ui-surface-raised cursor-pointer p-4 transition-shadow hover:shadow-md"
      style={isActive ? { outline: '2px solid var(--ui-focus)', outlineOffset: '2px' } : undefined}
      onClick={(event) => {
        if (!event.target.closest('button')) onClick(topic.id)
      }}
    >
      <div className="flex items-start gap-2">
        <button
          type="button"
          onClick={() => onClick(topic.id)}
          className="ui-topic-select min-w-0 flex-1"
          aria-label={`${topic.title}, ${progress}% complete`}
          aria-pressed={isActive}
        >
          <span className="mb-2 flex items-center justify-between gap-2">
            <span role="heading" aria-level="3" className="font-semibold ui-text truncate min-w-0 flex-1">{topic.title}</span>
            <span className="text-sm font-medium ui-text-secondary shrink-0">{progress}%</span>
          </span>
          <span className="ui-progress-track mb-2 block">
            <span className="ui-progress-value block" style={{ width: `${progress}%` }} />
          </span>
          <span className="block text-xs ui-text-muted truncate">
            {topic.passedLessons ?? 0} / {topic.totalLessons ?? 0} lessons
          </span>
          <span className="mt-1 block text-xs ui-text-muted truncate">{courseLabel}{topic.courseFocus ? ` · ${topic.courseFocus}` : ''}</span>
        </button>
        {onDelete && (
          <button
            onClick={() => onDelete(topic.id)}
            className="ui-button ui-button-destructive mt-1 shrink-0 px-2 py-1 text-xs"
            aria-label={`Delete topic ${topic.title}`}
          >
            Delete
          </button>
        )}
      </div>
    </div>
  )
}

function ModuleCard({ mod, topicId, onStartExam }) {
  const allPassed = mod.examReady
  const isCompleted = mod.status === 'completed'

  return (
    <div className="ui-surface ui-surface-raised p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold ui-text">{mod.title}</h3>
        {isCompleted && (
          <span className="ui-status ui-status-success">
            Completed
          </span>
        )}
        {allPassed && !isCompleted && (
          <span className="ui-status ui-status-progress">
            Exam Ready
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs ui-text-muted">
          {mod.lessons.filter((l) => ['passed', 'tested_out'].includes(l.state)).length} / {mod.lessons.length} lessons passed
        </span>
        {allPassed && !isCompleted && (
          <button
            onClick={() => onStartExam(mod.id)}
            className="ui-button ui-button-primary text-xs"
          >
            Take Exam
          </button>
        )}
        {!allPassed && !isCompleted && mod.lessonsRemaining > 0 && (
          <span className="text-xs ui-text-muted">{mod.lessonsRemaining} lessons remaining</span>
        )}
      </div>
    </div>
  )
}

export default function Dashboard() {
  const [topics, setTopics] = useState(null)
  const [activeTopicId, setActiveTopicId] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [examModuleId, setExamModuleId] = useState(null)
  const [reviewCounts, setReviewCounts] = useState(null)
  const [streak, setStreak] = useState(null)
  const [switchingTopic, setSwitchingTopic] = useState(false)
  const navigate = useNavigate()
  const topicSwitchTimerRef = useRef(null)

  const loadTopics = useCallback(async () => {
    try {
      const data = await getTopics()
      setTopics(data.topics)
      return data.topics
    } catch (err) {
      setError(err.message || 'Failed to load topics.')
      return []
    }
  }, [])

  const loadDashboard = useCallback(async (topicId) => {
    try {
      const data = await getDashboard(topicId)
      setDashboard(data)
      setActiveTopicId(topicId)
    } catch (err) {
      setError(err.message || 'Failed to load dashboard.')
    }
  }, [])

  const loadReviewCounts = useCallback(async () => {
    try {
      const data = await getReviewCount()
      setReviewCounts(data)
    } catch {
      setReviewCounts(null)
    }
  }, [])

  const loadStreak = useCallback(async () => {
    try {
      const data = await getStreak(getLocalDate())
      setStreak(data)
    } catch {
      setStreak(null)
    }
  }, [])

  const init = useCallback(async () => {
    setLoading(true)
    setError('')
    const topicList = await loadTopics()
    await loadReviewCounts()
    await loadStreak()
    if (topicList.length === 0) {
      setLoading(false)
      return
    }
    try {
      const defaultTopic = await getDefaultTopic()
      if (defaultTopic.topic) {
        await loadDashboard(defaultTopic.topic.id)
      }
    } catch {
      // Fallback to first topic if no default
      if (topicList[0]) {
        await loadDashboard(topicList[0].id)
      }
    }
    setLoading(false)
  }, [loadTopics, loadDashboard, loadReviewCounts, loadStreak])

  useEffect(() => {
    init()
  }, [init])

  const handleTopicClick = async (topicId) => {
    if (topicId === activeTopicId) return
    if (topicSwitchTimerRef.current) clearTimeout(topicSwitchTimerRef.current)
    setSwitchingTopic(true)
    setError('')
    try {
      await selectTopic(topicId)
      await loadDashboard(topicId)
    } catch (err) {
      setError(err.message || 'Failed to switch topic.')
    } finally {
      topicSwitchTimerRef.current = setTimeout(() => setSwitchingTopic(false), 300)
    }
  }

  const handleDeleteTopic = async (topicId) => {
    if (!window.confirm('Are you sure? This will delete the topic and all its progress.')) return
    try {
      await deleteTopic(topicId)
      const remaining = await loadTopics()
      if (remaining.length === 0) {
        setDashboard(null)
        setActiveTopicId(null)
      } else {
        const next = remaining[0]
        await loadDashboard(next.id)
      }
    } catch (err) {
      setError(err.message || 'Failed to delete topic.')
    }
  }

  const handleGraphNodeClick = (lesson) => {
    if (lesson.locked) return
    navigate(`/topic/${activeTopicId}/lesson/${lesson.id}`)
  }

  const handleStateChange = async (lessonId, newState) => {
    // Optimistically update local state so graph animates immediately
    setDashboard((prev) => {
      if (!prev) return prev
      return {
        ...prev,
        modules: prev.modules.map((mod) => ({
          ...mod,
          lessons: mod.lessons.map((l) =>
            l.id === lessonId ? { ...l, state: newState } : l
          ),
        })),
      }
    })
  }

  const handleStartExam = (moduleId) => {
    setExamModuleId(moduleId)
  }

  const handleContinue = () => {
    if (activeTopicId) navigate(`/topic/${activeTopicId}/continue`)
  }

  const handleExamBack = useCallback(() => {
    setExamModuleId(null)
    if (activeTopicId) {
      loadDashboard(activeTopicId)
    }
  }, [activeTopicId, loadDashboard])

  if (loading) {
    return (
      <div className="min-h-screen ui-bg-canvas ui-text">
        <AppHeader dueCount={reviewCounts?.totalDue} />
        <main className="max-w-7xl mx-auto px-4 py-6">
          <h1 className="mb-5 text-3xl font-bold ui-text">Your learning dashboard</h1>
          <SkeletonCard count={2} />
          <div className="mt-6">
            <SkeletonGraph />
          </div>
        </main>
      </div>
    )
  }

  const hasTopics = topics && topics.length > 0
  const nextLesson = dashboard && !switchingTopic ? getNextLesson(dashboard.modules) : null
  const nextLessonLabel = nextLesson
    ? nextLesson.state === 'practicing'
      ? `Continue lesson: ${nextLesson.title}`
      : nextLesson.state === 'not_started'
        ? `Start lesson: ${nextLesson.title}`
        : `Resume lesson: ${nextLesson.title}`
    : null
  const courseComplete = Boolean(
    dashboard?.topic?.status === 'completed'
      && dashboard.modules?.length > 0
      && dashboard.modules.every((module) => module.status === 'completed'),
  )
  const activeTopics = topics.filter((topic) => topic.status === 'active' || !topic.status)
  const completedTopics = topics.filter((topic) => topic.status === 'completed')
  const archivedTopics = topics.filter((topic) => topic.status && !['active', 'completed'].includes(topic.status))

  return (
    <div className="min-h-screen ui-bg-canvas ui-text">
      <AppHeader dueCount={reviewCounts?.totalDue} />

      {/* Streak banner */}
      {streak && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          {streak.backlog ? (
            <div
              className="ui-surface p-3 text-sm flex items-center justify-between gap-3"
              style={{ backgroundColor: 'var(--ui-warning-bg)', borderColor: 'var(--ui-warning-border)', color: 'var(--ui-warning-text)' }}
              role="status"
              data-testid="streak-backlog"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">📚</span>
                <span>{streak.message}</span>
              </div>
              <span className="text-xs font-medium">{streak.daysSince} days since last activity</span>
            </div>
          ) : streak.streakBroken ? (
            <div
              className="ui-surface p-3 text-sm flex items-center gap-2"
              style={{ backgroundColor: 'var(--ui-danger-bg)', borderColor: 'var(--ui-danger-border)', color: 'var(--ui-danger-text)' }}
              role="status"
              data-testid="streak-broken"
            >
              <span className="text-lg">💔</span>
              <span>{streak.message}</span>
            </div>
          ) : streak.currentStreak > 0 ? (
            <div
              className="ui-surface p-3 text-sm flex items-center justify-between gap-3"
              style={{ backgroundColor: 'var(--ui-success-bg)', borderColor: 'var(--ui-success-border)', color: 'var(--ui-success-text)' }}
              role="status"
              data-testid="streak-active"
            >
              <div className="flex items-center gap-2">
                <span className="text-lg">🔥</span>
                <span className="font-semibold">{streak.currentStreak}-day streak</span>
                <span>{streak.message.replace(/\d+-day streak — /, '')}</span>
              </div>
              {streak.maxStreak > streak.currentStreak && (
                <span className="text-xs">Best: {streak.maxStreak} days</span>
              )}
            </div>
          ) : (
            <div
              className="ui-surface p-3 text-sm flex items-center gap-2"
              style={{ backgroundColor: 'var(--ui-neutral-bg)', borderColor: 'var(--ui-neutral-border)', color: 'var(--ui-neutral-text)' }}
              role="status"
              data-testid="streak-start"
            >
              <span className="text-lg">✨</span>
              <span>{streak.message}</span>
            </div>
          )}
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div
            className="ui-surface p-3 text-sm"
            style={{ backgroundColor: 'var(--ui-danger-bg)', borderColor: 'var(--ui-danger-border)', color: 'var(--ui-danger-text)' }}
            role="alert"
          >
            {error}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        <h1 className="mb-5 text-3xl font-bold ui-text">Your learning dashboard</h1>
        {!hasTopics && (
          <EmptyState onStart={() => navigate('/onboarding')} />
        )}

        {hasTopics && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar: topic list */}
            <aside className="lg:col-span-1 space-y-3">
              <h2 className="text-sm font-semibold ui-text-muted uppercase tracking-wider mb-2">Active Topics</h2>
              {activeTopics.length > 0 ? activeTopics.map((topic) => (
                <TopicCard key={topic.id} topic={topic} isActive={topic.id === activeTopicId} onClick={handleTopicClick} onDelete={handleDeleteTopic} />
              )) : <p className="text-sm ui-text-muted">No active courses.</p>}
              {completedTopics.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h2 className="text-sm font-semibold ui-text-muted uppercase tracking-wider mb-2">Completed Courses</h2>
                  {completedTopics.map((topic) => (
                    <TopicCard key={topic.id} topic={topic} isActive={topic.id === activeTopicId} onClick={handleTopicClick} onDelete={handleDeleteTopic} />
                  ))}
                </div>
              )}
              {archivedTopics.length > 0 && (
                <div className="mt-6 space-y-3">
                  <h2 className="text-sm font-semibold ui-text-muted uppercase tracking-wider mb-2">Archived Topics</h2>
                  {archivedTopics.map((topic) => (
                    <TopicCard key={topic.id} topic={topic} isActive={topic.id === activeTopicId} onClick={handleTopicClick} onDelete={handleDeleteTopic} />
                  ))}
                </div>
              )}
            </aside>

            {/* Main: competence graph or exam panel */}
            <section className="lg:col-span-3">
              {examModuleId && dashboard && (
                <div className="ui-surface ui-surface-raised p-4 sm:p-6 min-h-[500px]">
                  <div className="mb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                    <div>
                      <h2 className="text-xl sm:text-2xl font-bold ui-text">{dashboard.topic.title}</h2>
                      <p className="text-sm ui-text-muted mt-1">
                        Module Exam: {dashboard.modules.find((m) => m.id === examModuleId)?.title}
                      </p>
                    </div>
                    <button
                      onClick={handleExamBack}
                      className="ui-button ui-button-secondary"
                    >
                      Back to Dashboard
                    </button>
                  </div>
                  <ExamPanel
                    topicId={activeTopicId}
                    moduleId={examModuleId}
                    moduleLessons={dashboard.modules.find((m) => m.id === examModuleId)?.lessons || []}
                    onBack={handleExamBack}
                  />
                </div>
              )}
              {!examModuleId && dashboard && (
                <div className="ui-surface ui-surface-raised p-4 sm:p-6 min-h-[500px]">
                  <GlobalStats topics={topics} />
                  <div className="mb-4">
                    <h2 className="text-xl sm:text-2xl font-bold ui-text">{dashboard.topic.title}</h2>
                    <p className="text-sm ui-text-muted mt-1">
                      {dashboard.topic.passedLessons ?? 0} / {dashboard.topic.totalLessons ?? 0} lessons completed
                      {' '}({dashboard.topic.progress ?? 0}%)
                    </p>
                    <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
                      <span className="ui-status ui-status-neutral">
                        {dashboard.topic.courseStage > 0 ? `Advanced · Stage ${dashboard.topic.courseStage}` : 'Core · 80/20 foundation'}
                      </span>
                      {dashboard.topic.courseFocus && <span className="ui-text-muted">Lane: {dashboard.topic.courseFocus}</span>}
                    </div>
                  </div>
                  {dashboard.topic.parent && (
                    <div className="ui-surface ui-surface-inset mb-5 p-3 text-sm ui-text-secondary">
                      Builds on <button type="button" className="ui-button ui-button-quiet min-h-0 p-0 text-sm" onClick={() => handleTopicClick(dashboard.topic.parent.id)}>{dashboard.topic.parent.title}</button>
                      {dashboard.topic.parent.lane && <span className="ui-text-muted"> · {dashboard.topic.parent.lane}</span>}
                    </div>
                  )}
                  {nextLesson && (
                    <div className="mb-6">
                      <button
                        type="button"
                        onClick={() => handleGraphNodeClick(nextLesson)}
                        className="ui-button ui-button-primary"
                      >
                        {nextLessonLabel}
                      </button>
                    </div>
                  )}
                  {courseComplete && (
                    <div className="ui-surface ui-surface-raised mb-6 p-4 sm:p-5" data-testid="continuation-card">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <p className="text-xs font-semibold uppercase tracking-wide ui-text-muted">Course complete</p>
                          <h3 className="mt-1 text-lg font-semibold ui-text">Ready to go deeper?</h3>
                          <p className="mt-1 text-sm ui-text-secondary">Choose a new specialization lane. Your completed course stays unchanged and becomes the foundation for the next stage.</p>
                        </div>
                        <button type="button" className="ui-button ui-button-primary shrink-0" onClick={handleContinue}>Choose an advanced lane</button>
                      </div>
                    </div>
                  )}
                  {/* Module cards */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold ui-text-muted uppercase tracking-wider mb-3">Modules</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      {dashboard.modules.map((mod) => (
                        <ModuleCard
                          key={mod.id}
                          mod={mod}
                          topicId={activeTopicId}
                          onStartExam={handleStartExam}
                        />
                      ))}
                    </div>
                  </div>
                  {switchingTopic ? (
                    <SkeletonGraph />
                  ) : (
                    <CompetenceGraph
                      modules={dashboard.modules}
                      onNodeClick={handleGraphNodeClick}
                      onStateChange={handleStateChange}
                    />
                  )}
                </div>
              )}
              {!dashboard && activeTopicId && (
                <div className="ui-surface ui-surface-raised p-12 text-center">
                  <SkeletonGraph />
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
