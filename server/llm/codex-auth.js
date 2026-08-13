import { randomUUID } from 'node:crypto'
import { lookup as dnsLookup } from 'node:dns/promises'
import { isIP } from 'node:net'
import { createModels } from '@earendil-works/pi-ai'
import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'
import { createCodexCredentialStore, CODEX_PROVIDER_ID } from './codex-credential-store.js'

const DEFAULT_LOGIN_TIMEOUT_MS = 15 * 60 * 1000
const DEVICE_VERIFICATION_URI = 'https://auth.openai.com/codex/device'
const LOCAL_CALLBACK_HOST_ENV = 'PI_OAUTH_CALLBACK_HOST'
const CANCELLED = new Error('Codex sign-in cancelled.')
const callbackHostScopes = []
let callbackHostBase = null
const TRUSTED_UI_ORIGINS = [
  'http://localhost:3201',
  'http://127.0.0.1:3201',
  'http://[::1]:3201',
]

export function createCodexModels({ credentialStore = createCodexCredentialStore() } = {}) {
  const models = createModels({ credentials: credentialStore })
  models.setProvider(openaiCodexProvider())
  return models
}

export function createCodexAuth({
  store,
  models,
  lookupLocalhost = () => dnsLookup('localhost', { all: true, verbatim: true }),
  timeoutMs = DEFAULT_LOGIN_TIMEOUT_MS,
} = {}) {
  if (!store || !models || typeof models.login !== 'function') {
    throw new TypeError('Codex auth requires a credential store and Pi Models runtime.')
  }
  if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
    throw new TypeError('Codex login timeout must be a positive number.')
  }

  const flows = new Map()
  let activeFlowId = null
  let mutationQueue = Promise.resolve()

  function serializeMutation(operation) {
    const result = mutationQueue.then(operation, operation)
    mutationQueue = result.catch(() => {})
    return result
  }

  function pruneFlows(currentFlowId) {
    const terminalFlows = [...flows.values()].filter((flow) => flow.id !== currentFlowId && isTerminal(flow.state))
    for (const flow of terminalFlows.slice(0, Math.max(0, terminalFlows.length - 8))) {
      flows.delete(flow.id)
    }
  }

  function currentFlow(flowId) {
    const flow = flows.get(flowId)
    if (!flow) throw new CodexAuthError('CODEX_FLOW_NOT_FOUND', 'Codex sign-in session was not found.')
    return flow
  }

  function clearSensitiveFlowData(flow) {
    flow.authUrl = undefined
    flow.deviceCode = undefined
    flow.manualPrompt?.reject(CANCELLED)
    flow.manualPrompt = undefined
  }

  function cancelActiveFlow(reason = 'cancelled') {
    const flow = activeFlowId ? flows.get(activeFlowId) : undefined
    if (!flow || isTerminal(flow.state)) return undefined
    flow.cancelReason = reason
    flow.state = 'cancelled'
    flow.controller.abort(CANCELLED)
    flow.releaseCallbackHost?.()
    clearSensitiveFlowData(flow)
    if (activeFlowId === flow.id) activeFlowId = null
    return flow
  }

  async function canUseBrowserCallback() {
    try {
      const results = await lookupLocalhost()
      if (!Array.isArray(results) || results.length !== 1) return undefined
      const { address, family } = results[0] || {}
      if (family === 4 && address === '127.0.0.1') return address
      if (family === 6 && (address === '::1' || address === '0:0:0:0:0:0:0:1')) return address
    } catch {
      // Device code remains available when local DNS cannot be verified.
    }
    return undefined
  }

  async function withCallbackHost(address, operation, flow) {
    const release = acquireCallbackHostScope(address)
    flow.releaseCallbackHost = release
    try {
      return await operation()
    } finally {
      release()
      if (flow.releaseCallbackHost === release) flow.releaseCallbackHost = undefined
    }
  }

  function acquireCallbackHostScope(address) {
    if (callbackHostScopes.length === 0) {
      callbackHostBase = {
        hadOriginal: Object.hasOwn(process.env, LOCAL_CALLBACK_HOST_ENV),
        value: process.env[LOCAL_CALLBACK_HOST_ENV],
      }
    }
    const scope = { token: Symbol('callback-host-scope'), address }
    callbackHostScopes.push(scope)
    process.env[LOCAL_CALLBACK_HOST_ENV] = address
    let released = false
    return () => {
      if (released) return
      released = true
      const index = callbackHostScopes.findIndex((entry) => entry.token === scope.token)
      if (index < 0) return
      const wasTop = index === callbackHostScopes.length - 1
      callbackHostScopes.splice(index, 1)
      if (wasTop && process.env[LOCAL_CALLBACK_HOST_ENV] === address) {
        const activeScope = callbackHostScopes.at(-1)
        if (activeScope) process.env[LOCAL_CALLBACK_HOST_ENV] = activeScope.address
        else if (callbackHostBase?.hadOriginal) process.env[LOCAL_CALLBACK_HOST_ENV] = callbackHostBase.value
        else delete process.env[LOCAL_CALLBACK_HOST_ENV]
      }
      if (callbackHostScopes.length === 0) callbackHostBase = null
    }
  }

  function makeInteraction(flow) {
    return {
      signal: flow.controller.signal,
      prompt(prompt) {
        if (flow.controller.signal.aborted) return Promise.reject(CANCELLED)
        if (prompt?.type === 'select') return Promise.resolve(flow.mode)
        if (prompt?.type !== 'manual_code') {
          return Promise.reject(new CodexAuthError('CODEX_AUTH_PROMPT_UNSUPPORTED', 'Codex requested an unsupported sign-in step.'))
        }

        flow.state = 'awaiting_manual_code'
        return new Promise((resolve, reject) => {
          const signal = prompt.signal || flow.controller.signal
          const settle = (fn, value) => {
            signal.removeEventListener('abort', onAbort)
            if (flow.manualPrompt?.settle === settle) flow.manualPrompt = undefined
            fn(value)
          }
          const onAbort = () => settle(reject, CANCELLED)
          flow.manualPrompt = {
            settle,
            resolve: (value) => settle(resolve, value),
            reject: (error) => settle(reject, error),
          }
          signal.addEventListener('abort', onAbort, { once: true })
          if (signal.aborted) onAbort()
        })
      },
      notify(event) {
        if (event?.type === 'auth_url') {
          const authUrl = validateAuthUrl(event.url)
          if (authUrl) {
            flow.authUrl = authUrl
            flow.state = 'awaiting_browser'
          }
        }
        if (event?.type === 'device_code') {
          const userCode = typeof event.userCode === 'string' && /^[A-Z0-9-]{4,32}$/.test(event.userCode)
            ? event.userCode
            : undefined
          const verificationUri = event.verificationUri === DEVICE_VERIFICATION_URI
            ? DEVICE_VERIFICATION_URI
            : undefined
          if (userCode && verificationUri) {
            flow.deviceCode = {
              userCode,
              verificationUri,
              expiresInSeconds: clampInteger(event.expiresInSeconds, 1, 3600),
            }
            flow.state = 'awaiting_device_code'
          }
        }
      },
    }
  }

  function getFlowStatus(flowId) {
    const flow = flows.get(flowId)
    if (!flow) return null
    const status = {
      flowId: flow.id,
      state: flow.state,
      mode: flow.mode,
      fallbackReason: flow.fallbackReason,
      errorCode: flow.errorCode,
    }
    if (!isTerminal(flow.state)) {
      if (flow.authUrl) status.authUrl = flow.authUrl
      if (flow.deviceCode) status.deviceCode = { ...flow.deviceCode }
    }
    return status
  }

  function getRuntimeSnapshot() {
    try {
      const status = store.getStatusSync()
      return {
        connected: status.connected,
        status: status.connected ? 'connected' : 'disconnected',
        credentialGeneration: status.connected ? status.credentialGeneration : undefined,
      }
    } catch (error) {
      return { connected: false, status: 'unavailable', credentialGeneration: undefined, errorCode: safeStoreErrorCode(error) }
    }
  }

  function getConnectionStatus() {
    const { credentialGeneration, ...status } = getRuntimeSnapshot()
    return status
  }

  function startLogin(requestedMode = 'browser') {
    if (!['browser', 'device_code'].includes(requestedMode)) {
      return Promise.reject(new CodexAuthError('CODEX_LOGIN_MODE_INVALID', 'Select a supported Codex sign-in method.'))
    }

    return serializeMutation(async () => {
      cancelActiveFlow('superseded')
      let mode = requestedMode
      let callbackHost
      let fallbackReason
      if (requestedMode === 'browser') {
        callbackHost = await canUseBrowserCallback()
        if (!callbackHost) {
          mode = 'device_code'
          fallbackReason = 'browser_callback_unavailable'
        }
      }

      const flowEpoch = await store.beginFlow()
      const flow = {
        id: randomUUID(),
        flowEpoch,
        mode,
        requestedMode,
        fallbackReason,
        state: 'starting',
        controller: new AbortController(),
        manualPrompt: undefined,
        authUrl: undefined,
        deviceCode: undefined,
        errorCode: undefined,
        cancelReason: undefined,
      }
      flows.set(flow.id, flow)
      pruneFlows(flow.id)
      activeFlowId = flow.id
      flow.timeout = setTimeout(() => {
        if (isTerminal(flow.state)) return
        flow.cancelReason = 'timeout'
        flow.state = 'failed'
        flow.errorCode = 'CODEX_LOGIN_TIMEOUT'
        flow.controller.abort(new CodexAuthError('CODEX_LOGIN_TIMEOUT', 'Codex sign-in timed out.'))
        flow.releaseCallbackHost?.()
        clearSensitiveFlowData(flow)
        if (activeFlowId === flow.id) activeFlowId = null
        void serializeMutation(() => store.beginFlow()).catch(() => {})
      }, timeoutMs)
      void runLogin(flow, callbackHost)
      return { flowId: flow.id, state: flow.state, mode: flow.mode, fallbackReason }
    })
  }

  async function runLogin(flow, callbackHost) {
    const interaction = makeInteraction(flow)
    const execute = () => store.runWithFlowEpoch(
      flow.flowEpoch,
      () => models.login(CODEX_PROVIDER_ID, 'oauth', interaction),
    )
    try {
      if (flow.mode === 'browser' && callbackHost) await withCallbackHost(callbackHost, execute, flow)
      else await execute()
      if (flow.cancelReason === 'timeout') {
        flow.state = 'failed'
        flow.errorCode = 'CODEX_LOGIN_TIMEOUT'
      } else if (!isTerminal(flow.state)) {
        flow.state = 'complete'
      }
    } catch (error) {
      if (flow.cancelReason === 'timeout') {
        flow.state = 'failed'
        flow.errorCode = 'CODEX_LOGIN_TIMEOUT'
      } else if (flow.cancelReason || flow.controller.signal.aborted) {
        flow.state = 'cancelled'
      } else {
        flow.state = 'failed'
        flow.errorCode = error instanceof CodexAuthError ? error.code : safeStoreErrorCode(error) || 'CODEX_LOGIN_FAILED'
      }
    } finally {
      clearTimeout(flow.timeout)
      clearSensitiveFlowData(flow)
      if (activeFlowId === flow.id) activeFlowId = null
    }
  }

  async function submitManualCode(flowId, code) {
    const flow = currentFlow(flowId)
    if (flow.state !== 'awaiting_manual_code' || !flow.manualPrompt) {
      throw new CodexAuthError('CODEX_MANUAL_CODE_NOT_REQUESTED', 'Codex is not waiting for an authorization code.')
    }
    if (typeof code !== 'string' || code.trim().length === 0 || code.length > 8192 || /[\u0000-\u001f\u007f]/.test(code)) {
      throw new CodexAuthError('CODEX_MANUAL_CODE_INVALID', 'Enter a valid Codex authorization code or redirect URL.')
    }
    flow.manualPrompt.resolve(code.trim())
    return { accepted: true }
  }

  async function cancelFlow(flowId) {
    return serializeMutation(async () => {
      const flow = currentFlow(flowId)
      if (!isTerminal(flow.state)) {
        if (activeFlowId === flowId) cancelActiveFlow('cancelled')
        await store.beginFlow()
      }
      return getFlowStatus(flowId)
    })
  }

  async function disconnect() {
    return serializeMutation(async () => {
      cancelActiveFlow('cancelled')
      await store.disconnect()
      return getConnectionStatus()
    })
  }

  function captureCredentialGeneration() {
    return getRuntimeSnapshot().credentialGeneration
  }

  function runWithCredentialGeneration(generation, callback) {
    return store.runWithCredentialGeneration(generation, callback)
  }

  return {
    startLogin,
    getFlowStatus,
    getConnectionStatus,
    getRuntimeSnapshot,
    submitManualCode,
    cancelFlow,
    disconnect,
    captureCredentialGeneration,
    runWithCredentialGeneration,
  }
}

