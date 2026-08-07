import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { streamText, generateText } from 'ai'

const codexMocks = vi.hoisted(() => ({
  streamText: vi.fn(),
  generateText: vi.fn(),
}))

// We need to import the actual module, but it may use real AI SDK functions.
// We will test our adapter functions and SSE helpers directly.

// Mock the ai SDK module to avoid real network calls
vi.mock('ai', async () => {
  const actual = await vi.importActual('ai')
  return {
    ...actual,
    streamText: vi.fn(),
    generateText: vi.fn(),
  }
})

// Mock the provider SDKs
vi.mock('@ai-sdk/openai', () => ({
  createOpenAI: vi.fn((opts) => ({
    languageModel: vi.fn((modelId) => ({
      modelId,
      provider: opts?.baseURL?.includes('fireworks') ? 'fireworks' : 'openai',
    })),
  })),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  createAnthropic: vi.fn(() => ({
    languageModel: vi.fn((modelId) => ({
      modelId,
      provider: 'anthropic',
    })),
  })),
}))

vi.mock('../llm/codex-adapter.js', () => ({
  createCodexAdapter: vi.fn(() => codexMocks),
}))

vi.mock('../llm/codex-auth.js', () => ({
  codexAuth: {},
  codexModels: {},
}))

// Now import the module under test
const llmModule = await import('../llm/client.js')

