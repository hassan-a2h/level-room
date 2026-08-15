import { CODEX_PROVIDER_ID } from './codex-credential-store.js'
import { LlmClientError } from './errors.js'

const DEFAULT_FIRST_BYTE_TIMEOUT_MS = 45_000
const DEFAULT_IDLE_TIMEOUT_MS = 90_000
const DEFAULT_COMPLETION_TIMEOUT_MS = 10 * 60_000

export function createCodexAdapter({
  models,
  auth,
  firstByteTimeoutMs = DEFAULT_FIRST_BYTE_TIMEOUT_MS,
  idleTimeoutMs = DEFAULT_IDLE_TIMEOUT_MS,
  completionTimeoutMs = DEFAULT_COMPLETION_TIMEOUT_MS,
} = {}) {
  if (!models || !auth) throw new TypeError('Codex adapter requires Pi Models and auth runtimes.')

  function prepareRequest(params) {
    const { model: modelId, reasoningEffort, messages, system, signal } = params
    if (typeof modelId !== 'string' || !modelId) {
      throw new LlmClientError('Model is required.', { code: 'MISSING_MODEL' })
    }
    const model = models.getModel(CODEX_PROVIDER_ID, modelId)
    if (!model || model.provider !== CODEX_PROVIDER_ID) {
      throw new LlmClientError('The selected Codex model is unavailable. Choose another model in Settings.', {
        code: 'UNSUPPORTED_MODEL',
      })
    }
    if (typeof reasoningEffort !== 'string' || model.thinkingLevelMap?.[reasoningEffort] == null) {
      throw new LlmClientError('The selected reasoning level is not supported by this Codex model.', {
        code: 'UNSUPPORTED_REASONING_EFFORT',
      })
    }
    if (system !== undefined && typeof system !== 'string') {
      throw new LlmClientError('The system prompt must be text.', { code: 'UNSUPPORTED_MESSAGE' })
    }
    if (!Array.isArray(messages)) {
      throw new LlmClientError('Messages must be a list of text messages.', { code: 'UNSUPPORTED_MESSAGE' })
    }

    const piMessages = messages.map((message) => toPiMessage(message, model))
    const context = { messages: piMessages }
    if (system) context.systemPrompt = system
    const credentialGeneration = Object.hasOwn(params, 'credentialGeneration')
      ? params.credentialGeneration
      : auth.captureCredentialGeneration()
    if (!credentialGeneration) {
      throw new LlmClientError('Connect your Codex account in Settings before continuing.', {
        code: 'MISSING_CODEX_AUTH',
      })
    }
    return { context, model, reasoning: reasoningEffort, credentialGeneration, signal }
  }

  async function streamText(params) {
    const request = prepareRequest(params)
    const controller = new AbortController()
    const options = makeOptions(request.reasoning, controller, idleTimeoutMs)
    const stream = auth.runWithCredentialGeneration(
      request.credentialGeneration,
      () => models.streamSimple(request.model, request.context, options),
    )
    return {
      textStream: createTextStream({
        stream,
        auth,
        generation: request.credentialGeneration,
        controller,
        callerSignal: request.signal,
        firstByteTimeoutMs,
        idleTimeoutMs,
      }),
    }
  }

  async function generateText(params) {
    const request = prepareRequest(params)
    const controller = new AbortController()
    const removeAbortListener = bindCallerSignal(request.signal, controller)
    const options = makeOptions(request.reasoning, controller, idleTimeoutMs)
    const timeout = createTimeout(completionTimeoutMs, timeoutError('upstream'), () => {
      controller.abort()
    })
    try {
      const completion = await raceWithTimeout(
        auth.runWithCredentialGeneration(
          request.credentialGeneration,
          () => models.completeSimple(request.model, request.context, options),
        ),
        timeout.promise,
        controller.signal,
      )
      if (completion?.stopReason === 'aborted') {
        throw new LlmClientError('Codex request was cancelled.', { code: 'REQUEST_ABORTED', retryable: false })
      }
      if (completion?.stopReason === 'error' || completion?.errorMessage) {
        throw normalizeCodexError(completion, controller.signal)
      }
      if (completion?.stopReason !== 'stop') {
        throw incompleteCompletionError()
      }
      const text = extractText(completion?.content)
      if (!text.trim()) throw incompleteCompletionError()
      return {
        text,
        usage: mapUsage(completion?.usage),
        finishReason: completion?.stopReason,
      }
    } catch (error) {
      throw normalizeCodexError(error, controller.signal)
    } finally {
      timeout.cancel()
      removeAbortListener()
    }
  }

  return { streamText, generateText }
}

