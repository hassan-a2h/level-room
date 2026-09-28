import { Suspense } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'
import { useContinuationController } from '../features/continuation/useContinuationController.js'
import { useThemeView, SceneSkeleton } from '../theme/ThemeProvider.jsx'

export default function ContinuationFlow() {
  const ContinuationView = useThemeView('ContinuationView')
  const { topicId } = useParams()
  const navigate = useNavigate()
  const { model } = useContinuationController({ topicId, navigate })

  return (
    <div className="ui-page min-h-screen">
      <AppHeader />
      <div className="ui-container mx-auto max-w-5xl space-y-5 px-4 py-6 sm:py-8">
        <Suspense fallback={<SceneSkeleton />}><ContinuationView model={model} /></Suspense>
      </div>
    </div>
  )
}
