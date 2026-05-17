import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  getTopics,
  getDashboard,
  deleteTopic,
  selectTopic,
  getDefaultTopic,
  getReviewCount,
} from '../api.js'
import CompetenceGraph from '../components/CompetenceGraph.jsx'
import ExamPanel from '../components/ExamPanel.jsx'

function EmptyState({ onStart }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-6xl mb-4">🌱</div>
      <h2 className="text-2xl font-bold text-gray-900 mb-2">You have not started learning anything yet</h2>
      <p className="text-gray-600 mb-6 text-center max-w-md">
        Pick a topic and we will design a personalized competence graph just for you.
      </p>
      <button
        onClick={onStart}
        className="rounded-lg bg-indigo-600 px-6 py-3 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
      >
        Start Learning
      </button>
    </div>
  )
}

function TopicCard({ topic, isActive, onClick, onDelete }) {
  const progress = topic.progress ?? 0
  return (
    <div
      data-testid="topic-card"
      onClick={() => onClick(topic.id)}
      className={`cursor-pointer rounded-xl border p-4 transition-all hover:shadow-md focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
        isActive
          ? 'border-indigo-500 bg-indigo-50 ring-1 ring-indigo-500'
          : 'border-gray-200 bg-white'
      }`}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onClick(topic.id)
        }
      }}
      aria-label={`${topic.title}, ${progress}% complete`}
    >
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900 truncate">{topic.title}</h3>
        <span className="text-sm font-medium text-gray-600">{progress}%</span>
      </div>
      <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden mb-2">
        <div
          className="h-full bg-indigo-600 rounded-full transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <div className="flex items-center justify-between text-xs text-gray-500">
        <span>
          {topic.passedLessons ?? 0} / {topic.totalLessons ?? 0} lessons
        </span>
        {onDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation()
              onDelete(topic.id)
            }}
            className="text-red-500 hover:text-red-700 focus:outline-none focus:ring-1 focus:ring-red-500 rounded px-1"
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
    <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold text-gray-900">{mod.title}</h3>
        {isCompleted && (
          <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
            ✅ Completed
          </span>
        )}
        {allPassed && !isCompleted && (
          <span className="inline-flex items-center rounded-full bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-800">
            📝 Exam Ready
          </span>
        )}
      </div>
      <div className="flex items-center justify-between">
        <span className="text-xs text-gray-500">
          {mod.lessons.filter((l) => ['passed', 'tested_out'].includes(l.state)).length} / {mod.lessons.length} lessons passed
        </span>
        {allPassed && !isCompleted && (
          <button
            onClick={() => onStartExam(mod.id)}
            className="rounded-lg bg-green-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
          >
            Take Exam
          </button>
        )}
        {!allPassed && !isCompleted && mod.lessonsRemaining > 0 && (
          <span className="text-xs text-gray-400">{mod.lessonsRemaining} lessons remaining</span>
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
  const navigate = useNavigate()

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

  const init = useCallback(async () => {
    setLoading(true)
    setError('')
    const topicList = await loadTopics()
    await loadReviewCounts()
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
  }, [loadTopics, loadDashboard, loadReviewCounts])

  useEffect(() => {
    init()
  }, [init])

  const handleTopicClick = async (topicId) => {
    if (topicId === activeTopicId) return
    setError('')
    try {
      await selectTopic(topicId)
      await loadDashboard(topicId)
    } catch (err) {
      setError(err.message || 'Failed to switch topic.')
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

  const handleExamBack = useCallback(() => {
    setExamModuleId(null)
    if (activeTopicId) {
      loadDashboard(activeTopicId)
    }
  }, [activeTopicId, loadDashboard])

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-gray-600">Loading...</div>
      </div>
    )
  }

  const hasTopics = topics && topics.length > 0

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Mastery Roadmap</h1>
          <div className="flex items-center gap-3">
            {hasTopics && (
              <>
                <button
                  onClick={() => navigate('/reviews')}
                  className="relative rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                  aria-label="Reviews"
                >
                  Reviews
                  {reviewCounts && reviewCounts.totalDue > 0 && (
                    <span className="absolute -top-1.5 -right-1.5 inline-flex items-center justify-center w-5 h-5 rounded-full bg-red-500 text-white text-xs font-bold">
                      {reviewCounts.totalDue}
                    </span>
                  )}
                </button>
                <button
                  onClick={() => navigate('/onboarding')}
                  className="rounded-md bg-indigo-600 px-3 py-2 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
                >
                  + New Topic
                </button>
              </>
            )}
            <button
              onClick={() => navigate('/settings')}
              className="rounded-md border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              Settings
            </button>
          </div>
        </div>
      </header>

      {/* Error banner */}
      {error && (
        <div className="max-w-7xl mx-auto px-4 mt-4">
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700" role="alert">
            {error}
          </div>
        </div>
      )}

      {/* Main content */}
      <main className="max-w-7xl mx-auto px-4 py-6">
        {!hasTopics && (
          <EmptyState onStart={() => navigate('/onboarding')} />
        )}

        {hasTopics && (
          <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
            {/* Sidebar: topic list */}
            <aside className="lg:col-span-1 space-y-3">
              <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-2">
                Your Topics
              </h2>
              {topics.map((topic) => (
                <TopicCard
                  key={topic.id}
                  topic={topic}
                  isActive={topic.id === activeTopicId}
                  onClick={handleTopicClick}
                  onDelete={handleDeleteTopic}
                />
              ))}
            </aside>

            {/* Main: competence graph or exam panel */}
            <section className="lg:col-span-3">
              {examModuleId && dashboard && (
                <div className="bg-white rounded-xl border border-gray-200 p-6 min-h-[500px]">
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <h2 className="text-2xl font-bold text-gray-900">{dashboard.topic.title}</h2>
                      <p className="text-sm text-gray-500 mt-1">
                        Module Exam: {dashboard.modules.find((m) => m.id === examModuleId)?.title}
                      </p>
                    </div>
                    <button
                      onClick={handleExamBack}
                      className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-50"
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
                <div className="bg-white rounded-xl border border-gray-200 p-6 min-h-[500px]">
                  <div className="mb-4">
                    <h2 className="text-2xl font-bold text-gray-900">{dashboard.topic.title}</h2>
                    <p className="text-sm text-gray-500 mt-1">
                      {dashboard.topic.passedLessons ?? 0} / {dashboard.topic.totalLessons ?? 0} lessons completed
                      {' '}({dashboard.topic.progress ?? 0}%)
                    </p>
                  </div>
                  {/* Module cards */}
                  <div className="mb-6">
                    <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-3">Modules</h3>
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
                  <CompetenceGraph
                    modules={dashboard.modules}
                    onNodeClick={handleGraphNodeClick}
                    onStateChange={handleStateChange}
                  />
                </div>
              )}
              {!dashboard && activeTopicId && (
                <div className="bg-white rounded-xl border border-gray-200 p-12 text-center">
                  <div className="text-gray-500">Loading dashboard...</div>
                </div>
              )}
            </section>
          </div>
        )}
      </main>
    </div>
  )
}
