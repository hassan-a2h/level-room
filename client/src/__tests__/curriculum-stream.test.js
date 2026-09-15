import { describe, expect, it } from 'vitest'
import { readCurriculumStream } from '../curriculumStream.js'

describe('curriculum event stream reader', () => {
  it('accepts the validated named curriculum event emitted by the server', async () => {
    const curriculum = { course: { kind: 'core', stage: 0 }, modules: [{ title: 'Basics' }] }
    const response = streamResponse([
      `event: curriculum\ndata: ${JSON.stringify(curriculum)}\n\n`,
      `data: ${JSON.stringify('[DONE]')}\n\n`,
    ])

    await expect(readCurriculumStream(response)).resolves.toEqual(curriculum)
  })

  it('assembles text deltas across chunk and event boundaries until completion', async () => {
    const firstDelta = `data: ${JSON.stringify('{"modules":[')}\r\n\r\n`
    const secondDelta = `data: ${JSON.stringify('{"title":"Basics"}]}')}\r\n\r\n`
    const done = `data: ${JSON.stringify('[DONE]')}\r\n\r\n`
    const splitAt = firstDelta.indexOf('\r\n\r\n') + 1
    const response = streamResponse([
      firstDelta.slice(0, splitAt),
      `${firstDelta.slice(splitAt)}${secondDelta}${done}`,
    ])

    await expect(readCurriculumStream(response)).resolves.toEqual({
      modules: [{ title: 'Basics' }],
    })
  })

  it('surfaces structured SSE errors instead of trying to parse them as curriculum text', async () => {
    const response = streamResponse([
      'event: error\ndata: {"message":"The selected provider needs attention.","code":"LLM_CONFIG_INCOMPLETE"}\n\n',
    ])

    await expect(readCurriculumStream(response)).rejects.toThrow('The selected provider needs attention.')
  })

  it('preserves UTF-8 text when a multi-byte character crosses network chunks', async () => {
    const curriculum = { modules: [{ title: 'Café basics' }] }
    const body = `data: ${JSON.stringify(JSON.stringify(curriculum))}\n\ndata: ${JSON.stringify('[DONE]')}\n\n`
    const bytes = new TextEncoder().encode(body)
    const firstByte = bytes.findIndex((byte) => byte === 0xc3)
    const response = streamResponse([bytes.slice(0, firstByte + 1), bytes.slice(firstByte + 1)])

    await expect(readCurriculumStream(response)).resolves.toEqual(curriculum)
  })

  it('surfaces JSON errors for non-stream HTTP failures', async () => {
    const response = { ok: false, status: 503, json: async () => ({ error: 'Provider is offline.' }) }
    await expect(readCurriculumStream(response)).rejects.toThrow('Provider is offline.')
  })

  it('rejects streams that close before the done marker', async () => {
    await expect(readCurriculumStream(streamResponse(['data: "{\\"modules\\":[]}"\n\n'])))
      .rejects.toThrow('The learning path stream ended before completion.')
  })
})

function streamResponse(chunks) {
  const encoder = new TextEncoder()
  const values = chunks.map((chunk) => ArrayBuffer.isView(chunk) ? chunk : encoder.encode(chunk))
  let index = 0
  return {
    ok: true,
    body: {
      getReader: () => ({
        async read() {
          return index < values.length
            ? { done: false, value: values[index++] }
            : { done: true, value: undefined }
        },
      }),
    },
  }
}
