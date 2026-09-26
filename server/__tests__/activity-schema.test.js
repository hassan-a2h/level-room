import { describe, expect, it } from 'vitest'
import {
  getBlock,
  isObjectiveBlock,
  parseActivityDocument,
  sanitizeActivityDocument,
  validateActivityDocument,
} from '../utils/activity-schema.js'

const outcomeIds = ['sql-choose-join', 'sql-explain-null']
const makeBlock = (id, type, fields = {}) => ({
  id,
  type,
  title: `Activity ${id}`,
  required: true,
  estimatedMinutes: 2,
  outcomeIds: [outcomeIds[0]],
  ...fields,
})

function makeActivityDocument() {
  return {
    schemaVersion: 1,
    promptVersion: 'session-activities-v1',
    generator: { provider: 'openai', model: 'example-model', generatedAt: '2026-09-26T12:00:00.000Z' },
    lesson: { lessonId: 42, outcomeIds: [...outcomeIds], estimatedMinutes: 20 },
    blocks: [
      makeBlock('read-joins', 'read', { content: 'A join combines rows from related tables.' }),
      makeBlock('worked-example', 'worked_example', {
        problem: 'Which records are preserved?',
        steps: [
          { id: 'inspect-rows', title: 'Inspect the rows', content: 'List the rows on both sides.' },
          { id: 'choose-join', title: 'Choose the join', content: 'Preserve every left-side row.' },
        ],
        takeaway: 'Choose based on which unmatched records should remain.',
      }),
      makeBlock('choose-join', 'choice', {
        prompt: 'Which join keeps every left row?',
        options: [{ id: 'inner', label: 'INNER JOIN' }, { id: 'left', label: 'LEFT JOIN' }],
        outcomeIds: [outcomeIds[0]],
      }),
      makeBlock('order-steps', 'ordering', {
        prompt: 'Order the query-building steps.',
        items: [{ id: 'from', label: 'Choose FROM' }, { id: 'join', label: 'Add JOIN' }, { id: 'select', label: 'Select columns' }],
        outcomeIds: [outcomeIds[1]],
      }),
      makeBlock('explain-null', 'short_answer', {
        prompt: 'Explain why unmatched values appear as NULL.',
        responseHint: 'Mention the preserved side and missing match.',
        minChars: 10,
        maxChars: 400,
        outcomeIds: [outcomeIds[1]],
      }),
      makeBlock('reflect', 'reflection', {
        prompt: 'What will you check first next time?',
        placeholder: 'Write a short note',
        maxChars: 300,
      }),
    ],
    answerKey: {
      'choose-join': { kind: 'choice', correctOptionId: 'left', explanation: 'LEFT JOIN preserves all rows on the left.', critical: true },
      'order-steps': { kind: 'ordering', correctOrder: ['from', 'join', 'select'], explanation: 'Start with the source, then join, then choose columns.', critical: false },
      'explain-null': {
        kind: 'short_answer',
        criteria: [
          { id: 'preserved-side', label: 'Preserved side', description: 'Identifies the side whose rows remain.', critical: true },
          { id: 'missing-match', label: 'Missing match', description: 'Explains that unmatched columns are NULL.', critical: false },
        ],
        exemplar: 'A LEFT JOIN preserves every left row; absent matches on the right appear as NULL.',
      },
    },
  }
}

function makeLesson() {
  return {
    id: 42,
    estimated_time: 20,
    outcomes: JSON.stringify(outcomeIds.map((id) => ({ id, title: id }))),
  }
}