export function isTrustedLocalAuthRequest(req, {
  apiPort = process.env.PORT || '3200',
  uiOrigins = getTrustedUiOrigins(),
} = {}) {
  if (!isLoopbackAddress(req?.socket?.remoteAddress)) return false
  const host = req?.headers?.host
  const origin = req?.headers?.origin
  if (typeof host !== 'string' || typeof origin !== 'string') return false

  let hostUrl
  let originUrl
  try {
    hostUrl = new URL(`http://${host}`)
    originUrl = new URL(origin)
  } catch {
    return false
  }

  const hostName = hostUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  const port = hostUrl.port || '80'
  const isLoopback = ['localhost', '127.0.0.1', '::1'].includes(hostName)
  if (!isLoopback || port !== String(apiPort)) return false
  if (!['http:', 'https:'].includes(originUrl.protocol)) return false
  const originHost = originUrl.hostname.replace(/^\[|\]$/g, '').toLowerCase()
  if (!['localhost', '127.0.0.1', '::1'].includes(originHost)) return false
  return origin === originUrl.origin && uiOrigins.includes(originUrl.origin)
}

function isLoopbackAddress(address) {
  if (typeof address !== 'string') return false
  const normalized = address.toLowerCase()
  const version = isIP(normalized)
  if (version === 4) return isLoopbackIpv4(normalized)
  if (version !== 6) return false

  const words = expandIpv6Address(normalized)
  if (!words) return false
  if (words.slice(0, 7).every((word) => word === 0) && words[7] === 1) return true
  if (!words.slice(0, 5).every((word) => word === 0) || words[5] !== 0xffff) return false

  const octets = [words[6] >> 8, words[6] & 0xff, words[7] >> 8, words[7] & 0xff]
  return isLoopbackIpv4(octets.join('.'))
}

