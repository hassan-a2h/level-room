export class LlmClientError extends Error {
  constructor(message, { code, retryable = false } = {}) {
    super(message)
    this.name = 'LlmClientError'
    this.code = code
    this.retryable = retryable
  }
}
