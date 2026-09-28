import { Suspense } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { SkeletonCard } from '../components/Skeleton.jsx'
import { useTrailController } from '../features/trail/useTrailController.js'
import { useThemeView } from '../theme/ThemeProvider.jsx'

function DashboardSkeleton() {
  return <div className="mx-auto max-w-7xl px-4 py-6" aria-busy="true"><h1 className="mb-5 text-2xl font-semibold ui-text">Your learning Trail</h1><SkeletonCard count={3} /></div>
}

export default function Dashboard() {
  const location = useLocation()
  const navigate = useNavigate()
  const TrailView = useThemeView('TrailView')
  const { model, actions } = useTrailController({ search: location.search, navigate })

  return (
    <div className="min-h-screen ui-bg-canvas ui-text">
      <AppHeader dueCount={model.review.totalDue} />
      <Suspense fallback={<DashboardSkeleton />}>
        <TrailView model={model} onSelectTopic={actions.selectTopic} onDeleteTopic={actions.deleteTopic} onStartSession={actions.startSession} onStartCheckpoint={actions.startCheckpoint} onOpenFocusArea={actions.openFocusArea} onRetry={actions.retry} />
      </Suspense>
    </div>
  )
}
