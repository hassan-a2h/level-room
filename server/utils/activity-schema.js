const MAX_DOCUMENT_BYTES = 128 * 1024
const ACTIVE_TYPES = new Set(['choice', 'ordering', 'short_answer'])
const OBJECTIVE_TYPES = new Set(['choice', 'ordering'])
const BLOCK_TYPES = new Set(['read', 'worked_example', 'choice', 'ordering', 'short_answer', 'reflection'])
const ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function invalid(path, message, code = 'ACTIVITY_DOCUMENT_INVALID') {
  return { valid: false, code, path, error: message }
}

function keysError(value, requiredKeys, optionalKeys = [], path) {
  const allowed = new Set([...requiredKeys, ...optionalKeys])
  for (const key of Object.keys(value)) {
    if (!allowed.has(key)) return invalid(`${path}.${key}`, `Field "${key}" is not supported.`)
  }
  for (const key of requiredKeys) {
    if (!Object.hasOwn(value, key)) return invalid(`${path}.${key}`, `Field "${key}" is required.`)
  }
  return null
}

function requireRecord(value, path) {
  return isRecord(value) ? null : invalid(path, 'Value must be an object.')
}

function requireString(value, path, min, max, { plain = false } = {}) {
  if (typeof value !== 'string' || value.length < min || value.length > max || !value.trim()) {
    return invalid(path, `Value must be a nonempty string between ${min} and ${max} characters.`)
  }
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(value)) return invalid(path, 'Control characters are not allowed.')
  if (plain && /<[^>]*>|[\r\n]/.test(value)) return invalid(path, 'This field must be plain text.')
  return null
}

function hasUnsafeContent(value) {
  return /<\s*\/?\s*[a-z][^>]*>/i.test(value)
    || /javascript\s*:|data\s*:/i.test(value)
    || /!\[[^\]]*\]\(\s*<?(?:https?:)?\/\//i.test(value)
}

function requireContentString(value, path, min, max, { plain = false } = {}) {
  const result = requireString(value, path, min, max, { plain })
  if (result) return result
  if (hasUnsafeContent(value)) return invalid(path, 'Unsafe content is not allowed.')
  return null
}

function requireInteger(value, path, min, max) {
  return Number.isInteger(value) && value >= min && value <= max
    ? null
    : invalid(path, `Value must be an integer between ${min} and ${max}.`)
}

function validateId(value, path, min = 2, max = 80) {
  if (typeof value !== 'string' || value.length < min || value.length > max || !ID_PATTERN.test(value)) {
    return invalid(path, `ID must be ${min}-${max} lowercase kebab-case characters.`)
  }
  return null
}

function validateUniqueIds(items, path, minCount, maxCount, itemName) {
  if (!Array.isArray(items) || items.length < minCount || items.length > maxCount) {
    return invalid(path, `${itemName} must contain ${minCount}-${maxCount} items.`)
  }
  const ids = new Set()
  for (const [index, item] of items.entries()) {
    const itemPath = `${path}[${index}]`
    const recordError = requireRecord(item, itemPath)
    if (recordError) return recordError
    const idError = validateId(item.id, `${itemPath}.id`, 1, 40)
    if (idError) return idError
    if (ids.has(item.id)) return invalid(`${itemPath}.id`, `Duplicate ID "${item.id}".`)
    ids.add(item.id)
  }
  return null
}

function parseLessonOutcomes(lesson) {
  let outcomes = lesson?.outcomes
  if (typeof outcomes === 'string') {
    try { outcomes = JSON.parse(outcomes) } catch { return null }
  }
  if (!Array.isArray(outcomes)) return null
  const ids = []
  for (const outcome of outcomes) {
    if (!isRecord(outcome) || typeof outcome.id !== 'string') return null
    ids.push(outcome.id)
  }
  return ids
}

function validateOptions(items, path, maxCount = 5, itemName = 'Options') {
  const countError = validateUniqueIds(items, path, 2, maxCount, itemName)
  if (countError) return countError
  for (const [index, item] of items.entries()) {
    const itemPath = `${path}[${index}]`
    const shapeError = keysError(item, ['id', 'label'], [], itemPath)
    if (shapeError) return shapeError
    const labelError = requireContentString(item.label, `${itemPath}.label`, 1, 300, { plain: true })
    if (labelError) return labelError
  }
  return null
}

