import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCodexAuth, isTrustedLocalAuthRequest } from '../llm/codex-auth.js'
import { createCodexCredentialStore } from '../llm/codex-credential-store.js'

const providerId = 'openai-codex'
const validCredential = {
  type: 'oauth',
  access: 'new-access-secret-fixture',
  refresh: 'new-refresh-secret-fixture',
  expires: 1_900_000_000_000,
  accountId: 'new-account-id-fixture',
}

describe('Codex auth flow manager', () => {
  const directories = new Set()
  const originalCallbackHost = process.env.PI_OAUTH_CALLBACK_HOST

  afterEach(async () => {
    if (originalCallbackHost === undefined) delete process.env.PI_OAUTH_CALLBACK_HOST
    else process.env.PI_OAUTH_CALLBACK_HOST = originalCallbackHost
    await Promise.all([...directories].map((directory) => fs.rm(directory, { recursive: true, force: true })))
    directories.clear()
    vi.useRealTimers()
  })

  async function setup(options = {}) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmap-codex-flow-'))
    directories.add(directory)
    const store = createCodexCredentialStore({ directory })
    const fake = createFakeModels(store, options)
    const auth = createCodexAuth({
      store,
      models: fake.models,
      lookupLocalhost: options.lookupLocalhost || (async () => [{ address: '127.0.0.1', family: 4 }]),
      timeoutMs: options.timeoutMs,
    })
    return { auth, store, fake }
  }

  it('completes an in-process browser OAuth flow and only returns safe status', async () => {
    const { auth, store, fake } = await setup()
    const { flowId } = await auth.startLogin('browser')

    await vi.waitFor(() => expect(auth.getFlowStatus(flowId)).toMatchObject({ state: 'awaiting_manual_code' }))
    expect(auth.getFlowStatus(flowId).authUrl).toMatch(/^https:\/\/auth\.openai\.com\//)
    expect(fake.models.login).toHaveBeenCalledWith(providerId, 'oauth', expect.any(Object))
    expect(fake.selectedModes).toEqual(['browser'])

    await expect(auth.submitManualCode(flowId, 'fixture-authorization-code')).resolves.toEqual({ accepted: true })
    await vi.waitFor(() => expect(auth.getFlowStatus(flowId)).toMatchObject({ state: 'complete' }))
    await expect(store.read(providerId)).resolves.toEqual(validCredential)

    const status = JSON.stringify(auth.getConnectionStatus()) + JSON.stringify(auth.getFlowStatus(flowId))
    expect(status).not.toContain(validCredential.access)
    expect(status).not.toContain(validCredential.refresh)
    expect(status).not.toContain(validCredential.accountId)
  })

  it('selects device-code login directly and exposes only the verification code needed by the user', async () => {
    const { auth, fake } = await setup()
    const { flowId } = await auth.startLogin('device_code')

    await vi.waitFor(() => expect(auth.getFlowStatus(flowId)).toMatchObject({ state: 'awaiting_device_code' }))
    expect(fake.selectedModes).toEqual(['device_code'])
    expect(auth.getFlowStatus(flowId).deviceCode).toEqual({
      userCode: 'ABCD-EFGH',
      verificationUri: 'https://auth.openai.com/codex/device',
      expiresInSeconds: 900,
    })
    fake.completeDeviceLogin()
    await vi.waitFor(() => expect(auth.getFlowStatus(flowId)).toMatchObject({ state: 'complete' }))
  })

  it('falls back to device-code login when localhost does not resolve to one loopback address', async () => {
    const { auth, fake } = await setup({
      lookupLocalhost: async () => [
        { address: '127.0.0.1', family: 4 },
        { address: '::1', family: 6 },
      ],
    })
    const { flowId } = await auth.startLogin('browser')

    await vi.waitFor(() => expect(auth.getFlowStatus(flowId)).toMatchObject({ state: 'awaiting_device_code' }))
    expect(fake.selectedModes).toEqual(['device_code'])
    expect(auth.getFlowStatus(flowId).fallbackReason).toBe('browser_callback_unavailable')
    fake.completeDeviceLogin()
    await vi.waitFor(() => expect(auth.getFlowStatus(flowId)).toMatchObject({ state: 'complete' }))
  })

  it('supersedes an active flow and rejects any late write from the old epoch', async () => {
    const { auth, store, fake } = await setup()
    const oldFlow = await auth.startLogin('browser')
    await vi.waitFor(() => expect(auth.getFlowStatus(oldFlow.flowId)).toMatchObject({ state: 'awaiting_manual_code' }))

    const nextFlow = await auth.startLogin('device_code')
    await vi.waitFor(() => expect(auth.getFlowStatus(nextFlow.flowId)).toMatchObject({ state: 'awaiting_device_code' }))
    expect(auth.getFlowStatus(oldFlow.flowId)).toMatchObject({ state: 'cancelled' })
    await expect(fake.completeFlowWithCredential(0)).rejects.toMatchObject({ code: 'CODEX_STALE_FLOW' })
    await expect(store.read(providerId)).resolves.toBeUndefined()
    await auth.cancelFlow(nextFlow.flowId)
  })

  it('cancels a flow and invalidates its epoch', async () => {
    const { auth, store, fake } = await setup()
    const flow = await auth.startLogin('browser')
    await vi.waitFor(() => expect(auth.getFlowStatus(flow.flowId)).toMatchObject({ state: 'awaiting_manual_code' }))

    await auth.cancelFlow(flow.flowId)

    expect(auth.getFlowStatus(flow.flowId)).toMatchObject({ state: 'cancelled' })
    await expect(fake.completeFlowWithCredential(0)).rejects.toMatchObject({ code: 'CODEX_STALE_FLOW' })
    await expect(store.read(providerId)).resolves.toBeUndefined()
  })

  it('preserves an existing credential when reauthentication fails', async () => {
    const { auth, store } = await setup({ failLogin: true })
    const firstEpoch = await store.beginFlow()
    await store.runWithFlowEpoch(firstEpoch, () => store.modify(providerId, async () => ({
      ...validCredential,
      access: 'existing-access-fixture',
      refresh: 'existing-refresh-fixture',
      accountId: 'existing-account-fixture',
    })))
    const flow = await auth.startLogin('browser')
    await vi.waitFor(() => expect(auth.getFlowStatus(flow.flowId)).toMatchObject({ state: 'awaiting_manual_code' }))
    await auth.submitManualCode(flow.flowId, 'fixture-authorization-code')
    await vi.waitFor(() => expect(auth.getFlowStatus(flow.flowId)).toMatchObject({ state: 'failed' }))

    expect(auth.getFlowStatus(flow.flowId).errorCode).toBe('CODEX_LOGIN_FAILED')
    const current = await store.read(providerId)
    expect(current.access).toBe('existing-access-fixture')
    expect(current.refresh).toBe('existing-refresh-fixture')
    expect(JSON.stringify(auth.getFlowStatus(flow.flowId))).not.toContain('sensitive-provider-error-fixture')
  })

  it('times out a stalled flow and returns a redacted terminal state', async () => {
    const { auth, store } = await setup({ timeoutMs: 10 })
    vi.useFakeTimers()
    const { flowId } = await auth.startLogin('browser')
    await vi.advanceTimersByTimeAsync(11)
    expect(auth.getFlowStatus(flowId)).toMatchObject({
      state: 'failed',
      errorCode: 'CODEX_LOGIN_TIMEOUT',
    })
    await vi.waitFor(() => expect(store.getStatusSync().flowEpoch).toBe(2))
  })

  it('marks a provider that ignores abort as timed out and blocks its eventual late credential write', async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmap-codex-hung-flow-'))
    directories.add(directory)
    const store = createCodexCredentialStore({ directory })
    let releaseLogin
    const loginGate = new Promise((resolve) => { releaseLogin = resolve })
    let resolveLateWrite
    const lateWrite = new Promise((resolve) => { resolveLateWrite = resolve })
    let callCount = 0
    const models = {
      login: vi.fn(async (providerIdArg) => {
        callCount += 1
        if (callCount > 1) return new Promise(() => {})
        await loginGate
        try {
          const credential = await store.modify(providerIdArg, async () => validCredential)
          resolveLateWrite({ credential })
          return credential
        } catch (error) {
          resolveLateWrite({ error })
          throw error
        }
      }),
    }
    const auth = createCodexAuth({
      store,
      models,
      lookupLocalhost: async () => [{ address: '127.0.0.1', family: 4 }],
      timeoutMs: 10,
    })

    const previousCallbackHost = process.env.PI_OAUTH_CALLBACK_HOST
    process.env.PI_OAUTH_CALLBACK_HOST = 'outer-callback-host-fixture'
    vi.useFakeTimers()
    const oldFlow = await auth.startLogin('browser')
    expect(process.env.PI_OAUTH_CALLBACK_HOST).toBe('127.0.0.1')
    await vi.advanceTimersByTimeAsync(11)
    expect(auth.getFlowStatus(oldFlow.flowId)).toMatchObject({ state: 'failed', errorCode: 'CODEX_LOGIN_TIMEOUT' })
    expect(process.env.PI_OAUTH_CALLBACK_HOST).toBe('outer-callback-host-fixture')

    const replacement = await auth.startLogin('browser')
    expect(process.env.PI_OAUTH_CALLBACK_HOST).toBe('127.0.0.1')
    releaseLogin()
    const lateResult = await lateWrite
    expect(lateResult.error).toMatchObject({ code: 'CODEX_STALE_FLOW' })
    await expect(store.read(providerId)).resolves.toBeUndefined()
    expect(process.env.PI_OAUTH_CALLBACK_HOST).toBe('127.0.0.1')
    expect(auth.getFlowStatus(oldFlow.flowId)).toMatchObject({ state: 'failed', errorCode: 'CODEX_LOGIN_TIMEOUT' })
    await auth.cancelFlow(replacement.flowId)
    expect(process.env.PI_OAUTH_CALLBACK_HOST).toBe('outer-callback-host-fixture')
    if (previousCallbackHost === undefined) delete process.env.PI_OAUTH_CALLBACK_HOST
    else process.env.PI_OAUTH_CALLBACK_HOST = previousCallbackHost
  })
})

