import { streamText as aiStreamText, generateText as aiGenerateText } from 'ai'
import { createOpenAI } from '@ai-sdk/openai'
import { createAnthropic } from '@ai-sdk/anthropic'
import { createFireworks } from '@ai-sdk/fireworks'

/**
 * Custom error class for LLM client errors with retry suggestions.
 */
export class LlmClientError extends Error {
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {string} [options.code]
   * @param {boolean} [options.retryable]
   */
  constructor(message, { code, retryable = false } = {}) {
    super(message)
    this.name = 'LlmClientError'
    this.code = code
    this.retryable = retryable
  }
}

/**
 * Supported LLM providers.
 */
const PROVIDERS = ['openai', 'anthropic', 'fireworks']

/**
 * Get authentication headers for a given provider.
 * @param {string} provider - Provider name (openai, anthropic, fireworks)
 * @param {string} apiKey - API key for the provider
 * @returns {Record<string, string>}
 */
export function getAuthHeaders(provider, apiKey) {
  switch (provider) {
    case 'openai':
      return { Authorization: `Bearer ${apiKey}` }
    case 'anthropic':
      return { 'x-api-key': apiKey }
    case 'fireworks':
      return { Authorization: `Bearer ${apiKey}` }
    default:
      throw new LlmClientError(`Unsupported LLM provider: ${provider}`, { code: 'UNSUPPORTED_PROVIDER' })
  }
}

/**
 * Create a provider adapter that maps to the correct Vercel AI SDK provider.
 * @param {object} params
 * @param {string} params.provider
 * @param {string} params.apiKey
 * @param {string} params.model
 * @returns {{ model: object, provider: string }}
 */
export async function createProviderAdapter({ provider, apiKey, model }) {
  if (!apiKey || typeof apiKey !== 'string') {
    throw new LlmClientError('API key is required', { code: 'MISSING_API_KEY' })
  }
  if (!model || typeof model !== 'string') {
    throw new LlmClientError('Model is required', { code: 'MISSING_MODEL' })
  }
  if (!PROVIDERS.includes(provider)) {
    throw new LlmClientError(`Unsupported LLM provider: ${provider}. Supported: ${PROVIDERS.join(', ')}`, {
      code: 'UNSUPPORTED_PROVIDER',
    })
  }

  let providerInstance
  switch (provider) {
    case 'openai':
      providerInstance = createOpenAI({ apiKey })
      break
    case 'anthropic':
      providerInstance = createAnthropic({ apiKey })
      break
    case 'fireworks':
      providerInstance = createFireworks({ apiKey })
      break
  }

  const languageModel = providerInstance.languageModel(model)
  return { model: languageModel, provider }
}

/**
 * Wrap raw SDK errors into clear LlmClientError messages.
 * @param {Error} err
 * @returns {LlmClientError}
 */
function wrapSdkError(err) {
  const message = err.message || ''

  // Auth / API key errors
  if (
    message.includes('401') ||
    message.includes('403') ||
    message.includes('API key') ||
    message.includes('Unauthorized') ||
    message.includes('Invalid API Key') ||
    message.includes('auth')
  ) {
    return new LlmClientError('Malformed API key or authentication failed. Please check your API key in Settings.', {
      code: 'AUTH_ERROR',
      retryable: false,
    })
  }

  // Timeout / network / provider unavailable
  if (
    message.includes('timeout') ||
    message.includes('ETIMEDOUT') ||
    message.includes('ECONNREFUSED') ||
    message.includes('ENOTFOUND') ||
    message.includes('Connection') ||
    message.includes('network') ||
    message.includes('unavailable')
  ) {
    return new LlmClientError(
      'Provider unavailable. Please check your network connection and try again.',
      { code: 'PROVIDER_UNAVAILABLE', retryable: true }
    )
  }

  // Rate limit
  if (message.includes('429') || message.includes('rate limit') || message.includes('RateLimit')) {
    return new LlmClientError('Rate limit exceeded. Please wait a moment and try again.', {
      code: 'RATE_LIMIT',
      retryable: true,
    })
  }

  // Fallback
  return new LlmClientError(message, { code: 'LLM_ERROR', retryable: true })
}

/**
 * Stream text from an LLM provider.
 * @param {object} params
 * @param {string} params.provider
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} [params.system]
 * @returns {Promise<object>} The result from ai.streamText (contains textStream, etc.)
 */
export async function streamText({ provider, apiKey, model, messages, system }) {
  try {
    const { model: languageModel } = await createProviderAdapter({ provider, apiKey, model })

    const options = {
      model: languageModel,
      messages,
    }
    if (system) {
      options.system = system
    }

    return aiStreamText(options)
  } catch (err) {
    if (err instanceof LlmClientError) {
      throw err
    }
    throw wrapSdkError(err)
  }
}

/**
 * Generate text (non-streaming) from an LLM provider.
 * @param {object} params
 * @param {string} params.provider
 * @param {string} params.apiKey
 * @param {string} params.model
 * @param {Array<{role: string, content: string}>} params.messages
 * @param {string} [params.system]
 * @returns {Promise<object>} The result from ai.generateText (contains text, usage, etc.)
 */
export async function generateText({ provider, apiKey, model, messages, system }) {
  try {
    const { model: languageModel } = await createProviderAdapter({ provider, apiKey, model })

    const options = {
      model: languageModel,
      messages,
    }
    if (system) {
      options.system = system
    }

    return await aiGenerateText(options)
  } catch (err) {
    if (err instanceof LlmClientError) {
      throw err
    }
    throw wrapSdkError(err)
  }
}

/**
 * Pipe an AI SDK stream result to an Express response as SSE.
 * Sends each text chunk as an SSE data event and ends with [DONE].
 * @param {object} streamResult - The result from ai.streamText (must have textStream)
 * @param {import('express').Response} res - Express response object
 */
export async function streamToSSE(streamResult, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
  })

  try {
    for await (const chunk of streamResult.textStream) {
      const text = typeof chunk === 'string' ? chunk : ''
      res.write(`data: ${JSON.stringify(text)}\n\n`)
    }
    res.write(`data: ${JSON.stringify('[DONE]')}\n\n`)
    res.end()
  } catch (err) {
    const wrapped = wrapSdkError(err)
    res.write(`event: error\n`)
    res.write(`data: ${JSON.stringify({ message: wrapped.message, code: wrapped.code, retryable: wrapped.retryable })}\n\n`)
    res.end()
  }
}
