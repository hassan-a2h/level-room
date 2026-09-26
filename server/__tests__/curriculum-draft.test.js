import { describe, expect, it } from 'vitest'
import { collectCurriculumDraft } from '../utils/curriculum-draft.js'

describe('curriculum draft collection', () => {
  it('reports streamed chunks for generation lease renewal', async () => {
    const chunks = []
    const stream = (async function* () {
      yield '{"modules":['
      yield '{"title":"Basics","lessons":[{"title":"Intro","depth":"Beginner","estimated_time":10,"outcomes":["Understand"],"prerequisites":[]}]}'
      yield ']}'
    })()

    await expect(collectCurriculumDraft(stream, { onChunk: (chunk) => chunks.push(chunk) })).resolves.toMatchObject({
      modules: [{ title: 'Basics' }],
    })
    expect(chunks).toHaveLength(3)
  })
})
