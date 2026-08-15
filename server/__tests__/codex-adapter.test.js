import { afterEach, describe, expect, it, vi } from 'vitest'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { createCodexAdapter } from '../llm/codex-adapter.js'
import { createCodexCredentialStore } from '../llm/codex-credential-store.js'

const providerId = 'openai-codex'
const credential = {
  type: 'oauth',
  access: 'access-token-fixture',
  refresh: 'refresh-token-fixture',
  expires: 1_900_000_000_000,
  accountId: 'account-id-fixture',
}
const model = {
  id: 'gpt-5.4',
  name: 'GPT 5.4',
  provider: providerId,
  api: 'openai-codex-responses',
  reasoning: true,
  thinkingLevelMap: { minimal: 'low', xhigh: 'xhigh' },
}

describe('Codex LLM adapter', () => {
  const directories = new Set()

  afterEach(async () => {
    vi.useRealTimers()
    await Promise.all([...directories].map((directory) => fs.rm(directory, { recursive: true, force: true })))
    directories.clear()
  })

  async function setup(implementation = {}) {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), 'roadmap-codex-adapter-'))
    directories.add(directory)
    const store = createCodexCredentialStore({ directory })
    const epoch = await store.beginFlow()
    await store.runWithFlowEpoch(epoch, () => store.modify(providerId, async () => credential))
    const generation = store.getStatusSync().credentialGeneration
    const auth = {
      captureCredentialGeneration: () => generation,
      runWithCredentialGeneration: (capturedGeneration, callback) => store.runWithCredentialGeneration(capturedGeneration, callback),
    }
    const optionsCaptured = []
    const contextsCaptured = []
    const models = {
      getModel: vi.fn(() => model),
      streamSimple: vi.fn((selectedModel, context, options) => {
        optionsCaptured.push(options)
        contextsCaptured.push(context)
        return implementation.stream?.({ store, selectedModel, context, options }) || eventStream([
          { type: 'start' },
          { type: 'text_delta', delta: 'hello' },
          { type: 'text_delta', delta: ' world' },
          { type: 'done', reason: 'stop', message: { usage: { input: 2, output: 3 } } },
        ])
      }),
      completeSimple: vi.fn(async (_selectedModel, context, options) => {
        contextsCaptured.push(context)
        optionsCaptured.push(options)
        return implementation.complete?.({ store, context, options }) || {
          role: 'assistant',
          content: [{ type: 'text', text: 'complete response' }],
          usage: { input: 4, output: 2 },
          stopReason: 'stop',
        }
      }),
    }
    const adapter = createCodexAdapter({
      models,
      auth,
      firstByteTimeoutMs: implementation.firstByteTimeoutMs ?? 30_000,
      idleTimeoutMs: implementation.idleTimeoutMs ?? 60_000,
    })
    return { adapter, auth, models, optionsCaptured, contextsCaptured, store, generation }
  }

  it('maps text messages and system prompts into Pi Context and forces SSE transport', async () => {
    const { adapter, models, contextsCaptured, optionsCaptured } = await setup()
    const result = await adapter.streamText({
      model: model.id,
      reasoningEffort: 'xhigh',
      messages: [
        { role: 'user', content: 'First question' },
        { role: 'assistant', content: 'First answer' },
        { role: 'user', content: 'Follow-up' },
      ],
      system: 'You are a calm tutor.',
    })

    expect(contextsCaptured[0].systemPrompt).toBe('You are a calm tutor.')
    expect(contextsCaptured[0].messages.map((message) => [message.role, message.content])).toEqual([
      ['user', 'First question'],
      ['assistant', [{ type: 'text', text: 'First answer' }]],
      ['user', 'Follow-up'],
    ])
    expect(models.streamSimple).toHaveBeenCalledWith(model, contextsCaptured[0], expect.objectContaining({
      reasoning: 'xhigh',
      transport: 'sse',
      signal: expect.any(AbortSignal),
    }))
    const chunks = []
    for await (const chunk of result.textStream) chunks.push(chunk)
    expect(chunks).toEqual(['hello', ' world'])
  })

  it('rejects unsupported roles, non-text content, and model reasoning levels', async () => {
    const { adapter, models } = await setup()
    await expect(adapter.streamText({
      model: model.id,
      reasoningEffort: 'medium',
      messages: [{ role: 'user', content: 'hello' }],
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_REASONING_EFFORT' })

    await expect(adapter.generateText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'tool', content: 'tool result' }],
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_MESSAGE' })

    await expect(adapter.generateText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: [{ type: 'image' }] }],
    })).rejects.toMatchObject({ code: 'UNSUPPORTED_MESSAGE' })
    expect(models.completeSimple).not.toHaveBeenCalled()
  })

  it('collects text-only complete responses without exposing provider errors', async () => {
    const { adapter, models, optionsCaptured } = await setup()
    const result = await adapter.generateText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'Explain DNS.' }],
    })
    expect(result.text).toBe('complete response')
    expect(result.usage).toMatchObject({ promptTokens: 4, completionTokens: 2 })
    expect(optionsCaptured[0]).toMatchObject({ reasoning: 'minimal', transport: 'sse' })

    models.completeSimple.mockRejectedValueOnce(new Error('upstream access-token-fixture refresh-token-fixture'))
    await expect(adapter.generateText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'Explain DNS.' }],
    })).rejects.toThrow('Codex could not complete the request.')
  })

  it.each(['aborted', 'error', 'length', 'pending', 'toolUse', 'unexpected'])(
    'rejects non-final completion stop reason %s', async (stopReason) => {
      const { adapter } = await setup({
        complete: () => ({
          role: 'assistant',
          content: [{ type: 'text', text: 'partial response' }],
          stopReason,
          ...(stopReason === 'aborted' ? { errorMessage: 'Request aborted.' } : {}),
        }),
      })
      await expect(adapter.generateText({
        model: model.id,
        reasoningEffort: 'minimal',
        messages: [{ role: 'user', content: 'Continue' }],
      })).rejects.toMatchObject({
        code: stopReason === 'aborted' ? 'REQUEST_ABORTED' : stopReason === 'error' ? 'LLM_ERROR' : 'LLM_INCOMPLETE_RESPONSE',
      })
    },
  )

  it('rejects an empty final completion so callers cannot persist a failed attempt', async () => {
    const { adapter } = await setup({
      complete: () => ({ role: 'assistant', content: [], stopReason: 'stop' }),
    })
    await expect(adapter.generateText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'Answer the quiz.' }],
    })).rejects.toMatchObject({ code: 'LLM_INCOMPLETE_RESPONSE' })
  })

  it('maps expired OAuth refresh grants to a reconnectable authorization error', async () => {
    const { adapter } = await setup({
      complete: () => ({
        role: 'assistant',
        content: [],
        stopReason: 'error',
        errorMessage: 'invalid_grant',
        error: { code: 'oauth' },
      }),
    })
    await expect(adapter.generateText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'Explain DNS.' }],
    })).rejects.toMatchObject({ code: 'CODEX_AUTH_FAILED' })
  })

  it('stops waiting for a completion when the caller aborts', async () => {
    const { adapter, models } = await setup({ complete: () => new Promise(() => {}) })
    const controller = new AbortController()
    const pending = adapter.generateText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'Explain DNS.' }],
      signal: controller.signal,
    })
    controller.abort()
    await expect(pending).rejects.toMatchObject({ code: 'REQUEST_ABORTED' })
    expect(models.completeSimple).toHaveBeenCalled()
  })

  it('rejects incomplete, errored, and empty streamed Codex responses', async () => {
    const { adapter: truncatedAdapter } = await setup({
      stream: () => eventStream([
        { type: 'start' },
        { type: 'text_delta', delta: 'partial answer' },
        { type: 'done', reason: 'length', message: {} },
      ]),
    })
    const truncated = await truncatedAdapter.streamText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'Explain this.' }],
    })
    const truncatedIterator = truncated.textStream[Symbol.asyncIterator]()
    await expect(truncatedIterator.next()).resolves.toMatchObject({ value: 'partial answer', done: false })
    await expect(truncatedIterator.next()).rejects.toMatchObject({ code: 'LLM_INCOMPLETE_RESPONSE' })

    const { adapter: emptyAdapter } = await setup({
      stream: () => eventStream([
        { type: 'start' },
        { type: 'done', reason: 'stop', message: {} },
      ]),
    })
    const empty = await emptyAdapter.streamText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'Explain this.' }],
    })
    await expect(empty.textStream[Symbol.asyncIterator]().next())
      .rejects.toMatchObject({ code: 'LLM_INCOMPLETE_RESPONSE' })
  })

  it('rechecks the captured account generation when a lazy stream is first read', async () => {
    let credentialRead
    const { adapter, store } = await setup({
      stream: () => ({
        [Symbol.asyncIterator]() {
          let checked = false
          return {
            async next() {
              if (!checked) {
                checked = true
                credentialRead = await store.read(providerId)
              }
              return { done: false, value: { type: 'text_delta', delta: 'unsafe' } }
            },
            async return() { return { done: true } },
          }
        },
      }),
    })
    const result = await adapter.streamText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'hello' }],
    })
    await store.disconnect()

    const iterator = result.textStream[Symbol.asyncIterator]()
    await expect(iterator.next()).rejects.toMatchObject({ code: 'CODEX_ACCOUNT_CHANGED' })
    expect(credentialRead).toBeUndefined()
  })

  it('aborts and reports a typed error when the first text byte never arrives', async () => {
    let receivedSignal
    const { adapter } = await setup({
      firstByteTimeoutMs: 25,
      stream: ({ options }) => {
        receivedSignal = options.signal
        return {
          [Symbol.asyncIterator]() {
            return { next: () => new Promise(() => {}), return: async () => ({ done: true }) }
          },
        }
      },
    })
    vi.useFakeTimers()
    const result = await adapter.streamText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'hello' }],
    })
    const pending = result.textStream[Symbol.asyncIterator]().next()
    const settled = pending.then(() => null, (error) => error)
    await vi.advanceTimersByTimeAsync(26)

    expect(await settled).toMatchObject({ code: 'LLM_TIMEOUT' })
    expect(receivedSignal.aborted).toBe(true)
  })

  it('aborts and reports a typed idle timeout after a stream has started', async () => {
    let receivedSignal
    const { adapter } = await setup({
      idleTimeoutMs: 25,
      stream: ({ options }) => {
        receivedSignal = options.signal
        return {
          [Symbol.asyncIterator]() {
            let first = true
            return {
              async next() {
                if (first) {
                  first = false
                  return { done: false, value: { type: 'text_delta', delta: 'started' } }
                }
                return new Promise(() => {})
              },
              async return() { return { done: true } },
            }
          },
        }
      },
    })
    vi.useFakeTimers()
    const result = await adapter.streamText({
      model: model.id,
      reasoningEffort: 'minimal',
      messages: [{ role: 'user', content: 'hello' }],
    })
    const iterator = result.textStream[Symbol.asyncIterator]()
    await expect(iterator.next()).resolves.toMatchObject({ value: 'started', done: false })
    const pending = iterator.next()
    const settled = pending.then(() => null, (error) => error)
    await vi.advanceTimersByTimeAsync(26)

    expect(await settled).toMatchObject({ code: 'LLM_TIMEOUT' })
    expect(receivedSignal.aborted).toBe(true)
  })
})

function eventStream(events) {
  return {
    [Symbol.asyncIterator]() {
      let index = 0
      return {
        async next() {
          return index < events.length
            ? { value: events[index++], done: false }
            : { value: undefined, done: true }
        },
        async return() { return { value: undefined, done: true } },
      }
    },
  }
}
