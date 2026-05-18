import { useState, useEffect, useRef } from 'react'

const API_BASE = 'http://localhost:3200'
const CHECK_INTERVAL_MS = 15000

export default function OfflineIndicator() {
  const [online, setOnline] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const intervalRef = useRef(null)

  useEffect(() => {
    async function checkHealth() {
      try {
        const controller = new AbortController()
        const timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(`${API_BASE}/health`, {
          method: 'GET',
          signal: controller.signal,
        })
        clearTimeout(timeout)
        setOnline(res.ok)
      } catch {
        setOnline(false)
      }
    }

    // Check immediately on mount
    checkHealth()

    intervalRef.current = setInterval(checkHealth, CHECK_INTERVAL_MS)

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current)
      }
    }
  }, [])

  // Reset dismissal when coming back online then offline again
  useEffect(() => {
    if (online) {
      setDismissed(false)
    }
  }, [online])

  if (online || dismissed) return null

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[100] bg-amber-50 border-b border-amber-200 px-4 py-2 text-sm text-amber-800 flex items-center justify-center gap-3"
      role="status"
      data-testid="offline-banner"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
        Cannot reach the learning engine. Make sure the server is running on port 3200.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="text-amber-700 hover:text-amber-900 underline text-xs"
      >
        Dismiss
      </button>
    </div>
  )
}