function validateSteps(steps, path) {
  const countError = validateUniqueIds(steps, path, 2, 6, 'Steps')
  if (countError) return countError
  for (const [index, step] of steps.entries()) {
    const stepPath = `${path}[${index}]`
    const shapeError = keysError(step, ['id', 'title', 'content'], [], stepPath)
    if (shapeError) return shapeError
    const titleError = requireString(step.title, `${stepPath}.title`, 1, 100, { plain: true })
    if (titleError) return titleError
    const contentError = requireContentString(step.content, `${stepPath}.content`, 1, 2000)
    if (contentError) return contentError
  }
  return null
}

function validateCriteria(criteria, path) {
  const countError = validateUniqueIds(criteria, path, 2, 4, 'Criteria')
  if (countError) return countError
  for (const [index, criterion] of criteria.entries()) {
    const criterionPath = `${path}[${index}]`
    const shapeError = keysError(criterion, ['id', 'label', 'description', 'critical'], [], criterionPath)
    if (shapeError) return shapeError
    const labelError = requireString(criterion.label, `${criterionPath}.label`, 1, 120, { plain: true })
    if (labelError) return labelError
    const descriptionError = requireString(criterion.description, `${criterionPath}.description`, 1, 500, { plain: true })
    if (descriptionError) return descriptionError
    if (typeof criterion.critical !== 'boolean') return invalid(`${criterionPath}.critical`, 'Critical must be a boolean.')
  }
  return null
}

function validateBlockFields(block, index) {
  const path = `$.blocks[${index}]`
  const common = ['id', 'type', 'title', 'required', 'estimatedMinutes', 'outcomeIds']
  const fieldsByType = {
    read: ['content'],
    worked_example: ['problem', 'steps', 'takeaway'],
    choice: ['prompt', 'options'],
    ordering: ['prompt', 'items'],
    short_answer: ['prompt', 'responseHint', 'minChars', 'maxChars'],
    reflection: ['prompt', 'maxChars'],
  }
  const type = block.type
  if (!BLOCK_TYPES.has(type)) return invalid(`${path}.type`, `Block type "${type}" is not supported.`)
  const optional = type === 'reflection' ? ['placeholder'] : []
  const shapeError = keysError(block, [...common, ...fieldsByType[type]], optional, path)
  if (shapeError) return shapeError
  const idError = validateId(block.id, `${path}.id`)
  if (idError) return idError
  const titleError = requireString(block.title, `${path}.title`, 3, 120, { plain: true })
  if (titleError) return titleError
  if (typeof block.required !== 'boolean' || !block.required) return invalid(`${path}.required`, 'Version 1 blocks must be required.')
  const timeError = requireInteger(block.estimatedMinutes, `${path}.estimatedMinutes`, 1, 15)
  if (timeError) return timeError
  if (!Array.isArray(block.outcomeIds) || block.outcomeIds.length < 1 || block.outcomeIds.length > 5) return invalid(`${path}.outcomeIds`, 'Outcome IDs must contain 1-5 items.')
  const outcomeSet = new Set()
  for (const [outcomeIndex, outcomeId] of block.outcomeIds.entries()) {
    const outcomeIdError = validateId(outcomeId, `${path}.outcomeIds[${outcomeIndex}]`, 3, 80)
    if (outcomeIdError) return outcomeIdError
    if (outcomeSet.has(outcomeId)) return invalid(`${path}.outcomeIds[${outcomeIndex}]`, 'Outcome IDs must be unique.')
    outcomeSet.add(outcomeId)
  }

  if (type === 'read') return requireContentString(block.content, `${path}.content`, 1, 4000)
  if (type === 'worked_example') {
    const problemError = requireString(block.problem, `${path}.problem`, 1, 1200, { plain: true })
    if (problemError) return problemError
    const stepsError = validateSteps(block.steps, `${path}.steps`)
    if (stepsError) return stepsError
    return requireContentString(block.takeaway, `${path}.takeaway`, 1, 500)
  }
  if (type === 'choice' || type === 'ordering') {
    const promptError = requireContentString(block.prompt, `${path}.prompt`, 1, 1000)
    if (promptError) return promptError
    return type === 'choice'
      ? validateOptions(block.options, `${path}.options`)
      : validateOptions(block.items, `${path}.items`, 7, 'Items')
  }
  if (type === 'short_answer') {
    const promptError = requireContentString(block.prompt, `${path}.prompt`, 1, 1000)
    if (promptError) return promptError
    const hintError = requireString(block.responseHint, `${path}.responseHint`, 1, 200, { plain: true })
    if (hintError) return hintError
    const minError = requireInteger(block.minChars, `${path}.minChars`, 1, 100)
    if (minError) return minError
    return Number.isInteger(block.maxChars) && block.maxChars >= block.minChars && block.maxChars <= 600
      ? null
      : invalid(`${path}.maxChars`, 'Maximum response length must be between minChars and 600.')
  }
  const promptError = requireContentString(block.prompt, `${path}.prompt`, 1, 1000)
  if (promptError) return promptError
  if (Object.hasOwn(block, 'placeholder')) {
    const placeholderError = block.placeholder === '' ? null : requireString(block.placeholder, `${path}.placeholder`, 1, 160, { plain: true })
    if (placeholderError) return placeholderError
  }
  return requireInteger(block.maxChars, `${path}.maxChars`, 1, 400)
}

