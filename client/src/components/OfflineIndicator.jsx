import { useState, useEffect, useRef } from 'react'
import { toPublicError } from '../lib/publicError.js'

const API_BASE = 'http://localhost:3200'
const CHECK_INTERVAL_MS = 15000

export default function OfflineIndicator() {
  const [online, setOnline] = useState(true)
  const [dismissed, setDismissed] = useState(false)
  const [checking, setChecking] = useState(false)
  const [failureKind, setFailureKind] = useState(null)
  const intervalRef = useRef(null)
  const retryRef = useRef(null)

  useEffect(() => {
    async function checkHealth() {
      setChecking(true)
      let timeout
      try {
        const controller = new AbortController()
        timeout = setTimeout(() => controller.abort(), 5000)
        const res = await fetch(`${API_BASE}/health`, {
          method: 'GET',
          signal: controller.signal,
        })
        if (res.ok) {
          setFailureKind(null)
          setOnline(true)
        } else {
          setFailureKind(toPublicError({ status: res.status }, 'Learning service is unavailable.').kind)
          setOnline(false)
        }
      } catch (requestError) {
        setFailureKind(toPublicError(requestError, 'Learning service is unavailable.').kind)
        setOnline(false)
      } finally {
        clearTimeout(timeout)
        setChecking(false)
      }
    }

    retryRef.current = checkHealth
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
      data-error-kind={failureKind || 'offline'}
      style={{ position: 'fixed', insetInline: 0, top: 0 }}
    >
      <span className="inline-flex flex-wrap items-center gap-1.5">
        <span className="ui-warning-dot w-2 h-2 rounded-full" aria-hidden="true" />
        <span>Learning service is unavailable. Saved learning data remains on this device. We’ll retry automatically.</span>
      </span>
      <button
        onClick={() => { setDismissed(false); retryRef.current?.() }}
        disabled={checking}
        className="ui-text-link underline text-xs font-medium disabled:opacity-60"
      >
        {checking ? 'Checking…' : 'Retry connection'}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="ui-text-link underline text-xs font-medium"
      >
        Dismiss
      </button>
    </div>
  )
}
