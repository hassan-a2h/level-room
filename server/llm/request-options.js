export function llmRequestOptions(config, { signal } = {}) {
  return {
    provider: config.provider,
    apiKey: config.apiKey,
    model: config.model,
    reasoningEffort: config.reasoningEffort,
    credentialGeneration: config.credentialGeneration,
    ...(signal ? { signal } : {}),
  }
}

export function createRequestAbortSignal(req, res) {
  const controller = new AbortController()
  const abort = () => {
    if (!controller.signal.aborted) controller.abort(new Error('Client disconnected.'))
  }
  const onResponseClose = () => {
    if (!res.writableEnded) abort()
    cleanup()
  }
  const onRequestAborted = () => {
    abort()
    cleanup()
  }
  const cleanup = () => {
    req.off('aborted', onRequestAborted)
    res.off('close', onResponseClose)
    res.off('finish', cleanup)
  }

  req.once('aborted', onRequestAborted)
  res.once('close', onResponseClose)
  res.once('finish', cleanup)
  if (req.aborted) abort()
  return { signal: controller.signal, cleanup }
}