function validateAnswerKeyEntry(entry, block, path) {
  const recordError = requireRecord(entry, path)
  if (recordError) return recordError
  if (block.type === 'choice') {
    const shapeError = keysError(entry, ['kind', 'correctOptionId', 'explanation', 'critical'], [], path)
    if (shapeError) return shapeError
    if (entry.kind !== 'choice') return invalid(`${path}.kind`, 'Answer key kind must be choice.')
    if (!block.options.some((option) => option.id === entry.correctOptionId)) return invalid(`${path}.correctOptionId`, 'Correct option must match one of the public options.')
    const explanationError = requireContentString(entry.explanation, `${path}.explanation`, 1, 1000)
    if (explanationError) return explanationError
    return typeof entry.critical === 'boolean' ? null : invalid(`${path}.critical`, 'Critical must be a boolean.')
  }
  if (block.type === 'ordering') {
    const shapeError = keysError(entry, ['kind', 'correctOrder', 'explanation', 'critical'], [], path)
    if (shapeError) return shapeError
    if (entry.kind !== 'ordering') return invalid(`${path}.kind`, 'Answer key kind must be ordering.')
    const ids = block.items.map((item) => item.id)
    if (!Array.isArray(entry.correctOrder) || entry.correctOrder.length !== ids.length || new Set(entry.correctOrder).size !== ids.length || entry.correctOrder.some((id) => !ids.includes(id))) {
      return invalid(`${path}.correctOrder`, 'Correct order must contain every item ID exactly once.')
    }
    const explanationError = requireContentString(entry.explanation, `${path}.explanation`, 1, 1000)
    if (explanationError) return explanationError
    return typeof entry.critical === 'boolean' ? null : invalid(`${path}.critical`, 'Critical must be a boolean.')
  }
  const shapeError = keysError(entry, ['kind', 'criteria', 'exemplar'], [], path)
  if (shapeError) return shapeError
  if (entry.kind !== 'short_answer') return invalid(`${path}.kind`, 'Answer key kind must be short_answer.')
  const criteriaError = validateCriteria(entry.criteria, `${path}.criteria`)
  if (criteriaError) return criteriaError
  return requireString(entry.exemplar, `${path}.exemplar`, 1, 1500, { plain: true })
}

export function parseActivityDocument(raw) {
  if (typeof raw !== 'string') return invalid('$', 'Activity document must be JSON text.', 'ACTIVITY_JSON_INVALID')
  if (Buffer.byteLength(raw, 'utf8') > MAX_DOCUMENT_BYTES) return invalid('$', 'Activity document exceeds 128 KiB.', 'ACTIVITY_DOCUMENT_TOO_LARGE')
  try {
    return { valid: true, value: JSON.parse(raw) }
  } catch {
    return invalid('$', 'Activity document contains invalid JSON.', 'ACTIVITY_JSON_INVALID')
  }
}

