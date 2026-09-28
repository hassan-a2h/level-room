import { lazy, Suspense } from 'react'
import { BrowserRouter, Route, Routes } from 'react-router-dom'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import OfflineIndicator from './components/OfflineIndicator.jsx'
import AppShell from './components/layout/AppShell.jsx'

const Dashboard = lazy(() => import('./pages/Dashboard.jsx'))
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'))
const OnboardingFlow = lazy(() => import('./pages/OnboardingFlow.jsx'))
const ContinuationFlow = lazy(() => import('./pages/ContinuationFlow.jsx'))
const SessionPage = lazy(() => import('./pages/SessionPage.jsx'))
const ReviewQueue = lazy(() => import('./pages/ReviewQueue.jsx'))
const ReviewSession = lazy(() => import('./components/ReviewSession.jsx'))
const CheckpointPage = lazy(() => import('./pages/CheckpointPage.jsx'))
const NotFoundPage = lazy(() => import('./pages/NotFoundPage.jsx'))

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <AppShell>
          <OfflineIndicator />
          <Suspense fallback={<main className="ui-page p-6" role="status">Loading your learning space…</main>}>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/onboarding" element={<OnboardingFlow />} />
              <Route path="/topic/:topicId/continue" element={<ContinuationFlow />} />
              <Route path="/settings" element={<SettingsPage />} />
              <Route path="/reviews" element={<ReviewQueue />} />
              <Route path="/review/:sessionId" element={<ReviewSession />} />
              <Route path="/topic/:topicId/lesson/:lessonId" element={<SessionPage />} />
              <Route path="/topic/:topicId/chapter/:moduleId/checkpoint" element={<CheckpointPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </AppShell>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