describe('local Codex auth request guard', () => {
  const options = { apiPort: '3200', uiOrigins: ['http://localhost:3201'] }

  it('accepts only the configured local UI origin and loopback API host', () => {
    expect(isTrustedLocalAuthRequest({
      headers: { host: 'localhost:3200', origin: 'http://localhost:3201' },
      socket: { remoteAddress: '127.0.0.1' },
    }, options)).toBe(true)
    expect(isTrustedLocalAuthRequest({
      headers: { host: '192.168.1.10:3200', origin: 'http://localhost:3201' },
      socket: { remoteAddress: '127.0.0.1' },
    }, options)).toBe(false)
    expect(isTrustedLocalAuthRequest({
      headers: { host: 'localhost:3200', origin: 'http://evil.example' },
      socket: { remoteAddress: '127.0.0.1' },
    }, options)).toBe(false)
    expect(isTrustedLocalAuthRequest({
      headers: { host: 'localhost:3201', origin: 'http://localhost:3201' },
      socket: { remoteAddress: '127.0.0.1' },
    }, options)).toBe(false)
    expect(isTrustedLocalAuthRequest({ headers: { host: 'localhost:3200' } }, options)).toBe(false)
  })

  it('rejects forged local headers from a non-loopback client', () => {
    expect(isTrustedLocalAuthRequest({
      headers: { host: 'localhost:3200', origin: 'http://localhost:3201' },
      socket: { remoteAddress: '192.168.1.44' },
    }, options)).toBe(false)
    expect(isTrustedLocalAuthRequest({
      headers: { host: 'localhost:3200', origin: 'http://localhost:3201' },
    }, options)).toBe(false)
  })

  it('accepts IPv4-mapped loopback and rejects IPv4-mapped LAN clients', () => {
    const request = (remoteAddress) => ({
      headers: { host: 'localhost:3200', origin: 'http://localhost:3201' },
      socket: { remoteAddress },
    })
    expect(isTrustedLocalAuthRequest(request('::ffff:127.0.0.1'), options)).toBe(true)
    expect(isTrustedLocalAuthRequest(request('::ffff:7f00:1'), options)).toBe(true)
    expect(isTrustedLocalAuthRequest(request('0:0:0:0:0:ffff:7f00:1'), options)).toBe(true)
    expect(isTrustedLocalAuthRequest(request('::ffff:192.168.1.44'), options)).toBe(false)
    expect(isTrustedLocalAuthRequest(request('::ffff:c0a8:012c'), options)).toBe(false)
    expect(isTrustedLocalAuthRequest(request('::1'), options)).toBe(true)
  })
})