describe('LLM Client', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('createProviderAdapter', () => {
    it('returns an openai provider instance with Bearer auth header', async () => {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const adapter = await llmModule.createProviderAdapter({ provider: 'openai', apiKey: 'sk-test', model: 'gpt-4o' })
      expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'sk-test' })
      expect(adapter).toBeDefined()
      expect(adapter.provider).toBe('openai')
    })

    it('returns an anthropic provider instance with x-api-key auth header', async () => {
      const { createAnthropic } = await import('@ai-sdk/anthropic')
      const adapter = await llmModule.createProviderAdapter({ provider: 'anthropic', apiKey: 'sk-ant-test', model: 'claude-3-5-sonnet-20241022' })
      expect(createAnthropic).toHaveBeenCalledWith({ apiKey: 'sk-ant-test' })
      expect(adapter).toBeDefined()
      expect(adapter.provider).toBe('anthropic')
    })

    it('returns a fireworks provider instance via OpenAI-compatible endpoint', async () => {
      const { createOpenAI } = await import('@ai-sdk/openai')
      const adapter = await llmModule.createProviderAdapter({ provider: 'fireworks', apiKey: 'fw-test', model: 'accounts/fireworks/models/llama-v3p1-70b-instruct' })
      expect(createOpenAI).toHaveBeenCalledWith({ apiKey: 'fw-test', baseURL: 'https://api.fireworks.ai/inference/v1' })
      expect(adapter).toBeDefined()
      expect(adapter.provider).toBe('fireworks')
    })

    it('throws for unsupported provider', async () => {
      await expect(
        llmModule.createProviderAdapter({ provider: 'unknown', apiKey: 'k', model: 'm' })
      ).rejects.toThrow('Unsupported LLM provider')
    })

    it('throws when apiKey is missing', async () => {
      await expect(
        llmModule.createProviderAdapter({ provider: 'openai', apiKey: '', model: 'gpt-4o' })
      ).rejects.toThrow('API key is required')
    })

    it('throws when model is missing', async () => {
      await expect(
        llmModule.createProviderAdapter({ provider: 'openai', apiKey: 'sk-test', model: '' })
      ).rejects.toThrow('Model is required')
    })
  })

  describe('streamText', () => {
    it('dispatches Codex requests through the subscription adapter with the captured snapshot', async () => {
      const result = { textStream: (async function* () { yield 'Codex' })() }
      codexMocks.streamText.mockResolvedValue(result)
      const signal = new AbortController().signal
      const request = {
        provider: 'openai-codex',
        model: 'gpt-5.4',
        reasoningEffort: 'xhigh',
        credentialGeneration: 'captured-generation',
        signal,
        messages: [{ role: 'user', content: 'hello' }],
      }

      await expect(llmModule.streamText(request)).resolves.toBe(result)

      expect(codexMocks.streamText).toHaveBeenCalledWith(request)
      expect(streamText).not.toHaveBeenCalled()
    })

    it('calls ai.streamText with the correct model for openai', async () => {
      const mockStream = {
        textStream: (async function* () {
          yield 'Hello'
          yield ' world'
        })(),
        textPromise: Promise.resolve('Hello world'),
      }
      streamText.mockReturnValue(mockStream)

      const result = await llmModule.streamText({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
      })

      expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
        model: expect.objectContaining({ provider: 'openai', modelId: 'gpt-4o' }),
        messages: [{ role: 'user', content: 'hi' }],
      }))
      expect(result).toBe(mockStream)
    })

    it('calls ai.streamText with the correct model for anthropic', async () => {
      const mockStream = {
        textStream: (async function* () {
          yield 'Hi'
        })(),
        textPromise: Promise.resolve('Hi'),
      }
      streamText.mockReturnValue(mockStream)

      await llmModule.streamText({
        provider: 'anthropic',
        apiKey: 'sk-ant-test',
        model: 'claude-3-5-sonnet-20241022',
        messages: [{ role: 'user', content: 'hello' }],
      })

      expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
        model: expect.objectContaining({ provider: 'anthropic', modelId: 'claude-3-5-sonnet-20241022' }),
        messages: [{ role: 'user', content: 'hello' }],
      }))
    })

    it('calls ai.streamText with the correct model for fireworks', async () => {
      const mockStream = {
        textStream: (async function* () {
          yield 'Hey'
        })(),
        textPromise: Promise.resolve('Hey'),
      }
      streamText.mockReturnValue(mockStream)

      await llmModule.streamText({
        provider: 'fireworks',
        apiKey: 'fw-test',
        model: 'accounts/fireworks/models/llama-v3p1-70b-instruct',
        messages: [{ role: 'user', content: 'yo' }],
      })

      expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
        model: expect.objectContaining({ provider: 'fireworks', modelId: 'accounts/fireworks/models/llama-v3p1-70b-instruct' }),
        messages: [{ role: 'user', content: 'yo' }],
      }))
    })

    it('includes system prompt when provided', async () => {
      const mockStream = {
        textStream: (async function* () { yield 'ok' })(),
        textPromise: Promise.resolve('ok'),
      }
      streamText.mockReturnValue(mockStream)

      await llmModule.streamText({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'hi' }],
        system: 'You are a tutor.',
      })

      expect(streamText).toHaveBeenCalledWith(expect.objectContaining({
        system: 'You are a tutor.',
      }))
    })

    it('wraps ai.streamText errors in a clear LlmClientError', async () => {
      streamText.mockImplementation(() => {
        throw new Error('API key invalid')
      })

      await expect(
        llmModule.streamText({
          provider: 'openai',
          apiKey: 'bad-key',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('Malformed API key')
    })

    it('returns graceful error for provider unavailability', async () => {
      streamText.mockImplementation(() => {
        const err = new Error('Connection timeout')
        err.code = 'ETIMEDOUT'
        throw err
      })

      await expect(
        llmModule.streamText({
          provider: 'openai',
          apiKey: 'sk-test',
          model: 'gpt-4o',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('Provider unavailable')
    })
  })

  describe('generateText (non-streaming)', () => {
    it('calls ai.generateText with correct parameters', async () => {
      generateText.mockResolvedValue({ text: 'Result', usage: { promptTokens: 10, completionTokens: 5 } })

      const result = await llmModule.generateText({
        provider: 'openai',
        apiKey: 'sk-test',
        model: 'gpt-4o',
        messages: [{ role: 'user', content: 'compute 2+2' }],
      })

      expect(generateText).toHaveBeenCalledWith(expect.objectContaining({
        model: expect.objectContaining({ provider: 'openai', modelId: 'gpt-4o' }),
        messages: [{ role: 'user', content: 'compute 2+2' }],
      }))
      expect(result.text).toBe('Result')
    })

    it('returns graceful error for invalid key in generateText', async () => {
      generateText.mockImplementation(() => {
        throw new Error('401 Unauthorized')
      })

      await expect(
        llmModule.generateText({
          provider: 'anthropic',
          apiKey: 'bad',
          model: 'claude-3-5-sonnet-20241022',
          messages: [{ role: 'user', content: 'hi' }],
        })
      ).rejects.toThrow('Malformed API key')
    })
  })

  describe('streamToSSE', () => {
    it('pipes stream chunks to an Express response in SSE format', async () => {
      const chunks = ['Hello', ' world', '!']
      const mockStream = {
        textStream: (async function* () {
          for (const c of chunks) yield c
        })(),
      }

      const mockRes = {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      }

      await llmModule.streamToSSE(mockStream, mockRes)

      expect(mockRes.writeHead).toHaveBeenCalledWith(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      })
      expect(mockRes.write).toHaveBeenCalledTimes(4)
      expect(mockRes.write).toHaveBeenNthCalledWith(1, 'data: "Hello"\n\n')
      expect(mockRes.write).toHaveBeenNthCalledWith(2, 'data: " world"\n\n')
      expect(mockRes.write).toHaveBeenNthCalledWith(3, 'data: "!"\n\n')
      expect(mockRes.write).toHaveBeenNthCalledWith(4, 'data: "[DONE]"\n\n')
      expect(mockRes.end).toHaveBeenCalled()
    })

    it('sends a [DONE] event at the end of the SSE stream', async () => {
      const mockStream = {
        textStream: (async function* () {
          yield 'done'
        })(),
      }

      const mockRes = {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      }

      await llmModule.streamToSSE(mockStream, mockRes)

      const lastCall = mockRes.write.mock.calls[mockRes.write.mock.calls.length - 1]
      expect(lastCall[0]).toContain('[DONE]')
    })

    it('handles errors during streaming by sending an SSE error event', async () => {
      const mockStream = {
        textStream: (async function* () {
          yield 'partial'
          const err = new Error('Connection timeout')
          err.code = 'ETIMEDOUT'
          throw err
        })(),
      }

      const mockRes = {
        writeHead: vi.fn(),
        write: vi.fn(),
        end: vi.fn(),
      }

      await llmModule.streamToSSE(mockStream, mockRes)

      const errorEventCall = mockRes.write.mock.calls.find(
        call => call[0].includes('event: error')
      )
      expect(errorEventCall).toBeDefined()
      const errorDataCall = mockRes.write.mock.calls.find(
        call => call[0].includes('Provider unavailable')
      )
      expect(errorDataCall).toBeDefined()
      expect(mockRes.end).toHaveBeenCalled()
    })
  })

  describe('authHeaders', () => {
    it('returns Bearer header for openai', () => {
      const headers = llmModule.getAuthHeaders('openai', 'sk-test')
      expect(headers).toEqual({ Authorization: 'Bearer sk-test' })
    })

    it('returns x-api-key header for anthropic', () => {
      const headers = llmModule.getAuthHeaders('anthropic', 'sk-ant-test')
      expect(headers).toEqual({ 'x-api-key': 'sk-ant-test' })
    })

    it('returns Bearer header for fireworks', () => {
      const headers = llmModule.getAuthHeaders('fireworks', 'fw-test')
      expect(headers).toEqual({ Authorization: 'Bearer fw-test' })
    })
  })
})
