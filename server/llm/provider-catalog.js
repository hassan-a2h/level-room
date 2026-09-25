import { openaiCodexProvider } from '@earendil-works/pi-ai/providers/openai-codex'

export const API_KEY_ENV_VARS = Object.freeze({
  openai: 'OPENAI_API_KEY',
  anthropic: 'ANTHROPIC_API_KEY',
  fireworks: 'FIREWORKS_API_KEY',
})

const REASONING_LEVEL_ORDER = ['minimal', 'low', 'medium', 'high', 'xhigh', 'max']

const LEGACY_PROVIDERS = [
  {
    id: 'openai',
    name: 'OpenAI API key',
    authType: 'api_key',
    envVar: API_KEY_ENV_VARS.openai,
    defaultModel: 'gpt-4o',
    models: ['gpt-4o', 'gpt-4o-mini', 'o3-mini'].map((id) => ({
      id,
      name: id,
      reasoning: false,
      reasoningEfforts: [],
    })),
  },
  {
    id: 'anthropic',
    name: 'Anthropic API key',
    authType: 'api_key',
    envVar: API_KEY_ENV_VARS.anthropic,
    defaultModel: 'claude-3-5-sonnet-20241022',
    models: [
      'claude-3-5-sonnet-20241022',
      'claude-3-opus-20240229',
      'claude-3-haiku-20240307',
    ].map((id) => ({ id, name: id, reasoning: false, reasoningEfforts: [] })),
  },
  {
    id: 'fireworks',
    name: 'Fireworks API key',
    authType: 'api_key',
    envVar: API_KEY_ENV_VARS.fireworks,
    defaultModel: 'accounts/fireworks/routers/kimi-k2p6-turbo',
    models: [
      ['accounts/fireworks/routers/kimi-k2p6-turbo', 'kimi-k2p6-turbo'],
      ['accounts/fireworks/models/llama-v3p1-70b-instruct', 'llama-v3p1-70b-instruct'],
      ['accounts/fireworks/models/llama-v3p1-8b-instruct', 'llama-v3p1-8b-instruct'],
    ].map(([id, name]) => ({ id, name, reasoning: false, reasoningEfforts: [] })),
  },
]

function getCodexModels() {
  return openaiCodexProvider().getModels().map((model) => {
    const levelMap = model.thinkingLevelMap || {}
    return {
      id: model.id,
      name: model.name,
      reasoning: model.reasoning,
      reasoningEfforts: REASONING_LEVEL_ORDER.filter((level) => Object.hasOwn(levelMap, level) && levelMap[level] !== null),
    }
  })
}

export function getProviderCatalog() {
  return [
    ...LEGACY_PROVIDERS,
    {
      id: 'openai-codex',
      name: 'OpenAI Codex subscription',
      authType: 'oauth',
      defaultModel: 'gpt-5.6-luna',
      models: getCodexModels(),
    },
  ].map((provider) => ({
    ...provider,
    models: provider.models.map((model) => ({
      ...model,
      reasoningEfforts: [...model.reasoningEfforts],
    })),
  }))
}

export function getProviderDefinition(providerId) {
  return getProviderCatalog().find((provider) => provider.id === providerId)
}
