import { beforeEach, describe, expect, it, vi } from 'vitest'

const { state } = vi.hoisted(() => ({
  state: { row: null, codexStatus: { connected: false, status: 'disconnected' } },
}))

vi.mock('../db.js', () => ({
  get: vi.fn(() => state.row),
}))

vi.mock('../llm/codex-auth.js', () => ({
  codexAuth: {
    getConnectionStatus: vi.fn(() => state.codexStatus),
    getRuntimeSnapshot: vi.fn(() => ({
      ...state.codexStatus,
      credentialGeneration: state.codexStatus.connected ? 'internal-generation-fixture' : undefined,
    })),
    captureCredentialGeneration: vi.fn(() => state.codexStatus.connected ? 'internal-generation-fixture' : undefined),
  },
}))

const { getProviderCatalog } = await import('../llm/provider-catalog.js')
const { requireLlmConfig, resolveLlmConfig } = await import('../utils/llm-config.js')

describe('provider catalog and LLM configuration', () => {
  beforeEach(() => {
    state.row = null
    state.codexStatus = { connected: false, status: 'disconnected' }
    delete process.env.OPENAI_API_KEY
    delete process.env.ANTHROPIC_API_KEY
    delete process.env.FIREWORKS_API_KEY
    delete process.env.LLM_PROVIDER
    delete process.env.LLM_MODEL
  })

  it('preserves the legacy provider catalog and reports not-ready defaults', () => {
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'fireworks',
      model: 'accounts/fireworks/routers/kimi-k2p6-turbo',
      reasoningEffort: 'none',
      ready: false,
      apiKeySet: false,
    })
    expect(getProviderCatalog().map(({ id }) => id)).toEqual(['openai', 'anthropic', 'fireworks', 'openai-codex'])
    expect(getProviderCatalog().find(({ id }) => id === 'openai').models.map(({ id }) => id)).toEqual([
      'gpt-4o', 'gpt-4o-mini', 'o3-mini',
    ])
  })

  it('keeps API-key readiness separate from Codex subscription readiness', () => {
    process.env.OPENAI_API_KEY = 'fixture-api-key'
    state.row = { provider: 'openai', model: 'gpt-4o', reasoning_effort: 'none' }
    expect(resolveLlmConfig()).toMatchObject({ provider: 'openai', ready: true, apiKeySet: true, authType: 'api_key' })

    state.row = { provider: 'openai-codex', model: 'gpt-5.4', reasoning_effort: 'xhigh' }
    state.codexStatus = { connected: true, status: 'connected' }
    const codex = resolveLlmConfig()
    expect(codex).toMatchObject({
      provider: 'openai-codex',
      ready: true,
      apiKeySet: false,
      authType: 'oauth',
      credentialGeneration: 'internal-generation-fixture',
    })
    expect(JSON.stringify(codex)).not.toContain('access-token-fixture')
  })

  it('rejects unsupported models and reasoning levels before dispatch', () => {
    state.row = { provider: 'openai-codex', model: 'gpt-5.4', reasoning_effort: 'none' }
    state.codexStatus = { connected: true, status: 'connected' }
    expect(resolveLlmConfig()).toMatchObject({ ready: false, configError: 'UNSUPPORTED_REASONING_EFFORT' })
    expect(() => requireLlmConfig()).toThrow(expect.objectContaining({ code: 'UNSUPPORTED_REASONING_EFFORT' }))

    state.row = { provider: 'openai-codex', model: 'not-a-codex-model', reasoning_effort: 'low' }
    expect(resolveLlmConfig()).toMatchObject({ ready: false, configError: 'UNSUPPORTED_MODEL' })
  })

  it('requires a connected subscription while allowing the Codex provider to be saved disconnected', () => {
    state.row = { provider: 'openai-codex', model: 'gpt-5.4', reasoning_effort: 'minimal' }
    expect(resolveLlmConfig()).toMatchObject({ ready: false, authStatus: 'disconnected', apiKeySet: false })
    expect(() => requireLlmConfig()).toThrow(expect.objectContaining({ code: 'MISSING_CODEX_AUTH' }))
  })

  it('does not expose credential or account data in public catalog metadata', () => {
    const catalog = JSON.stringify(getProviderCatalog())
    expect(catalog).toContain('gpt-5.4')
    expect(catalog).not.toContain('access-token-fixture')
    expect(catalog).not.toContain('accountId')
  })
})
