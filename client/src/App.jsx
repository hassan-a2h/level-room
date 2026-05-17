import { BrowserRouter, Routes, Route } from 'react-router-dom'
import SettingsPage from './pages/SettingsPage'
import Dashboard from './pages/Dashboard'
import OnboardingFlow from './pages/OnboardingFlow'

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Dashboard />} />
        <Route path="/onboarding" element={<OnboardingFlow />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
