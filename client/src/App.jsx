import { useState, useEffect } from 'react'

function App() {
  const [health, setHealth] = useState(null)

  useEffect(() => {
    fetch('http://localhost:3200/health')
      .then(r => r.json())
      .then(data => setHealth(data))
      .catch(() => setHealth({ error: 'Backend unreachable' }))
  }, [])

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold text-gray-900 mb-4">Mastery Roadmap</h1>
      <p className="text-lg text-gray-600 mb-8">
        Your LLM-powered personal learning engine.
      </p>
      <div className="bg-white rounded-lg shadow p-6 w-full max-w-md">
        <h2 className="text-lg font-semibold mb-2">Backend Health</h2>
        {health === null ? (
          <p className="text-gray-500">Checking…</p>
        ) : health.error ? (
          <p className="text-red-600">{health.error}</p>
        ) : (
          <pre className="text-sm text-green-700 bg-green-50 p-2 rounded">
            {JSON.stringify(health, null, 2)}
          </pre>
        )}
      </div>
    </div>
  )
}

export default App
