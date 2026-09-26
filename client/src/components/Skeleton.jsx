export function SkeletonText({ lines = 1, className = '' }) {
  return (
    <div role="status" aria-label="Loading text" aria-busy="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          data-skeleton="text-line"
          className="h-4 rounded ui-skeleton"
          style={{ width: i === lines - 1 ? '75%' : '100%' }}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ count = 1 }) {
  return (
    <div role="status" aria-label="Loading learning cards" aria-busy="true" className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} data-skeleton="card" className="ui-surface ui-surface-raised rounded-xl p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 rounded w-1/3 ui-skeleton" />
            <div className="h-4 rounded w-12 ui-skeleton" />
          </div>
          <div className="h-2 rounded w-full ui-skeleton" />
          <div className="flex items-center justify-between">
            <div className="h-3 rounded w-20 ui-skeleton" />
            <div className="h-3 rounded w-16 ui-skeleton" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonOnboarding() {
  return (
    <div role="status" aria-label="Loading onboarding" aria-busy="true" className="ui-page min-h-screen">
      <header className="ui-app-header" aria-hidden="true">
        <div className="ui-header-inner">
          <div className="h-6 w-36 ui-skeleton" />
          <div className="hidden gap-3 sm:flex">
            {Array.from({ length: 4 }).map((_, i) => <div key={i} className="h-8 w-20 ui-skeleton" />)}
          </div>
        </div>
      </header>
      <main className="ui-container max-w-4xl px-4 py-6 sm:py-8" aria-hidden="true">
        <nav className="mb-8 space-y-3">
          <div className="h-4 w-20 ui-skeleton" />
          <ol className="ui-step-list">
            {Array.from({ length: 4 }).map((_, i) => (
              <li key={i}><span className="ui-step-marker ui-skeleton" /> <span className="h-3 w-14 ui-skeleton" /></li>
            ))}
          </ol>
        </nav>
        <section className="mx-auto flex min-h-[50vh] max-w-md flex-col items-center justify-center gap-4">
          <div className="h-8 w-64 ui-skeleton" />
          <div className="h-4 w-full ui-skeleton" />
          <div className="h-4 w-4/5 ui-skeleton" />
          <div className="h-12 w-full ui-skeleton" />
          <div className="h-12 w-full ui-skeleton" />
        </section>
      </main>
    </div>
  )
}

export function SkeletonSettings() {
  return (
    <div role="status" aria-label="Loading settings" aria-busy="true" className="ui-page min-h-screen">
      <header className="ui-app-header" aria-hidden="true">
        <div className="ui-header-inner">
          <div className="h-6 w-36 ui-skeleton" />
          <div className="hidden gap-3 sm:flex">
            {Array.from({ length: 5 }).map((_, i) => <div key={i} className="h-8 w-16 ui-skeleton" />)}
          </div>
        </div>
      </header>
      <main className="ui-container max-w-3xl space-y-6 px-4 py-6 sm:py-8" aria-hidden="true">
        <div className="h-9 w-36 ui-skeleton" />
        <section data-skeleton-section="appearance" className="ui-panel space-y-4 p-5 sm:p-6">
          <div className="h-6 w-28 ui-skeleton" />
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {Array.from({ length: 16 }).map((_, i) => <div key={i} className="h-20 ui-skeleton" />)}
          </div>
          <div className="h-10 w-36 ui-skeleton" />
        </section>
        <section data-skeleton-section="learning-preferences" className="ui-panel space-y-4 p-5 sm:p-6">
          <div className="h-6 w-48 ui-skeleton" />
          <div className="h-4 w-full ui-skeleton" />
          <div className="h-4 w-4/5 ui-skeleton" />
        </section>
        <section data-skeleton-section="ai-connection" className="ui-panel space-y-4 p-5 sm:p-6">
          <div className="h-6 w-40 ui-skeleton" />
          <div className="h-10 w-full ui-skeleton" />
          <div className="h-10 w-full ui-skeleton" />
          <div className="h-10 w-36 ui-skeleton" />
        </section>
        <section data-skeleton-section="data-privacy" className="ui-panel space-y-4 p-5 sm:p-6">
          <div className="h-6 w-40 ui-skeleton" />
          <div className="h-4 w-full ui-skeleton" />
          <div className="h-4 w-5/6 ui-skeleton" />
          <div className="h-10 w-48 ui-skeleton" />
        </section>
        <section data-skeleton-section="danger-zone" className="ui-panel space-y-4 p-5 sm:p-6">
          <div className="h-6 w-32 ui-skeleton" />
          <div className="h-4 w-full ui-skeleton" />
          <div className="h-10 w-36 ui-skeleton" />
        </section>
      </main>
    </div>
  )
}
