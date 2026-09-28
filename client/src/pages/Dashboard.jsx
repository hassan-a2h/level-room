import { useCallback, useEffect, useRef, useState, Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
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
import { SkeletonCard } from '../components/Skeleton.jsx'
import { buildTrailViewModel } from '../features/trail/controller.js'
import { useThemeView } from '../theme/ThemeProvider.jsx'

function requestedTopicId(search) {
  const value = new URLSearchParams(search).get('topicId')
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function currentChapterId(dashboard) {
  const actionChapterId = dashboard?.nextAction?.moduleId
  if (Number.isSafeInteger(actionChapterId)) return actionChapterId
  const chapters = Array.isArray(dashboard?.modules) ? dashboard.modules : []
  return chapters.find((chapter) => chapter.status !== 'completed')?.id ?? null
}

function DashboardSkeleton() {
  return (
    <div className="mx-auto max-w-7xl px-4 py-6" aria-busy="true">
      <h1 className="mb-5 text-2xl font-semibold ui-text">Your learning Trail</h1>
      <SkeletonCard count={3} />
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
  const dashboardRequestRef = useRef(0)
  const location = useLocation()
  const navigate = useNavigate()
  const TrailView = useThemeView('TrailView')

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

  const handleStartCheckpoint = (chapterId) => {
    if (!Number.isSafeInteger(activeTopicId) || !Number.isSafeInteger(chapterId)) return
    navigate(`/topic/${activeTopicId}/chapter/${chapterId}/checkpoint`)
  }

  const handleOpenFocusArea = (sessionId) => {
    if (!Number.isSafeInteger(activeTopicId) || !Number.isSafeInteger(sessionId)) return
    navigate(`/topic/${activeTopicId}/lesson/${sessionId}`)
  }

  const model = buildTrailViewModel({
    dashboard,
    topics,
    reviewCounts,
    activeTopicId,
    currentChapterId: currentChapterId(dashboard),
    state: loading
      ? 'loading'
      : !topics?.length
        ? (error ? 'error' : 'empty')
        : error && !dashboard
          ? 'error'
          : dashboard?.topic?.resumeAvailable && !dashboard?.modules?.length
            ? 'setup'
            : dashboard?.topic?.status === 'completed'
              ? 'complete'
              : dashboard ? 'ready' : 'loading',
    loading,
    switching: switchingTopic,
    error,
  })

  return (
    <div className="min-h-screen ui-bg-canvas ui-text">
      <AppHeader dueCount={model.review.totalDue ?? reviewCounts?.totalDue} />
      <Suspense fallback={<DashboardSkeleton />}>
        <TrailView
          model={model}
          onSelectTopic={handleTopicSelect}
          onDeleteTopic={handleTopicDelete}
          onStartSession={handleStartSession}
          onStartCheckpoint={handleStartCheckpoint}
          onOpenFocusArea={handleOpenFocusArea}
          onRetry={init}
        />
      </Suspense>
    </div>
  )
}
