import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getDashboard, getLocalDate, getLocalTimeZone } from '../api.js'
import AppHeader from '../components/AppHeader.jsx'
import ExamPanel from '../components/ExamPanel.jsx'
import { toPublicError } from '../lib/publicError.js'

function positiveIntegerId(value) {
  if (typeof value !== 'string' || !/^[1-9]\d*$/.test(value)) return null
  const id = Number(value)
  return Number.isSafeInteger(id) ? id : null
}

export default function CheckpointPage() {
  const { topicId: topicIdParam, moduleId: moduleIdParam } = useParams()
  const topicId = positiveIntegerId(topicIdParam)
  const moduleId = positiveIntegerId(moduleIdParam)
  const [state, setState] = useState({ phase: 'loading', chapter: null, error: '' })

  useEffect(() => {
    let active = true
    if (topicId === null || moduleId === null) {
      setState({ phase: 'not-found', chapter: null, error: '' })
      return () => { active = false }
    }

    setState({ phase: 'loading', chapter: null, error: '' })
    getDashboard(topicId, getLocalDate(), getLocalTimeZone())
      .then((dashboard) => {
        const chapter = Array.isArray(dashboard?.modules)
          ? dashboard.modules.find((item) => Number(item.id) === moduleId)
          : null
        if (active) setState(chapter
          ? { phase: 'ready', chapter, error: '' }
          : { phase: 'not-found', chapter: null, error: '' })
      })
      .catch((error) => {
        if (active) setState({ phase: 'error', chapter: null, error: toPublicError(error, 'Could not load this Chapter.').message })
      })
    return () => { active = false }
  }, [moduleId, topicId])

  if (state.phase === 'not-found') return <NotFoundCheckpoint />

  return (
    <div className="min-h-screen ui-bg-canvas ui-text">
      <AppHeader variant="focus" title={state.chapter?.title || 'Chapter checkpoint'} returnTo="/" returnLabel="Trail" />
      <main className="mx-auto max-w-5xl px-4 py-6 sm:py-8" aria-busy={state.phase === 'loading'}>
        {state.phase === 'loading' && <p role="status" className="ui-text-secondary">Loading this Chapter…</p>}
        {state.phase === 'error' && <p role="alert" className="ui-alert ui-alert-danger">{state.error}</p>}
        {state.phase === 'ready' && (
          <section className="ui-surface ui-surface-raised p-4 sm:p-6" aria-label="Chapter checkpoint">
            <ExamPanel
              topicId={topicId}
              moduleId={moduleId}
              moduleTitle={state.chapter.title || ''}
              chapterOutcomes={Array.isArray(state.chapter.skill_outcomes) ? state.chapter.skill_outcomes : []}
              moduleLessons={Array.isArray(state.chapter.lessons) ? state.chapter.lessons : []}
            />
          </section>
        )}
      </main>
    </div>
  )
}

function NotFoundCheckpoint() {
  return (
    <>
      <AppHeader />
      <main className="ui-page px-4 py-10 sm:py-16">
        <section className="ui-container ui-panel mx-auto max-w-xl p-6 text-center sm:p-10" aria-labelledby="checkpoint-not-found-title">
          <h1 id="checkpoint-not-found-title" className="text-3xl font-bold ui-text">Page not found</h1>
          <p className="mt-3 ui-text-secondary">That Chapter checkpoint isn’t available on this Trail.</p>
          <Link className="ui-button ui-button-primary mt-6" to="/">Return to Trail</Link>
        </section>
      </main>
    </>
  )
}
