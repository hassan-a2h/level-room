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
    delete process.env.LLM_REASONING_EFFORT
  })

  it('uses Codex Luna xhigh for fresh defaults and requires OAuth', () => {
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai-codex',
      model: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
      ready: false,
      apiKeySet: false,
    })
    expect(() => requireLlmConfig()).toThrow(expect.objectContaining({ code: 'MISSING_CODEX_AUTH' }))
    expect(getProviderCatalog().map(({ id }) => id)).toEqual(['openai', 'anthropic', 'fireworks', 'openai-codex'])
    expect(getProviderCatalog().find(({ id }) => id === 'openai').models.map(({ id }) => id)).toEqual([
      'gpt-4o', 'gpt-4o-mini', 'o3-mini',
    ])
    const codex = getProviderCatalog().find(({ id }) => id === 'openai-codex')
    expect(codex.defaultModel).toBe('gpt-5.6-luna')
    expect(codex.models).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: 'gpt-5.6-luna',
        reasoningEfforts: expect.arrayContaining(['minimal', 'xhigh', 'max']),
      }),
    ]))
  })

  it('resolves all three trimmed environment values independently', () => {
    process.env.LLM_PROVIDER = ' openai-codex '
    process.env.LLM_MODEL = ' gpt-5.6-luna '
    process.env.LLM_REASONING_EFFORT = ' xhigh '

    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai-codex',
      model: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
      authType: 'oauth',
      authStatus: 'disconnected',
      ready: false,
      configError: undefined,
    })
  })

  it('resolves provider-only, model-only, reasoning-only, and API-key partial environments', () => {
    process.env.LLM_PROVIDER = 'fireworks'
    process.env.FIREWORKS_API_KEY = 'fixture-api-key'
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'fireworks',
      model: 'accounts/fireworks/routers/kimi-k2p6-turbo',
      reasoningEffort: 'none',
      ready: true,
    })

    delete process.env.LLM_PROVIDER
    delete process.env.FIREWORKS_API_KEY
    process.env.LLM_MODEL = 'gpt-5.4'
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai-codex',
      model: 'gpt-5.4',
      reasoningEffort: 'xhigh',
    })

    delete process.env.LLM_MODEL
    process.env.LLM_REASONING_EFFORT = 'minimal'
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai-codex',
      model: 'gpt-5.6-luna',
      reasoningEffort: 'minimal',
    })

    process.env.LLM_PROVIDER = 'openai'
    process.env.LLM_MODEL = 'gpt-4o-mini'
    process.env.OPENAI_API_KEY = 'fixture-api-key'
    delete process.env.LLM_REASONING_EFFORT
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o-mini',
      reasoningEffort: 'none',
      ready: true,
    })
  })

  it('trims environment values and ignores whitespace-only values', () => {
    process.env.LLM_PROVIDER = ' \t '
    process.env.LLM_MODEL = '\n'
    process.env.LLM_REASONING_EFFORT = '  '
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai-codex',
      model: 'gpt-5.6-luna',
      reasoningEffort: 'xhigh',
    })

    process.env.LLM_PROVIDER = ' openai '
    process.env.LLM_MODEL = ' gpt-4o '
    process.env.LLM_REASONING_EFFORT = ' none '
    process.env.OPENAI_API_KEY = 'fixture-api-key'
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      reasoningEffort: 'none',
      ready: true,
    })
  })

  it('keeps non-empty saved values authoritative over environment values', () => {
    state.row = { provider: 'openai', model: 'gpt-4o', reasoning_effort: 'none' }
    process.env.LLM_PROVIDER = 'not-a-provider'
    process.env.LLM_MODEL = 'not-a-model'
    process.env.LLM_REASONING_EFFORT = 'xhigh'
    process.env.OPENAI_API_KEY = 'fixture-api-key'

    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      reasoningEffort: 'none',
      ready: true,
      configError: undefined,
    })
  })

  it('lets empty legacy fields fall through independently and defaults missing API-key reasoning to none', () => {
    state.row = { provider: '', model: 'gpt-4o', reasoning_effort: '' }
    process.env.LLM_PROVIDER = 'openai'
    process.env.LLM_MODEL = 'gpt-4o-mini'
    process.env.LLM_REASONING_EFFORT = 'none'
    process.env.OPENAI_API_KEY = 'fixture-api-key'

    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      reasoningEffort: 'none',
      ready: true,
    })

    state.row = { provider: 'openai', model: 'gpt-4o' }
    delete process.env.LLM_MODEL
    delete process.env.LLM_REASONING_EFFORT
    expect(resolveLlmConfig()).toMatchObject({
      provider: 'openai',
      model: 'gpt-4o',
      reasoningEffort: 'none',
      ready: true,
    })
  })

  it('rejects invalid environment provider, model, and reasoning combinations without fallback', () => {
    process.env.LLM_PROVIDER = 'not-a-provider'
    expect(resolveLlmConfig()).toMatchObject({ provider: 'not-a-provider', configError: 'UNSUPPORTED_PROVIDER' })

    process.env.LLM_PROVIDER = 'fireworks'
    process.env.LLM_MODEL = 'gpt-5.6-luna'
    expect(resolveLlmConfig()).toMatchObject({ configError: 'UNSUPPORTED_MODEL' })

    delete process.env.LLM_MODEL
    process.env.LLM_REASONING_EFFORT = 'xhigh'
    expect(resolveLlmConfig()).toMatchObject({ configError: 'UNSUPPORTED_REASONING_EFFORT' })

    process.env.LLM_PROVIDER = 'openai-codex'
    process.env.LLM_MODEL = 'gpt-5.6-luna'
    process.env.LLM_REASONING_EFFORT = 'medium'
    expect(resolveLlmConfig()).toMatchObject({ configError: 'UNSUPPORTED_REASONING_EFFORT' })
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
