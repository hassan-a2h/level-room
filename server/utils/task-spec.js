export const TASK_SETUP_KINDS = Object.freeze(['local', 'open_source', 'free_public', 'no_software'])

const LIMITS = Object.freeze({
  title: 120,
  scenario: 600,
  goal: 300,
  constraint: 180,
  deliverable: 180,
  successCriterion: 180,
  setupDescription: 400,
  hint: 180,
  safetyNote: 200,
})

const NEGATION = /\b(do not|don't|never|without|avoid|no)\b/i
const IMPERATIVE = /\b(use|enter|paste|provide|upload|share|connect|deploy|run|send|call|create|register|sign\s*up|log\s*in|install|configure|access|target|point)\b/i
const UNSAFE = /\b(paid|payment|credit\s*card|billing|production|prod\b|live\s+(?:system|service|site|endpoint)|api\s*(?:key|token)|access\s*token|secret|password|credential|account|register|sign\s*up|log\s*in|external\s+(?:system|target)|remote\s+(?:system|host)|third[- ]party)\b/i

export class TaskSpecValidationError extends Error {
  constructor(message, code = 'INVALID_TASK_SPEC') {
    super(message)
    this.name = 'TaskSpecValidationError'
    this.code = code
  }
}

function checkString(value, field, max, { required = true } = {}) {
  if (typeof value !== 'string') return { valid: false, error: `${field} must be a string.` }
  const trimmed = value.trim()
  if (required && !trimmed) return { valid: false, error: `${field} is required.` }
  if (trimmed.length > max) return { valid: false, error: `${field} must be at most ${max} characters.` }
  return { valid: true, value: trimmed }
}

function checkList(value, field, { min, max, itemMax }) {
  if (!Array.isArray(value) || value.length < min || value.length > max) {
    return { valid: false, error: `${field} must contain ${min}-${max} items.` }
  }
  const normalized = []
  for (const [index, item] of value.entries()) {
    const result = checkString(item, `${field}[${index}]`, itemMax)
    if (!result.valid) return result
    normalized.push(result.value)
  }
  return { valid: true, value: normalized }
}

export function validateTaskTextPolicy(text) {
  if (typeof text !== 'string' || !text.trim()) return { valid: true }
  if (!IMPERATIVE.test(text) || !UNSAFE.test(text)) return { valid: true }

  const unsafeMatches = text.matchAll(new RegExp(UNSAFE.source, 'gi'))
  for (const match of unsafeMatches) {
    const before = text.slice(0, match.index)
    const sentenceStart = Math.max(
      before.lastIndexOf('.'),
      before.lastIndexOf('!'),
      before.lastIndexOf('?'),
      before.lastIndexOf(';'),
      before.lastIndexOf(':'),
      before.lastIndexOf(','),
      before.lastIndexOf('\n'),
    ) + 1
    const context = before.slice(sentenceStart)
    if (!NEGATION.test(context)) {
      return { valid: false, error: 'Task instructions may not require paid services, accounts, secrets, production systems, or external targets.' }
    }
  }
  return { valid: true }
}

function validateSetup(value, field, isPrimary) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return { valid: false, error: `${field} is required.` }
  if (!TASK_SETUP_KINDS.includes(value.kind)) return { valid: false, error: `${field}.kind is unsupported.` }
  const description = checkString(value.description, `${field}.description`, LIMITS.setupDescription)
  if (!description.valid) return description
  for (const flag of ['requires_account', 'requires_payment', 'requires_secret', 'requires_external_target']) {
    if (typeof value[flag] !== 'boolean') return { valid: false, error: `${field}.${flag} must be boolean.` }
  }
  if (value.requires_payment || value.requires_secret || value.requires_external_target) {
    return { valid: false, error: `${field} cannot require payment, secrets, or an external target.` }
  }
  if (!isPrimary && value.requires_account) return { valid: false, error: 'free_fallback must not require an account.' }
  if (value.requires_account && (!isPrimary || value.kind !== 'free_public')) {
    return { valid: false, error: `${field} may require an account only for a free_public primary setup.` }
  }
  const policy = validateTaskTextPolicy(value.description)
  if (!policy.valid) return policy
  return {
    valid: true,
    value: {
      kind: value.kind,
      description: description.value,
      requires_account: value.requires_account,
      requires_payment: false,
      requires_secret: false,
      requires_external_target: false,
    },
  }
}

export function validateTaskSpec(task) {
  if (!task || typeof task !== 'object' || Array.isArray(task)) return { valid: false, error: 'Task specification must be an object.' }
  const fields = [
    ['title', LIMITS.title],
    ['scenario', LIMITS.scenario],
    ['goal', LIMITS.goal],
  ]
  const output = {}
  for (const [field, max] of fields) {
    const result = checkString(task[field], field, max)
    if (!result.valid) return result
    output[field] = result.value
    const policy = validateTaskTextPolicy(result.value)
    if (!policy.valid) return policy
  }

  const lists = [
    ['constraints', 1, 5, LIMITS.constraint],
    ['deliverables', 2, 4, LIMITS.deliverable],
    ['success_criteria', 2, 4, LIMITS.successCriterion],
  ]
  for (const [field, min, max, itemMax] of lists) {
    const result = checkList(task[field], field, { min, max, itemMax })
    if (!result.valid) return result
    output[field] = result.value
    for (const item of output[field]) {
      const policy = validateTaskTextPolicy(item)
      if (!policy.valid) return policy
    }
  }

  if (!Number.isInteger(task.estimated_time) || task.estimated_time < 1 || task.estimated_time > 180) {
    return { valid: false, error: 'estimated_time must be an integer from 1 to 180.' }
  }
  output.estimated_time = task.estimated_time

  const primary = validateSetup(task.primary_setup, 'primary_setup', true)
  if (!primary.valid) return primary
  const fallback = validateSetup(task.free_fallback, 'free_fallback', false)
  if (!fallback.valid) return fallback
  if (primary.value.requires_account && fallback.value.requires_account) {
    return { valid: false, error: 'An account-required primary setup needs an account-free fallback.' }
  }
  output.primary_setup = primary.value
  output.free_fallback = fallback.value

  const hints = Array.isArray(task.hints) ? task.hints : []
  const hintResult = hints.length === 0
    ? { valid: true, value: [] }
    : checkList(hints, 'hints', { min: 0, max: 2, itemMax: LIMITS.hint })
  if (!hintResult.valid) return hintResult
  output.hints = hintResult.value

  const safety = Array.isArray(task.safety_notes) ? task.safety_notes : []
  const safetyResult = safety.length === 0
    ? { valid: true, value: [] }
    : checkList(safety, 'safety_notes', { min: 0, max: 3, itemMax: LIMITS.safetyNote })
  if (!safetyResult.valid) return safetyResult
  output.safety_notes = safetyResult.value
  for (const text of [...output.hints, ...output.safety_notes]) {
    const policy = validateTaskTextPolicy(text)
    if (!policy.valid) return policy
  }

  return { valid: true, value: output }
}

export function normalizeTaskSpec(task) {
  const result = validateTaskSpec(task)
  if (!result.valid) throw new TaskSpecValidationError(result.error)
  return result.value
}