function createFakeModels(store, { failLogin = false } = {}) {
  const selectedModes = []
  let activeInteraction
  const flowEpochs = []
  let resolveDevice
  const deviceGate = new Promise((resolve) => { resolveDevice = resolve })

  const models = {
    setProvider: vi.fn(),
    login: vi.fn(async (provider, type, interaction) => {
      activeInteraction = interaction
      const mode = await interaction.prompt({ type: 'select', signal: interaction.signal })
      selectedModes.push(mode)
      flowEpochs.push(store.getStatusSync().flowEpoch)

      if (mode === 'browser') {
        interaction.notify({
          type: 'auth_url',
          url: 'https://auth.openai.com/oauth/authorize?state=one-time-state-fixture',
        })
        const code = await interaction.prompt({ type: 'manual_code', signal: interaction.signal })
        if (code === 'fixture-authorization-code') {
          if (failLogin) throw new Error('sensitive-provider-error-fixture access-token-fixture')
          return store.modify(provider, async () => validCredential, { signal: interaction.signal })
        }
        throw new Error('Invalid authorization code')
      }

      interaction.notify({
        type: 'device_code',
        userCode: 'ABCD-EFGH',
        verificationUri: 'https://auth.openai.com/codex/device',
        expiresInSeconds: 900,
      })
      await deviceGate
      if (interaction.signal.aborted) throw interaction.signal.reason
      return store.modify(provider, async () => validCredential, { signal: interaction.signal })
    }),
  }

  return {
    models,
    selectedModes,
    completeDeviceLogin: () => resolveDevice(),
    completeFlowWithCredential: (index) => store.runWithFlowEpoch(flowEpochs[index], () => store.modify(
      providerId,
      async () => validCredential,
    )),
    get activeInteraction() { return activeInteraction },
  }
}
