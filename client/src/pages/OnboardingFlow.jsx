import { Suspense } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { SkeletonOnboarding } from '../components/Skeleton.jsx'
import AppHeader from '../components/AppHeader.jsx'
import { useOnboardingController } from '../features/onboarding/useOnboardingController.js'
import { useThemeView, SceneSkeleton } from '../theme/ThemeProvider.jsx'

export default function OnboardingFlow() {
  const OnboardingView = useThemeView('OnboardingView')
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const { model, recoveryLoading } = useOnboardingController({ navigate, recoveryTopicId: searchParams.get('topicId') })

  if (recoveryLoading) return <SkeletonOnboarding />
  return (
    <div className="ui-page ui-onboarding-page min-h-screen">
      <AppHeader />
      <div className="ui-container ui-onboarding-container mx-auto max-w-4xl px-4 py-6 sm:py-8">
        <Suspense fallback={<SceneSkeleton />}><OnboardingView model={model} /></Suspense>
      </div>
    </div>
  )
}