function expandIpv6Address(address) {
  const embeddedIpv4 = address.match(/(\d{1,3}(?:\.\d{1,3}){3})$/)
  let normalized = address
  if (embeddedIpv4) {
    if (isIP(embeddedIpv4[1]) !== 4) return undefined
    const [first, second, third, fourth] = embeddedIpv4[1].split('.').map(Number)
    const high = ((first << 8) | second).toString(16)
    const low = ((third << 8) | fourth).toString(16)
    normalized = `${address.slice(0, -embeddedIpv4[1].length)}${high}:${low}`
  }

  const halves = normalized.split('::')
  if (halves.length > 2) return undefined
  const left = halves[0] ? halves[0].split(':').map((part) => Number.parseInt(part, 16)) : []
  const right = halves.length === 2 && halves[1]
    ? halves[1].split(':').map((part) => Number.parseInt(part, 16))
    : []
  const missing = 8 - left.length - right.length
  if (missing < (halves.length === 2 ? 1 : 0)) return undefined
  const words = [...left, ...Array(missing).fill(0), ...right]
  if (words.length !== 8 || words.some((word) => !Number.isInteger(word) || word < 0 || word > 0xffff)) {
    return undefined
  }
  return words
}

function isLoopbackIpv4(address) {
  return isIP(address) === 4 && Number(address.split('.')[0]) === 127
}