describe('activity document schema', () => {
  it('accepts the complete private six-type fixture and validates its lesson binding', () => {
    const document = makeActivityDocument()
    expect(validateActivityDocument(document, makeLesson())).toEqual({ valid: true, value: document })
  })

  it('parses JSON documents and returns structured parse errors', () => {
    expect(parseActivityDocument(JSON.stringify(makeActivityDocument()))).toEqual({ valid: true, value: makeActivityDocument() })
    expect(parseActivityDocument('{broken')).toMatchObject({ valid: false, code: 'ACTIVITY_JSON_INVALID', path: '$' })
    expect(parseActivityDocument(12)).toMatchObject({ valid: false, code: 'ACTIVITY_JSON_INVALID', path: '$' })
  })

  it.each([
    ['schemaVersion', (doc) => { doc.schemaVersion = 2 }],
    ['promptVersion', (doc) => { doc.promptVersion = '' }],
    ['generator', (doc) => { delete doc.generator.model }],
    ['lesson', (doc) => { doc.lesson.lessonId = 43 }],
    ['lesson outcome IDs', (doc) => { doc.lesson.outcomeIds.push('unknown-outcome') }],
    ['lesson estimated minutes', (doc) => { doc.lesson.estimatedMinutes = 19 }],
    ['block ID', (doc) => { doc.blocks[0].id = 'Not kebab' }],
    ['block title', (doc) => { doc.blocks[0].title = 'x' }],
    ['missing block required flag', (doc) => { delete doc.blocks[0].required }],
    ['block duration', (doc) => { doc.blocks[0].estimatedMinutes = 0 }],
    ['block outcome IDs', (doc) => { doc.blocks[0].outcomeIds = ['not-declared'] }],
    ['unknown top-level field', (doc) => { doc.secret = true }],
    ['unknown block field', (doc) => { doc.blocks[0].metadata = {} }],
    ['unknown block type', (doc) => { doc.blocks[0].type = 'video' }],
    ['duplicate block IDs', (doc) => { doc.blocks[1].id = doc.blocks[0].id }],
    ['duplicate lesson outcome IDs', (doc) => { doc.lesson.outcomeIds[1] = doc.lesson.outcomeIds[0] }],
    ['non-boolean required flag', (doc) => { doc.blocks[0].required = 'true' }],
  ])('rejects invalid common document field: %s', (_name, mutate) => {
    const document = makeActivityDocument()
    mutate(document)
    expect(validateActivityDocument(document, makeLesson()).valid).toBe(false)
  })

  it('rejects a supplied lesson whose persisted outcome IDs are duplicated or different', () => {
    const duplicated = { ...makeLesson(), outcomes: JSON.stringify([{ id: outcomeIds[0] }, { id: outcomeIds[0] }]) }
    expect(validateActivityDocument(makeActivityDocument(), duplicated).valid).toBe(false)
    const different = { ...makeLesson(), outcomes: JSON.stringify([{ id: outcomeIds[0] }, { id: 'different-outcome' }]) }
    expect(validateActivityDocument(makeActivityDocument(), different).valid).toBe(false)
  })

  it.each([
    ['read content', (block) => { block.content = '' }],
    ['worked-example problem', (block) => { block.problem = '' }],
    ['worked-example step count', (block) => { block.steps = [{ id: 'one', title: 'One', content: 'Only one step.' }] }],
    ['worked-example step shape', (block) => { block.steps[0].unexpected = true }],
    ['worked-example takeaway', (block) => { block.takeaway = '' }],
    ['choice prompt', (block) => { block.prompt = '' }],
    ['choice options count', (block) => { block.options = [{ id: 'only', label: 'Only option' }] }],
    ['choice option shape', (block) => { block.options[0].score = 1 }],
    ['ordering items count', (block) => { block.items = [{ id: 'only', label: 'Only item' }] }],
    ['ordering item shape', (block) => { block.items[0].answer = true }],
    ['short-answer response hint', (block) => { block.responseHint = '' }],
    ['short-answer character range', (block) => { block.maxChars = block.minChars - 1 }],
    ['reflection prompt', (block) => { block.prompt = '' }],
    ['reflection character cap', (block) => { block.maxChars = 401 }],
  ])('rejects invalid type-specific public schema: %s', (name, mutate) => {
    const document = makeActivityDocument()
    const typeByName = {
      'read content': 'read',
      'worked-example problem': 'worked_example', 'worked-example step count': 'worked_example', 'worked-example step shape': 'worked_example', 'worked-example takeaway': 'worked_example',
      'choice prompt': 'choice', 'choice options count': 'choice', 'choice option shape': 'choice',
      'ordering items count': 'ordering', 'ordering item shape': 'ordering',
      'short-answer response hint': 'short_answer', 'short-answer character range': 'short_answer',
      'reflection prompt': 'reflection', 'reflection character cap': 'reflection',
    }
    mutate(document.blocks.find((block) => block.type === typeByName[name]))
    expect(validateActivityDocument(document, makeLesson()).valid).toBe(false)
  })

  it.each([
    ['choice key', 'choose-join', (key) => { key.correctOptionId = 'missing' }],
    ['choice key field allowlist', 'choose-join', (key) => { key.answer = 'left' }],
    ['ordering key', 'order-steps', (key) => { key.correctOrder = ['from', 'from', 'select'] }],
    ['short-answer criteria count', 'explain-null', (key) => { key.criteria = [{ id: 'one', label: 'Only', description: 'One criterion', critical: true }] }],
    ['short-answer criterion shape', 'explain-null', (key) => { key.criteria[0].extra = 'unsupported' }],
    ['short-answer exemplar', 'explain-null', (key) => { key.exemplar = '' }],
  ])('rejects invalid private answer key: %s', (_name, blockId, mutate) => {
    const document = makeActivityDocument()
    mutate(document.answerKey[blockId])
    expect(validateActivityDocument(document, makeLesson()).valid).toBe(false)
  })

  it('requires exact answer-key parity with all graded block IDs', () => {
    const missing = makeActivityDocument()
    delete missing.answerKey['order-steps']
    expect(validateActivityDocument(missing, makeLesson()).valid).toBe(false)
    const extra = makeActivityDocument()
    extra.answerKey.reflect = { kind: 'reflection' }
    expect(validateActivityDocument(extra, makeLesson()).valid).toBe(false)
  })

  it.each([
    ['duplicate option IDs', (doc) => { doc.blocks[2].options[1].id = 'inner' }],
    ['duplicate item IDs', (doc) => { doc.blocks[3].items[1].id = 'from' }],
    ['duplicate step IDs', (doc) => { doc.blocks[1].steps[1].id = 'inspect-rows' }],
    ['duplicate criterion IDs', (doc) => { doc.answerKey['explain-null'].criteria[1].id = 'preserved-side' }],
    ['wrong answer key kind', (doc) => { doc.answerKey['choose-join'].kind = 'ordering' }],
    ['unsafe script content', (doc) => { doc.blocks[0].content = '<script>alert(1)</script>' }],
    ['event attribute content', (doc) => { doc.blocks[0].content = '<img src="x" onerror="alert(1)">' }],
    ['external image embed', (doc) => { doc.blocks[0].content = '![diagram](https://example.com/image.png)' }],
    ['data URL content', (doc) => { doc.blocks[0].content = 'data:text/html;base64,PHNjcmlwdD4=' }],
    ['too few blocks', (doc) => { doc.blocks = doc.blocks.slice(0, 3) }],
    ['too many blocks', (doc) => { doc.blocks.push(makeBlock('extra-one', 'read', { content: 'Extra.' }), makeBlock('extra-two', 'read', { content: 'Extra.' }), makeBlock('extra-three', 'read', { content: 'Extra.' })) }],
    ['missing read block', (doc) => { doc.blocks = doc.blocks.filter((block) => block.type !== 'read') }],
    ['missing worked example', (doc) => { doc.blocks = doc.blocks.filter((block) => block.type !== 'worked_example') }],
    ['fewer than two active attempts', (doc) => { doc.blocks = doc.blocks.map((block) => ['choice', 'ordering', 'short_answer'].includes(block.type) ? { ...block, required: false } : block) }],
    ['no active attempt in final two blocks', (doc) => { doc.blocks = [doc.blocks[2], doc.blocks[3], doc.blocks[0], doc.blocks[1], doc.blocks[5], makeBlock('closing-read', 'read', { content: 'End with a review.' })] }],
    ['missing active outcome coverage', (doc) => { doc.blocks[2].outcomeIds = [outcomeIds[0]]; doc.blocks[3].outcomeIds = [outcomeIds[0]]; doc.blocks[4].outcomeIds = [outcomeIds[0]] }],
    ['invalid lesson timing', (doc) => { doc.blocks.forEach((block) => { block.estimatedMinutes = 1 }) }],
  ])('rejects invalid generation or safety contract: %s', (_name, mutate) => {
    const document = makeActivityDocument()
    mutate(document)
    expect(validateActivityDocument(document, makeLesson()).valid).toBe(false)
  })

  it('enforces string, collection, numeric, and serialized byte caps', () => {
    const invalidDocuments = []
    const title = makeActivityDocument()
    title.blocks[0].title = 'x'.repeat(121)
    invalidDocuments.push(title)
    const content = makeActivityDocument()
    content.blocks[0].content = 'x'.repeat(4001)
    invalidDocuments.push(content)
    const options = makeActivityDocument()
    options.blocks[2].options.push({ id: 'c', label: 'Another choice' }, { id: 'd', label: 'Fourth choice' }, { id: 'e', label: 'Fifth choice' }, { id: 'f', label: 'Sixth choice' })
    invalidDocuments.push(options)
    const response = makeActivityDocument()
    response.blocks[4].maxChars = 601
    invalidDocuments.push(response)
    const oversized = makeActivityDocument()
    oversized.blocks[0].content = 'x'.repeat(128 * 1024)
    invalidDocuments.push(oversized)
    for (const document of invalidDocuments) expect(validateActivityDocument(document, makeLesson()).valid).toBe(false)
    expect(parseActivityDocument(JSON.stringify(oversized))).toMatchObject({ valid: false, code: 'ACTIVITY_DOCUMENT_TOO_LARGE' })
  })

  it('accepts both inclusive total-time boundaries and the seven-item ordering maximum', () => {
    const lower = makeActivityDocument()
    lower.blocks.forEach((block) => { block.estimatedMinutes = 2 })
    expect(validateActivityDocument(lower, makeLesson()).valid).toBe(true)

    const upper = makeActivityDocument()
    upper.blocks.forEach((block, index) => { block.estimatedMinutes = index === 5 ? 5 : 4 })
    upper.blocks[3].items.push(
      { id: 'filter', label: 'Filter rows' },
      { id: 'group', label: 'Group rows' },
      { id: 'limit', label: 'Limit output' },
      { id: 'alias', label: 'Name columns' },
    )
    upper.answerKey['order-steps'].correctOrder.push('filter', 'group', 'limit', 'alias')
    expect(validateActivityDocument(upper, makeLesson()).valid).toBe(true)
  })

  it('rejects values beyond each exposed text and range cap', () => {
    const mutations = [
      (doc) => { doc.generator.provider = 'p'.repeat(81) },
      (doc) => { doc.generator.model = 'm'.repeat(121) },
      (doc) => { doc.lesson.outcomeIds.push('third-outcome', 'fourth-outcome', 'fifth-outcome', 'sixth-outcome') },
      (doc) => { doc.blocks[0].id = 'a'.repeat(81) },
      (doc) => { doc.blocks[0].estimatedMinutes = 16 },
      (doc) => { doc.blocks[0].outcomeIds = Array.from({ length: 6 }, (_, index) => `outcome-${index}`) },
      (doc) => { doc.blocks[1].problem = 'p'.repeat(1201) },
      (doc) => { doc.blocks[1].steps = Array.from({ length: 7 }, (_, index) => ({ id: `step-${index}`, title: 'Step', content: 'Do it.' })) },
      (doc) => { doc.blocks[1].steps[0].content = 'x'.repeat(2001) },
      (doc) => { doc.blocks[1].takeaway = 'x'.repeat(501) },
      (doc) => { doc.blocks[2].prompt = 'x'.repeat(1001) },
      (doc) => { doc.blocks[2].options[0].label = 'x'.repeat(301) },
      (doc) => { doc.blocks[3].items = Array.from({ length: 8 }, (_, index) => ({ id: `item-${index}`, label: 'Item' })) },
      (doc) => { doc.blocks[4].responseHint = 'x'.repeat(201) },
      (doc) => { doc.blocks[4].minChars = 101 },
      (doc) => { doc.blocks[4].maxChars = 600; doc.blocks[4].minChars = 601 },
      (doc) => { doc.blocks[5].placeholder = 'x'.repeat(161) },
      (doc) => { doc.answerKey['choose-join'].explanation = 'x'.repeat(1001) },
      (doc) => { doc.answerKey['explain-null'].criteria[0].label = 'x'.repeat(121) },
      (doc) => { doc.answerKey['explain-null'].criteria[0].description = 'x'.repeat(501) },
      (doc) => { doc.answerKey['explain-null'].exemplar = 'x'.repeat(1501) },
    ]
    for (const mutate of mutations) {
      const document = makeActivityDocument()
      mutate(document)
      expect(validateActivityDocument(document, makeLesson()).valid).toBe(false)
    }
  })

  it('sanitizes to the exact public allowlist and exposes block lookup and objective types', () => {
    const document = makeActivityDocument()
    const publicFixture = makeActivityDocument()
    document.blocks[1].steps[0].answerKey = 'private'
    document.blocks[2].options[0].correct = true
    const publicDocument = sanitizeActivityDocument(document)
    expect(publicDocument).toEqual({
      schemaVersion: 1,
      lesson: publicFixture.lesson,
      blocks: publicFixture.blocks.map(({ id, type, title, required, estimatedMinutes, outcomeIds: ids, content, problem, steps, takeaway, prompt, options, items, responseHint, minChars, maxChars, placeholder }) => ({
        id, type, title, required, estimatedMinutes, outcomeIds: ids,
        ...(content === undefined ? {} : { content }), ...(problem === undefined ? {} : { problem }), ...(steps === undefined ? {} : { steps }), ...(takeaway === undefined ? {} : { takeaway }),
        ...(prompt === undefined ? {} : { prompt }), ...(options === undefined ? {} : { options }), ...(items === undefined ? {} : { items }),
        ...(responseHint === undefined ? {} : { responseHint }), ...(minChars === undefined ? {} : { minChars }), ...(maxChars === undefined ? {} : { maxChars }), ...(placeholder === undefined ? {} : { placeholder }),
      })),
    })
    const serialized = JSON.stringify(publicDocument)
    for (const secret of ['answerKey', 'correctOptionId', 'correctOrder', 'exemplar', 'criteria', 'generator', 'generatedAt', 'provider']) expect(serialized).not.toContain(secret)
    expect(getBlock(document, 'choose-join')).toBe(document.blocks[2])
    expect(getBlock(document, 'not-present')).toBeUndefined()
    expect(document.blocks.map(isObjectiveBlock)).toEqual([false, false, true, true, false, false])
  })
})
