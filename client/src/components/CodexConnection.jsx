import { useCallback, useEffect, useRef, useState } from 'react'
import {
  cancelCodexLogin,
  disconnectCodex,
  getCodexConnection,
  getCodexLoginStatus,
  startCodexLogin,
  submitCodexManualCode,
} from '../api.js'
import { toPublicError } from '../lib/publicError.js'

const DEVICE_URL = 'https://auth.openai.com/codex/device'

function trustedAuthUrl(value) {
  if (typeof value !== 'string') return ''
  try {
    const url = new URL(value)
    return url.protocol === 'https:' && url.hostname === 'auth.openai.com' && !url.username && !url.password
      ? url.toString()
      : ''
  } catch {
    return ''
  }
}

function flowMessage(flow) {
  if (flow.state === 'awaiting_device_code') return 'Enter this code on OpenAI to finish connecting.'
  if (flow.state === 'awaiting_manual_code') return 'Finish sign-in in your browser, then paste the returned code here.'
  return 'Waiting for OpenAI sign-in to finish…'
}

export default function CodexConnection({ onConnectionChange }) {
  const [connection, setConnection] = useState({ status: 'loading', connected: false })
  const [flow, setFlow] = useState(null)
  const [manualCode, setManualCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const alive = useRef(true)

  const refreshConnection = useCallback(async () => {
    const status = await getCodexConnection()
    if (alive.current) {
      setConnection(status)
      onConnectionChange?.(Boolean(status.connected))
    }
    return status
  }, [onConnectionChange])

  const updateFlow = useCallback(async (flowId) => {
    const status = await getCodexLoginStatus(flowId)
    if (!alive.current) return status
    if (['complete', 'failed', 'cancelled'].includes(status.state)) {
      setFlow(null)
      setManualCode('')
      if (status.state === 'failed') {
        setError(status.errorCode === 'CODEX_LOGIN_TIMEOUT'
          ? 'Sign-in timed out. Start a new sign-in or use device code.'
          : 'Codex sign-in failed. Try again or use device code.')
      }
      await refreshConnection().catch(() => {})
    } else {
      setFlow(status)
    }
    return status
  }, [refreshConnection])

  useEffect(() => {
    alive.current = true
    refreshConnection().catch(() => {
      if (alive.current) setConnection({ status: 'unavailable', connected: false })
    })
    return () => { alive.current = false }
  }, [refreshConnection])

  useEffect(() => {
    if (!flow?.flowId) return undefined
    const flowId = flow.flowId
    const timer = setInterval(() => {
      updateFlow(flowId).catch(() => {
        if (alive.current) setError('Could not check Codex sign-in status. Try again.')
      })
    }, 1200)
    return () => {
      clearInterval(timer)
      Promise.resolve(cancelCodexLogin(flowId)).catch(() => {})
    }
  }, [flow?.flowId, updateFlow])

  const beginLogin = useCallback(async (mode) => {
    setBusy(true)
    setError('')
    setManualCode('')
    try {
      const started = await startCodexLogin(mode)
      setFlow(started)
      await updateFlow(started.flowId)
    } catch (err) {
      setError(toPublicError(err, 'Could not start Codex sign-in.').message)
    } finally {
      if (alive.current) setBusy(false)
    }
  }, [updateFlow])

  async function handleCancel() {
    if (!flow) return
    setBusy(true)
    try {
      await cancelCodexLogin(flow.flowId)
      setFlow(null)
      setManualCode('')
      setError('')
    } catch (err) {
      setError(toPublicError(err, 'Could not cancel Codex sign-in.').message)
    } finally {
      setBusy(false)
    }
  }

  async function handleManualSubmit(event) {
    event.preventDefault()
    if (!flow || !manualCode.trim()) return
    setBusy(true)
    setError('')
    try {
      await submitCodexManualCode(flow.flowId, manualCode.trim())
      setManualCode('')
    } catch (err) {
      setError(toPublicError(err, 'Could not submit the authorization code.').message)
    } finally {
      setBusy(false)
    }
  }

  async function handleDisconnect() {
    if (!window.confirm('Disconnect Codex from this app? This removes its local sign-in data.')) return
    setBusy(true)
    setError('')
    try {
      const status = await disconnectCodex()
      setConnection(status)
      onConnectionChange?.(false)
    } catch (err) {
      setError(toPublicError(err, 'Could not disconnect Codex.').message)
    } finally {
      setBusy(false)
    }
  }

  async function copyDeviceCode() {
    try {
      await navigator.clipboard.writeText(flow.deviceCode.userCode)
      setError('')
    } catch {
      setError('Could not copy the device code. Select and copy it manually.')
    }
  }

  const authUrl = trustedAuthUrl(flow?.authUrl)
  const verificationUrl = flow?.deviceCode?.verificationUri === DEVICE_URL ? DEVICE_URL : ''

  return (
    <section className="ui-panel p-4 sm:p-5 space-y-3" aria-labelledby="codex-connection-heading">
      <div>
        <h3 id="codex-connection-heading" className="text-sm font-semibold ui-text">Codex subscription sign-in</h3>
        <p className="mt-1 text-sm ui-text-secondary" aria-live="polite">
          {connection.connected ? 'Connected to Codex.' : connection.status === 'loading' ? 'Checking Codex connection…' : connection.status === 'unavailable' ? 'Connection status unavailable.' : 'Not connected.'}
        </p>
      </div>

      {error && <p className="ui-alert ui-alert-danger text-sm" role="alert">{error}</p>}

      {!connection.connected && !flow && connection.status !== 'loading' && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-button ui-button-primary" disabled={busy} onClick={() => beginLogin('browser')}>
            {busy ? 'Starting…' : 'Connect with browser'}
          </button>
          <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={() => beginLogin('device_code')}>
            Use device code
          </button>
        </div>
      )}

      {connection.connected && !flow && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="ui-button ui-button-primary" disabled={busy} onClick={() => beginLogin('browser')}>
            Connect another account
          </button>
          <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={handleDisconnect}>
            Disconnect Codex
          </button>
        </div>
      )}

      {flow && (
        <div className="space-y-3" aria-live="polite">
          <p className="text-sm ui-text-secondary">{flowMessage(flow)}</p>
          {authUrl && (
            <a className="ui-button ui-button-primary inline-flex" href={authUrl} target="_blank" rel="noopener noreferrer">
              Continue with OpenAI
            </a>
          )}
          {flow.deviceCode?.userCode && (
            <div className="rounded-xl border ui-border bg-[var(--ui-surface-alt)] p-3 space-y-2">
              {verificationUrl && (
                <a href={verificationUrl} target="_blank" rel="noopener noreferrer" className="underline ui-text">
                  Open device verification
                </a>
              )}
              <div className="flex flex-wrap items-center gap-2">
                <code className="text-lg font-semibold tracking-widest ui-text">{flow.deviceCode.userCode}</code>
                <button type="button" className="ui-button ui-button-secondary" onClick={copyDeviceCode}>Copy device code</button>
              </div>
              {flow.deviceCode.expiresInSeconds && <p className="text-xs ui-text-muted">This code expires in about {Math.ceil(flow.deviceCode.expiresInSeconds / 60)} minutes.</p>}
            </div>
          )}
          {flow.state === 'awaiting_manual_code' && (
            <form className="space-y-2" onSubmit={handleManualSubmit}>
              <label htmlFor="codex-manual-code" className="ui-field-label">Authorization code</label>
              <input id="codex-manual-code" className="ui-field w-full" autoComplete="off" maxLength={8192} value={manualCode} onChange={(event) => setManualCode(event.target.value)} />
              <button type="submit" className="ui-button ui-button-primary" disabled={busy || !manualCode.trim()}>Submit code</button>
            </form>
          )}
          {flow.mode === 'browser' && <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={async () => {
            await handleCancel()
            await beginLogin('device_code')
          }}>Use device code instead</button>}
          <button type="button" className="ui-button ui-button-secondary" disabled={busy} onClick={handleCancel}>Cancel sign-in</button>
        </div>
      )}

      <p className="text-xs ui-text-muted">This experimental sign-in stores credentials on this computer. Disconnect removes them locally.</p>
    </section>
  )
}