export function validateActivityDocument(document, lesson) {
  let serialized
  try { serialized = JSON.stringify(document) } catch { return invalid('$', 'Activity document must be JSON-serializable.') }
  if (typeof serialized !== 'string') return invalid('$', 'Activity document must be JSON-serializable.')
  if (Buffer.byteLength(serialized, 'utf8') > MAX_DOCUMENT_BYTES) return invalid('$', 'Activity document exceeds 128 KiB.', 'ACTIVITY_DOCUMENT_TOO_LARGE')

  const topError = requireRecord(document, '$')
  if (topError) return topError
  const shapeError = keysError(document, ['schemaVersion', 'promptVersion', 'generator', 'lesson', 'blocks', 'answerKey'], [], '$')
  if (shapeError) return shapeError
  if (document.schemaVersion !== 1) return invalid('$.schemaVersion', 'Only activity schema version 1 is supported.')
  if (document.promptVersion !== 'session-activities-v1') return invalid('$.promptVersion', 'Unsupported activity prompt version.')

  const generatorError = requireRecord(document.generator, '$.generator')
  if (generatorError) return generatorError
  const generatorShapeError = keysError(document.generator, ['provider', 'model', 'generatedAt'], [], '$.generator')
  if (generatorShapeError) return generatorShapeError
  const providerError = requireString(document.generator.provider, '$.generator.provider', 1, 80, { plain: true })
  if (providerError) return providerError
  const modelError = requireString(document.generator.model, '$.generator.model', 1, 120, { plain: true })
  if (modelError) return modelError
  const generatedAt = document.generator.generatedAt
  if (typeof generatedAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(generatedAt) || Number.isNaN(Date.parse(generatedAt)) || new Date(generatedAt).toISOString() !== generatedAt) {
    return invalid('$.generator.generatedAt', 'Generated timestamp must be a valid UTC ISO timestamp.')
  }

  const lessonRecordError = requireRecord(document.lesson, '$.lesson')
  if (lessonRecordError) return lessonRecordError
  const lessonShapeError = keysError(document.lesson, ['lessonId', 'outcomeIds', 'estimatedMinutes'], [], '$.lesson')
  if (lessonShapeError) return lessonShapeError
  const lessonIdError = requireInteger(document.lesson.lessonId, '$.lesson.lessonId', 1, Number.MAX_SAFE_INTEGER)
  if (lessonIdError) return lessonIdError
  const lessonTimeError = requireInteger(document.lesson.estimatedMinutes, '$.lesson.estimatedMinutes', 1, 180)
  if (lessonTimeError) return lessonTimeError
  if (!Array.isArray(document.lesson.outcomeIds) || document.lesson.outcomeIds.length < 1 || document.lesson.outcomeIds.length > 5) return invalid('$.lesson.outcomeIds', 'Lesson outcome IDs must contain 1-5 items.')
  const declaredIds = new Set()
  for (const [index, outcomeId] of document.lesson.outcomeIds.entries()) {
    const idError = validateId(outcomeId, `$.lesson.outcomeIds[${index}]`, 3, 80)
    if (idError) return idError
    if (declaredIds.has(outcomeId)) return invalid(`$.lesson.outcomeIds[${index}]`, 'Lesson outcome IDs must be unique.')
    declaredIds.add(outcomeId)
  }
  const boundLessonId = lesson?.id ?? lesson?.lessonId
  if (!Number.isInteger(boundLessonId) || boundLessonId !== document.lesson.lessonId) return invalid('$.lesson.lessonId', 'Activity lesson ID does not match the supplied lesson.')
  const boundMinutes = lesson?.estimated_time ?? lesson?.estimatedMinutes
  if (!Number.isInteger(boundMinutes) || boundMinutes !== document.lesson.estimatedMinutes) return invalid('$.lesson.estimatedMinutes', 'Activity duration does not match the supplied lesson.')
  const boundOutcomes = parseLessonOutcomes(lesson)
  if (!boundOutcomes || boundOutcomes.length !== declaredIds.size || new Set(boundOutcomes).size !== declaredIds.size || boundOutcomes.some((id) => !declaredIds.has(id))) return invalid('$.lesson.outcomeIds', 'Activity outcomes must match the supplied lesson outcomes.')

  if (!Array.isArray(document.blocks) || document.blocks.length < 4 || document.blocks.length > 8) return invalid('$.blocks', 'Activity document must contain 4-8 blocks.')
  const blockIds = new Set()
  const byId = new Map()
  const coveredOutcomes = new Set()
  let readCount = 0
  let exampleCount = 0
  let activeCount = 0
  let totalMinutes = 0
  for (const [index, block] of document.blocks.entries()) {
    const recordError = requireRecord(block, `$.blocks[${index}]`)
    if (recordError) return recordError
    const blockError = validateBlockFields(block, index)
    if (blockError) return blockError
    if (blockIds.has(block.id)) return invalid(`$.blocks[${index}].id`, `Block ID "${block.id}" is repeated.`)
    blockIds.add(block.id)
    byId.set(block.id, block)
    totalMinutes += block.estimatedMinutes
    if (block.type === 'read') readCount += 1
    if (block.type === 'worked_example') exampleCount += 1
    if (ACTIVE_TYPES.has(block.type) && block.required) {
      activeCount += 1
      for (const outcomeId of block.outcomeIds) {
        if (!declaredIds.has(outcomeId)) return invalid(`$.blocks[${index}].outcomeIds`, `Outcome "${outcomeId}" is not declared by the lesson.`)
        coveredOutcomes.add(outcomeId)
      }
    } else {
      for (const outcomeId of block.outcomeIds) {
        if (!declaredIds.has(outcomeId)) return invalid(`$.blocks[${index}].outcomeIds`, `Outcome "${outcomeId}" is not declared by the lesson.`)
      }
    }
  }
  if (readCount < 1) return invalid('$.blocks', 'Activity requires at least one read block.')
  if (exampleCount < 1) return invalid('$.blocks', 'Activity requires at least one worked example.')
  if (activeCount < 2) return invalid('$.blocks', 'Activity requires at least two active attempts.')
  if (!document.blocks.slice(-2).some((block) => ACTIVE_TYPES.has(block.type) && block.required)) return invalid('$.blocks', 'An active attempt must appear in the final two blocks.')
  for (const outcomeId of declaredIds) {
    if (!coveredOutcomes.has(outcomeId)) return invalid('$.blocks', `Active attempts do not cover outcome "${outcomeId}".`)
  }
  const minimumMinutes = Math.max(5, boundMinutes * 0.6)
  const maximumMinutes = Math.min(45, boundMinutes * 1.25)
  if (totalMinutes < minimumMinutes || totalMinutes > maximumMinutes) return invalid('$.blocks', `Activity duration ${totalMinutes} must be between ${minimumMinutes} and ${maximumMinutes} minutes.`)

  const answerKeyError = requireRecord(document.answerKey, '$.answerKey')
  if (answerKeyError) return answerKeyError
  const expectedAnswerKeys = new Set(document.blocks.filter((block) => ACTIVE_TYPES.has(block.type)).map((block) => block.id))
  for (const answerId of Object.keys(document.answerKey)) {
    if (!expectedAnswerKeys.has(answerId)) return invalid(`$.answerKey.${answerId}`, 'Answer key entry has no graded block.')
  }
  for (const answerId of expectedAnswerKeys) {
    if (!Object.hasOwn(document.answerKey, answerId)) return invalid(`$.answerKey.${answerId}`, 'Graded block is missing its answer key.')
    const keyError = validateAnswerKeyEntry(document.answerKey[answerId], byId.get(answerId), `$.answerKey.${answerId}`)
    if (keyError) return keyError
  }
  return { valid: true, value: document }
}

