import { useCallback, useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ensureActivities, getLesson } from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import SessionPlayer from '../components/session/SessionPlayer.jsx'

function errorMessage(error) {
  if (error?.code === 'ACTIVITY_DOCUMENT_INVALID') return 'The saved Session activity could not be read safely. Return to your Trail or try loading it again.'
  if (error instanceof TypeError || /failed to fetch|network|connection/i.test(error?.message || '')) return 'Connection lost. Your saved Session progress is safe. Reconnect and retry.'
  return error?.message || 'The Session could not be loaded. Please try again.'
}

export default function SessionPage() {
  const { topicId = '', lessonId = '' } = useParams()
  const navigate = useNavigate()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [data, setData] = useState(null)
  const [generation, setGeneration] = useState(0)

  const loadSession = useCallback(async () => {
    setLoading(true)
    setError(null)
    setData(null)
    try {
      const sessionData = await getLesson(topicId, lessonId)
      if (sessionData.locked) {
        setData(sessionData)
        return
      }
      if (sessionData.activityDocument) {
        setData(sessionData)
        return
      }
      const generated = await ensureActivities(topicId, lessonId)
      setData({
        ...sessionData,
        activityDocument: generated.activityDocument,
        activityState: generated.activityState,
        activityProgress: generated.activityProgress,
        session: generated.session,
      })
    } catch (requestError) {
      setError(requestError)
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId, generation])

  useEffect(() => { loadSession() }, [loadSession])

  if (loading) {
    return <main className="session-page session-page-loading" aria-busy="true"><AppHeader variant="focus" title="Loading Session" returnTo="/" returnLabel="Trail" /><div className="session-loading-card" role="status">Preparing your Session…</div></main>
  }

  if (error) {
    const invalidDocument = error.code === 'ACTIVITY_DOCUMENT_INVALID'
    return (
      <main className="session-page">
        <AppHeader variant="focus" title="Session unavailable" returnTo="/" returnLabel="Trail" />
        <section className="session-error-panel" role="alert">
          <span className="session-error-icon" aria-hidden="true">↻</span>
          <h2>{invalidDocument ? 'Saved Session activity needs attention' : 'Let’s get you back to learning'}</h2>
          <p>{errorMessage(error)}</p>
          <div className="session-page-actions">
            <button type="button" className="ui-button ui-button-primary" onClick={() => setGeneration((value) => value + 1)}>Retry</button>
            <button type="button" className="ui-button ui-button-secondary" onClick={() => navigate('/')}>Back to Trail</button>
          </div>
        </section>
      </main>
    )
  }

  if (data?.locked) {
    return (
      <main className="session-page">
        <AppHeader variant="focus" title={data.lesson?.title || 'Locked Session'} detail={data.lesson?.module_title || ''} returnTo="/" returnLabel="Trail" />
        <section className="session-locked-panel" aria-labelledby="session-locked-title">
          <span className="session-lock-icon" aria-hidden="true">⌑</span>
          <h2 id="session-locked-title">Complete an earlier Session first</h2>
          <p>This Session will open when its prerequisites are complete.</p>
          <ul>{(data.unmetPrerequisites || data.prerequisites || []).map((item) => <li key={item.lessonId || item.title}>{item.title}</li>)}</ul>
          <button type="button" className="ui-button ui-button-primary" onClick={() => navigate('/')}>Back to Trail</button>
        </section>
      </main>
    )
  }

  return (
    <SessionPlayer
      topicId={topicId}
      lessonId={lessonId}
      session={data.lesson}
      progress={data.progress}
      messages={data.messages || []}
      activityDocument={data.activityDocument}
      activityState={data.activityState}
      activityProgress={data.activityProgress}
      artifactRequired={data.lesson?.artifact_required}
    />
  )
}