function toPiMessage(message, model) {
  if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') {
    throw new LlmClientError('Codex accepts only text user and assistant messages.', { code: 'UNSUPPORTED_MESSAGE' })
  }
  const timestamp = Number.isSafeInteger(message.timestamp) ? message.timestamp : Date.now()
  if (message.role === 'user') return { role: 'user', content: message.content, timestamp }
  return {
    role: 'assistant',
    content: [{ type: 'text', text: message.content }],
    api: model.api,
    provider: model.provider,
    model: model.id,
    usage: emptyUsage(),
    stopReason: 'stop',
    timestamp,
  }
}

function emptyUsage() {
  return {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
  }
}

function makeOptions(reasoning, controller, timeoutMs) {
  return { reasoning, transport: 'sse', signal: controller.signal, timeoutMs }
}

function createTextStream({ stream, auth, generation, controller, callerSignal, firstByteTimeoutMs, idleTimeoutMs }) {
  let consumed = false
  return {
    [Symbol.asyncIterator]() {
      if (consumed) {
        return {
          async next() {
            throw new LlmClientError('Codex stream can only be consumed once.', { code: 'STREAM_ALREADY_CONSUMED' })
          },
          async return() { return { done: true, value: undefined } },
        }
      }
      consumed = true
      return createEventIterator({ stream, auth, generation, controller, callerSignal, firstByteTimeoutMs, idleTimeoutMs })
    },
  }
}

function createEventIterator({ stream, auth, generation, controller, callerSignal, firstByteTimeoutMs, idleTimeoutMs }) {
  let iterator
  let startedAt
  let sawActivity = false
  let sawText = false
  let finished = false
  let callerAbortCleanup = () => {}

  function ensureCallerSignal() {
    if (startedAt !== undefined) return
    startedAt = Date.now()
    callerAbortCleanup = bindCallerSignal(callerSignal, controller)
  }

  async function finish() {
    if (finished) return
    finished = true
    callerAbortCleanup()
    if (iterator?.return) {
      try {
        await auth.runWithCredentialGeneration(generation, () => iterator.return())
      } catch {
        // The underlying provider may reject while the request is being aborted.
      }
    }
  }

  async function next() {
    if (finished) return { done: true, value: undefined }
    ensureCallerSignal()
    if (!iterator) {
      try {
        iterator = await auth.runWithCredentialGeneration(generation, () => stream[Symbol.asyncIterator]())
      } catch (error) {
        await finish()
        throw normalizeCodexError(error, controller.signal)
      }
    }

    while (!finished) {
      const elapsed = Date.now() - startedAt
      const timeoutMs = sawActivity ? idleTimeoutMs : firstByteTimeoutMs - elapsed
      if (timeoutMs <= 0) {
        controller.abort()
        await finish()
        throw timeoutError(sawActivity ? 'idle' : 'first_byte')
      }

      const timeout = createTimeout(
        timeoutMs,
        timeoutError(sawActivity ? 'idle' : 'first_byte'),
        () => controller.abort(),
      )
      try {
        const result = await raceWithTimeout(
          auth.runWithCredentialGeneration(generation, () => iterator.next()),
          timeout.promise,
          controller.signal,
        )
        timeout.cancel()
        if (result.done) {
          await finish()
          throw incompleteCompletionError()
        }
        const event = result.value
        if (event?.type === 'error') {
          await finish()
          if (event.reason === 'aborted') {
            throw new LlmClientError('Codex request was cancelled.', { code: 'REQUEST_ABORTED', retryable: false })
          }
          throw normalizeCodexError(event.error || event, controller.signal)
        }
        if (event?.type === 'done') {
          await finish()
          if (event.reason !== 'stop' || !sawText) throw incompleteCompletionError()
          return { done: true, value: undefined }
        }
        if (event?.type === 'text_delta' && typeof event.delta === 'string') {
          sawActivity = true
          if (event.delta) {
            sawText = true
            return { done: false, value: event.delta }
          }
        } else if (event?.type === 'thinking_delta' && typeof event.delta === 'string') {
          sawActivity = true
        }
      } catch (error) {
        timeout.cancel()
        controller.abort()
        await finish()
        throw normalizeCodexError(error, controller.signal)
      }
    }
    return { done: true, value: undefined }
  }

  return {
    next,
    async return() {
      controller.abort()
      await finish()
      return { done: true, value: undefined }
    },
    async throw(error) {
      controller.abort()
      await finish()
      throw error
    },
  }
}