export function sanitizeActivityDocument(document) {
  const blocks = Array.isArray(document?.blocks) ? document.blocks.map((block) => {
    if (!isRecord(block)) return null
    const safe = {
      id: block.id,
      type: block.type,
      title: block.title,
      required: block.required,
      estimatedMinutes: block.estimatedMinutes,
      outcomeIds: Array.isArray(block.outcomeIds) ? [...block.outcomeIds] : [],
    }
    for (const field of ['content', 'problem', 'steps', 'takeaway', 'prompt', 'options', 'items', 'responseHint', 'minChars', 'maxChars', 'placeholder']) {
      if (!Object.hasOwn(block, field)) continue
      if (field === 'steps' && Array.isArray(block.steps)) {
        safe.steps = block.steps.map((step) => ({ id: step.id, title: step.title, content: step.content }))
      } else if (['options', 'items'].includes(field) && Array.isArray(block[field])) {
        safe[field] = block[field].map((item) => ({ id: item.id, label: item.label }))
      } else {
        safe[field] = block[field]
      }
    }
    return safe
  }).filter(Boolean) : []
  return {
    schemaVersion: document?.schemaVersion,
    lesson: {
      lessonId: document?.lesson?.lessonId,
      outcomeIds: Array.isArray(document?.lesson?.outcomeIds) ? [...document.lesson.outcomeIds] : [],
      estimatedMinutes: document?.lesson?.estimatedMinutes,
    },
    blocks,
  }
}

export function getBlock(document, blockId) {
  return Array.isArray(document?.blocks) ? document.blocks.find((block) => block?.id === blockId) : undefined
}

export function isObjectiveBlock(block) {
  return OBJECTIVE_TYPES.has(block?.type)
}
