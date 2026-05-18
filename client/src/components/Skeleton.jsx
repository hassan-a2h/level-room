export function SkeletonText({ lines = 1, className = '' }) {
  return (
    <div className={`space-y-2 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-200 rounded animate-pulse"
          style={{ width: i === lines - 1 ? '75%' : '100%' }}
        />
      ))}
    </div>
  )
}

export function SkeletonCard({ count = 1 }) {
  return (
    <div className="space-y-4">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="h-5 bg-gray-200 rounded w-1/3 animate-pulse" />
            <div className="h-4 bg-gray-200 rounded w-12 animate-pulse" />
          </div>
          <div className="h-2 bg-gray-200 rounded w-full animate-pulse" />
          <div className="flex items-center justify-between">
            <div className="h-3 bg-gray-200 rounded w-20 animate-pulse" />
            <div className="h-3 bg-gray-200 rounded w-16 animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

export function SkeletonGraph() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6 min-h-[300px] space-y-4">
      <div className="h-6 bg-gray-200 rounded w-1/4 animate-pulse" />
      <div className="h-4 bg-gray-200 rounded w-1/3 animate-pulse" />
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4 pt-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div
            key={i}
            className="h-12 bg-gray-200 rounded-lg animate-pulse"
            style={{ animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  )
}

export function SkeletonLesson() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <div className="bg-white border-b border-gray-200 shrink-0 px-4 py-3">
        <div className="max-w-3xl mx-auto flex items-center gap-3">
          <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
          <div className="h-5 bg-gray-200 rounded w-32 animate-pulse" />
        </div>
      </div>
      <div className="bg-white border-b border-gray-200 shrink-0 px-4 py-3">
        <div className="max-w-3xl mx-auto space-y-2">
          <div className="h-4 bg-gray-200 rounded w-1/2 animate-pulse" />
          <div className="flex gap-2">
            <div className="h-5 bg-gray-200 rounded w-16 animate-pulse" />
            <div className="h-5 bg-gray-200 rounded w-20 animate-pulse" />
          </div>
        </div>
      </div>
      <div className="flex-1 px-4 py-4">
        <div className="max-w-3xl mx-auto space-y-4">
          <div className="flex justify-end">
            <div className="h-16 bg-gray-200 rounded-2xl w-[70%] animate-pulse" />
          </div>
          <div className="flex justify-start">
            <div className="h-24 bg-gray-200 rounded-2xl w-[80%] animate-pulse" />
          </div>
          <div className="flex justify-end">
            <div className="h-12 bg-gray-200 rounded-2xl w-[60%] animate-pulse" />
          </div>
          <div className="flex justify-start">
            <div className="h-20 bg-gray-200 rounded-2xl w-[75%] animate-pulse" />
          </div>
        </div>
      </div>
      <div className="border-t border-gray-200 bg-white px-4 py-3 shrink-0">
        <div className="max-w-3xl mx-auto flex items-end gap-2">
          <div className="flex-1 h-10 bg-gray-200 rounded-xl animate-pulse" />
          <div className="h-10 w-16 bg-gray-200 rounded-xl animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonQuiz() {
  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6 space-y-6">
        <div className="h-6 bg-gray-200 rounded w-24 animate-pulse" />
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-gray-200 bg-white p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div className="h-3 bg-gray-200 rounded w-24 animate-pulse" />
              <div className="h-3 bg-gray-200 rounded w-20 animate-pulse" />
            </div>
            <div className="h-4 bg-gray-200 rounded w-3/4 animate-pulse" />
            <div className="h-24 bg-gray-200 rounded-lg animate-pulse" />
          </div>
        ))}
        <div className="flex justify-center">
          <div className="h-10 w-32 bg-gray-200 rounded-lg animate-pulse" />
        </div>
      </div>
    </div>
  )
}

export function SkeletonOnboarding() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center px-4">
      <div className="h-8 bg-gray-200 rounded w-64 animate-pulse mb-4" />
      <div className="h-4 bg-gray-200 rounded w-80 animate-pulse mb-8" />
      <div className="w-full max-w-md space-y-3">
        <div className="h-12 bg-gray-200 rounded-lg animate-pulse" />
        <div className="h-12 bg-gray-200 rounded-lg animate-pulse" />
      </div>
    </div>
  )
}

export function SkeletonSettings() {
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto space-y-6">
        <div className="bg-white rounded-lg shadow p-6 space-y-5">
          <div className="h-7 bg-gray-200 rounded w-24 animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-24 animate-pulse" />
            <div className="h-10 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-16 animate-pulse" />
            <div className="h-10 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="space-y-2">
            <div className="h-4 bg-gray-200 rounded w-20 animate-pulse" />
            <div className="h-10 bg-gray-200 rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-gray-200 rounded animate-pulse" />
        </div>
      </div>
    </div>
  )
}
