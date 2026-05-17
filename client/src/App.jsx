import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SettingsPage from './pages/SettingsPage'
import Dashboard from './pages/Dashboard'
import OnboardingFlow from './pages/OnboardingFlow'
import LessonChat from './components/LessonChat.jsx'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/onboarding" element={<OnboardingFlow />} />
        <Route path="/settings" element={<SettingsPage />} />
        <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