export class CodexAuthError extends Error {
  constructor(code, message) {
    super(message)
    this.name = 'CodexAuthError'
    this.code = code
  }
}

function isTerminal(state) {
  return ['complete', 'failed', 'cancelled'].includes(state)
}

function validateAuthUrl(value) {
  if (typeof value !== 'string' || value.length > 4096) return undefined
  try {
    const url = new URL(value)
    if (url.protocol !== 'https:' || url.hostname !== 'auth.openai.com' || url.username || url.password) return undefined
    return url.toString()
  } catch {
    return undefined
  }
}

function clampInteger(value, min, max) {
  return Number.isSafeInteger(value) ? Math.min(max, Math.max(min, value)) : undefined
}

function safeStoreErrorCode(error) {
  const code = error?.code
  if (typeof code === 'string' && code.startsWith('CODEX_CREDENTIAL_STORE_')) return code
  if (code === 'CODEX_STALE_FLOW') return code
  if (code === 'CODEX_CREDENTIAL_CHANGED') return code
  return undefined
}

function getTrustedUiOrigins() {
  const configured = process.env.ROADMAP_UI_ORIGINS
  if (!configured) return TRUSTED_UI_ORIGINS
  return configured.split(',').map((origin) => origin.trim()).filter(Boolean)
}

const defaultStore = createCodexCredentialStore()
const defaultModels = createCodexModels({ credentialStore: defaultStore })
export const codexModels = defaultModels
export const codexAuth = createCodexAuth({ store: defaultStore, models: defaultModels })
