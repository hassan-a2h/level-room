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
      className="ui-offline-banner ui-alert ui-alert-warning slide-down"
      role="status"
      data-testid="offline-banner"
    >
      <span className="inline-flex items-center gap-1.5">
        <span className="ui-warning-dot w-2 h-2 rounded-full animate-pulse" />
        Cannot reach the learning engine. Make sure the server is running on port 3200.
      </span>
      <button
        onClick={() => setDismissed(true)}
        className="ui-text-link underline text-xs font-medium"
      >
        Dismiss
      </button>
    </div>
  )
}
