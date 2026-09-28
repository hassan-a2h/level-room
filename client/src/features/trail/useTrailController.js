import { useCallback, useEffect, useRef, useState } from 'react'
import { deleteTopic, getDashboard, getDefaultTopic, getLocalDate, getLocalTimeZone, getReviewCount, getTopics, selectTopic } from '../../api.js'
import { toPublicError } from '../../lib/publicError.js'
import { buildTrailViewModel } from './controller.js'

function requestedTopicId(search) {
  const value = new URLSearchParams(search).get('topicId')
  if (!value || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

function currentChapterId(dashboard) {
  const actionId = dashboard?.nextAction?.moduleId
  if (Number.isSafeInteger(actionId)) return actionId
  const chapters = Array.isArray(dashboard?.modules) ? dashboard.modules : []
  return chapters.find((chapter) => chapter.status !== 'completed')?.id ?? null
}

export function useTrailController({ search = '', navigate }) {
  const [topics, setTopics] = useState(null)
  const [activeTopicId, setActiveTopicId] = useState(null)
  const [dashboard, setDashboard] = useState(null)
  const [reviewCounts, setReviewCounts] = useState(null)
  const [loading, setLoading] = useState(true)
  const [switching, setSwitching] = useState(false)
  const [error, setError] = useState('')
  const requestRef = useRef(0)

  const loadDashboard = useCallback(async (topicId) => {
    const requestId = ++requestRef.current
    try {
      const data = await getDashboard(topicId, getLocalDate(), getLocalTimeZone())
      if (requestId === requestRef.current) {
        setDashboard(data)
        setActiveTopicId(topicId)
      }
      return data
    } catch (requestError) {
      if (requestId === requestRef.current) setError(toPublicError(requestError, 'Failed to load your Trail.').message)
      throw requestError
    }
  }, [])

  const retry = useCallback(async () => {
    setLoading(true)
    setError('')
    setTopics(null)
    setDashboard(null)
    try {
      const [topicResponse, reviewResponse] = await Promise.all([getTopics(), getReviewCount().catch(() => null)])
      const topicList = Array.isArray(topicResponse?.topics) ? topicResponse.topics : []
      setTopics(topicList)
      setReviewCounts(reviewResponse)
      if (topicList.length === 0) {
        setActiveTopicId(null)
        return
      }
      const requestedId = requestedTopicId(search)
      const requested = requestedId === null ? null : topicList.find((topic) => topic.id === requestedId)
      let topic = requested
      if (requested) await selectTopic(requested.id)
      else {
        try {
          const response = await getDefaultTopic()
          topic = topicList.find((item) => item.id === response?.topic?.id) || topicList[0]
        } catch {
          topic = topicList[0]
        }
      }
      await loadDashboard(topic.id)
    } catch (requestError) {
      setError((current) => current || toPublicError(requestError, 'Failed to load your Trail.').message)
    } finally {
      setLoading(false)
    }
  }, [loadDashboard, search])

  useEffect(() => {
    retry()
    return () => { requestRef.current += 1 }
  }, [retry])

  const select = useCallback(async (topicId) => {
    if (topicId === activeTopicId || !Number.isSafeInteger(topicId)) return
    setSwitching(true)
    setError('')
    try {
      await selectTopic(topicId)
      await loadDashboard(topicId)
    } catch (requestError) {
      setError(toPublicError(requestError, 'Could not switch Trails. Try again.').message)
    } finally {
      setSwitching(false)
    }
  }, [activeTopicId, loadDashboard])

  const remove = useCallback(async (topicId) => {
    const topic = topics?.find((item) => item.id === topicId)
    if (!topic || topic.hasChildren || !globalThis.confirm(`Delete “${topic.title}” and its learning progress? This cannot be undone.`)) return
    setError('')
    try {
      await deleteTopic(topicId)
      const response = await getTopics()
      const remaining = Array.isArray(response?.topics) ? response.topics : []
      setTopics(remaining)
      if (!remaining.length) {
        setDashboard(null)
        setActiveTopicId(null)
      } else if (topicId === activeTopicId) {
        await selectTopic(remaining[0].id)
        await loadDashboard(remaining[0].id)
      }
    } catch (requestError) {
      setError(requestError?.code === 'COURSE_HAS_CHILDREN'
        ? 'This Track anchors a later Track and cannot be deleted.'
        : toPublicError(requestError, 'Could not delete this Trail.').message)
    }
  }, [activeTopicId, loadDashboard, topics])

  const go = (suffix, id) => {
    if (Number.isSafeInteger(activeTopicId) && Number.isSafeInteger(id)) navigate(`/topic/${activeTopicId}/${suffix}/${id}`)
  }
  const modelState = loading ? 'loading' : !topics?.length ? (error ? 'error' : 'empty') : error && !dashboard ? 'error' : dashboard?.topic?.resumeAvailable && !dashboard?.modules?.length ? 'setup' : dashboard?.topic?.status === 'completed' ? 'complete' : dashboard ? 'ready' : 'loading'
  const model = buildTrailViewModel({ dashboard, topics, reviewCounts, activeTopicId, currentChapterId: currentChapterId(dashboard), state: modelState, loading, switching, error })

  return {
    model,
    actions: {
      selectTopic: select,
      deleteTopic: remove,
      startSession: (session) => go('lesson', session?.id),
      startCheckpoint: (chapterId) => {
        if (Number.isSafeInteger(activeTopicId) && Number.isSafeInteger(chapterId)) navigate(`/topic/${activeTopicId}/chapter/${chapterId}/checkpoint`)
      },
      openFocusArea: (sessionId) => go('lesson', sessionId),
      retry,
    },
  }
}
