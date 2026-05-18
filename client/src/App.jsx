import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SettingsPage from './pages/SettingsPage'
import Dashboard from './pages/Dashboard'
import OnboardingFlow from './pages/OnboardingFlow'
import LessonChat from './components/LessonChat.jsx'
import ReviewQueue from './pages/ReviewQueue.jsx'
import ReviewSession from './components/ReviewSession.jsx'
import ErrorBoundary from './components/ErrorBoundary.jsx'
import OfflineIndicator from './components/OfflineIndicator.jsx'

function App() {
  return (
    <BrowserRouter>
      <ErrorBoundary>
        <OfflineIndicator />
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/onboarding" element={<OnboardingFlow />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/reviews" element={<ReviewQueue />} />
          <Route path="/review/:sessionId" element={<ReviewSession />} />
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </ErrorBoundary>
    </BrowserRouter>
  )
}

export default App
