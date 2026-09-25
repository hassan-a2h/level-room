export function SkeletonText({ lines = 1, className = '' }) {
  return (
    <div role="status" aria-label="Loading text" aria-busy="true" className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          data-skeleton="text-line"
          className="h-4 bg-gray-200 rounded ui-skeleton"
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
        <div key={i} data-skeleton="card" className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 bg-gray-200 rounded w-1/3 ui-skeleton" />
            <div className="h-4 bg-gray-200 rounded w-12 ui-skeleton" />
          </div>
          <div className="h-2 bg-gray-200 rounded w-full ui-skeleton" />
          <div className="flex items-center justify-between">
            <div className="h-3 bg-gray-200 rounded w-20 ui-skeleton" />
            <div className="h-3 bg-gray-200 rounded w-16 ui-skeleton" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonGraph() {
  return (
    <div role="status" aria-label="Loading competence graph" aria-busy="true" className="rounded-xl border border-gray-200 bg-white p-6 min-h-[300px] space-y-4">
      <div className="h-6 bg-gray-200 rounded w-1/4 ui-skeleton" />
      <div className="h-4 bg-gray-200 rounded w-1/3 ui-skeleton" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
          key={i}
          data-skeleton="graph-node"
          className="h-12 bg-gray-200 rounded-lg ui-skeleton"
        />
        ))}
      </div>
    </div>
  )
}

export function SkeletonLesson() {
  return (
    <div role="status" aria-label="Loading lesson" aria-busy="true" className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-200 shrink-0 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="h-4 bg-gray-200 rounded w-24 ui-skeleton" />
          <div className="h-5 bg-gray-200 rounded w-32 ui-skeleton" />
        </div>
      </div>
      <div className="bg-white border-b border-gray-200 shrink-0 px-4 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2 ui-skeleton" />
          <div className="flex gap-2">
            <div className="h-5 bg-gray-200 rounded w-16 ui-skeleton" />
            <div className="h-5 bg-gray-200 rounded w-20 ui-skeleton" />
          </div>
        </div>
      </div>
      <div className="flex-1 px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex justify-end">
            <div className="h-16 bg-gray-200 rounded-2xl w-[70%] ui-skeleton" />
          </div>
          <div className="flex justify-start">
            <div className="h-24 bg-gray-200 rounded-2xl w-[80%] ui-skeleton" />
          </div>
          <div className="flex justify-end">
            <div className="h-12 bg-gray-200 rounded-2xl w-[60%] ui-skeleton" />
          </div>
          <div className="flex justify-start">
            <div className="h-20 bg-gray-200 rounded-2xl w-[75%] ui-skeleton" />
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <div className="flex-1 h-10 bg-gray-200 rounded-xl ui-skeleton" />
          <div className="h-10 w-16 bg-gray-200 rounded-xl ui-skeleton" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonQuiz() {
  return (
    <div role="status" aria-label="Loading quiz" aria-busy="true" className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="h-6 bg-gray-200 rounded w-24 ui-skeleton" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} data-skeleton="question" className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 bg-gray-200 rounded w-24 ui-skeleton" />
              <div className="h-3 bg-gray-200 rounded w-20 ui-skeleton" />
            </div>
            <div className="h-4 bg-gray-200 rounded w-3/4 ui-skeleton" />
            <div className="h-24 bg-gray-200 rounded-lg ui-skeleton" />
          </div>
        ))}
        <div className="flex justify-center">
          <div className="h-10 w-32 bg-gray-200 rounded-lg ui-skeleton" />
        </div>
      </div>
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
