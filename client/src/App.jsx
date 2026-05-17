import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import SettingsPage from './pages/SettingsPage'

function Home() {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">Mastery Roadmap</h1>
      <p className="text-lg text-gray-600 mb-8">
        Your LLM-powered personal learning engine.
      </p>
      <Link
        to="/settings"
        className="inline-flex items-center rounded-md border border-transparent bg-indigo-600 px-4 py-2 text-sm font-medium text-white shadow-sm hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2"
      >
        ⚙️ Settings
      </Link>
    </div>
  )
}

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/settings" element={<SettingsPage />} />
      </Routes>
    </BrowserRouter>
  )
}

export default App
