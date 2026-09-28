import { Link } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'

export default function NotFoundPage() {
  return (
    <>
      <AppHeader />
      <main className="ui-page px-4 py-10 sm:py-16">
        <section className="ui-container ui-panel mx-auto max-w-xl p-6 text-center sm:p-10" aria-labelledby="not-found-title">
          <p className="text-sm font-semibold ui-text-muted">That page wandered off</p>
          <h1 id="not-found-title" className="mt-2 text-3xl font-bold ui-text">Page not found</h1>
          <p className="mt-3 ui-text-secondary">This page may have moved, or the address may be incomplete.</p>
          <Link className="ui-button ui-button-primary mt-6" to="/">Return to Trail</Link>
        </section>
      </main>
    </>
  )
}