function bindCallerSignal(signal, controller) {
  if (!signal) return () => {}
  const abort = () => controller.abort(signal.reason)
  if (signal.aborted) abort()
  else signal.addEventListener('abort', abort, { once: true })
  return () => signal.removeEventListener('abort', abort)
}

function createTimeout(duration, timeoutFailure, onTimeout) {
  let rejectTimeout
  const promise = new Promise((_, reject) => { rejectTimeout = reject })
  const handle = setTimeout(() => {
    rejectTimeout(timeoutFailure)
    onTimeout()
  }, duration)
  return { promise, cancel: () => clearTimeout(handle) }
}

function raceWithTimeout(operation, timeout, signal) {
  if (!signal) return Promise.race([operation, timeout])
  if (signal.aborted) return Promise.reject(normalizeCodexError(signal.reason, signal))
  let removeAbortListener = () => {}
  const aborted = new Promise((_, reject) => {
    const onAbort = () => reject(normalizeCodexError(signal.reason, signal))
    signal.addEventListener('abort', onAbort, { once: true })
    removeAbortListener = () => signal.removeEventListener('abort', onAbort)
  })
  return Promise.race([operation, timeout, aborted]).finally(removeAbortListener)
}

function timeoutError(kind) {
  const message = kind === 'first_byte'
    ? 'Codex did not start responding in time. Please retry.'
    : kind === 'idle'
      ? 'Codex stopped responding. Please retry.'
      : 'Codex request timed out. Please retry.'
  return new LlmClientError(message, { code: 'LLM_TIMEOUT', retryable: true })
}

function incompleteCompletionError() {
  return new LlmClientError('Codex returned an incomplete response. Please retry.', {
    code: 'LLM_INCOMPLETE_RESPONSE',
    retryable: true,
  })
}

function normalizeCodexError(error, signal) {
  if (error instanceof LlmClientError) return error
  if (error?.code === 'CODEX_CREDENTIAL_CHANGED' || error?.code === 'CODEX_STALE_FLOW') {
    return new LlmClientError('The Codex account changed while this request was starting. Please retry.', {
      code: 'CODEX_ACCOUNT_CHANGED',
      retryable: false,
    })
  }
  if (signal?.aborted) {
    return new LlmClientError('Codex request was cancelled.', { code: 'REQUEST_ABORTED', retryable: false })
  }

  const status = Number(error?.status || error?.statusCode || error?.response?.status)
  const detail = [error?.code, error?.message, error?.errorMessage, error?.rawStopReason]
    .filter((value) => typeof value === 'string')
    .join(' ')
    .toLowerCase()

  if (status === 401 || status === 403 || /unauthorized|invalid.?token|invalid[_\s-]?grant|authentication|auth failed|oauth.*(?:expired|failed)|refresh.*(?:reject|failed)/.test(detail)) {
    return new LlmClientError('Codex authorization failed. Reconnect your account in Settings.', {
      code: 'CODEX_AUTH_FAILED', retryable: false,
    })
  }
  if (status === 429 || /rate.?limit|quota/.test(detail)) {
    return new LlmClientError('Codex quota or rate limit reached. Wait or switch providers in Settings.', {
      code: 'LLM_RATE_LIMIT', retryable: true,
    })
  }
  if (status === 404 || /model.*(access|not found|unavailable)/.test(detail)) {
    return new LlmClientError('This Codex model is unavailable for the connected account.', {
      code: 'CODEX_MODEL_UNAVAILABLE', retryable: false,
    })
  }
  if (/timeout|timed out|etimedout|abort(ed)?/.test(detail)) return timeoutError('upstream')
  if (/econn|enotfound|network|fetch failed|unavailable/.test(detail)) {
    return new LlmClientError('Codex is temporarily unavailable. Check your connection and retry.', {
      code: 'LLM_PROVIDER_UNAVAILABLE', retryable: true,
    })
  }
  return new LlmClientError('Codex could not complete the request.', { code: 'LLM_ERROR', retryable: true })
}

function extractText(content) {
  if (!Array.isArray(content)) return ''
  return content.filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
}

function mapUsage(usage) {
  if (!usage || typeof usage !== 'object') return undefined
  return {
    promptTokens: Number.isFinite(usage.input) ? usage.input : 0,
    completionTokens: Number.isFinite(usage.output) ? usage.output : 0,
    totalTokens: Number.isFinite(usage.totalTokens) ? usage.totalTokens : 0,
  }
}
