export async function readCurriculumStream(response) {
  if (!response?.ok) {
    const body = await response?.json?.().catch(() => ({}))
    throw new Error(body?.error || body?.message || `HTTP ${response?.status || 'error'}`)
  }
  if (typeof response.body?.getReader !== 'function') {
    throw new Error('The learning path response did not include a readable stream.')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''
  let curriculumPayload = null
  let completed = false

  const consumeEvent = (block) => {
    let event = 'message'
    const data = []
    for (const line of block.split(/\r?\n/)) {
      if (!line || line.startsWith(':')) continue
      const separator = line.indexOf(':')
      const field = separator < 0 ? line : line.slice(0, separator)
      let value = separator < 0 ? '' : line.slice(separator + 1)
      if (value.startsWith(' ')) value = value.slice(1)
      if (field === 'event') event = value
      if (field === 'data') data.push(value)
    }
    if (data.length === 0) return

    let payload
    try {
      payload = JSON.parse(data.join('\n'))
    } catch {
      throw new Error('The learning path stream returned malformed data.')
    }
    if (event === 'error') {
      throw new Error(payload?.message || payload?.error || 'The learning path could not be generated.')
    }
    if (payload === '[DONE]') {
      completed = true
      return
    }
    if (event === 'curriculum') {
      if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
        curriculumPayload = payload
        return
      }
      if (typeof payload !== 'string') {
        throw new Error('The learning path stream returned an unexpected curriculum event.')
      }
    }
    if (typeof payload !== 'string') {
      throw new Error('The learning path stream returned an unexpected event.')
    }
    fullText += payload
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    let boundary
    while ((boundary = buffer.search(/\r?\n\r?\n/)) >= 0) {
      const block = buffer.slice(0, boundary)
      const separator = buffer.slice(boundary).match(/^\r?\n\r?\n/)[0]
      buffer = buffer.slice(boundary + separator.length)
      consumeEvent(block)
    }
  }
  buffer += decoder.decode()
  if (buffer.trim()) consumeEvent(buffer)
  if (!completed) throw new Error('The learning path stream ended before completion.')

  if (curriculumPayload) return curriculumPayload

  const json = fullText.replace(/```json/gi, '').replace(/```/g, '').trim()
  try {
    return JSON.parse(json)
  } catch {
    throw new Error('The learning path stream returned invalid JSON.')
  }
}
