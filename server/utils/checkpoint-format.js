const ENVELOPE_FIELDS = new Set(['schemaVersion', 'publicQuestions', 'answerKey'])
const OUTCOME_FIELDS = new Set(['id', 'title', 'kind', 'role', 'evidence'])
const EVIDENCE_TYPES = new Set(['activity', 'checkpoint', 'artifact'])
const CHOICE_QUESTION_FIELDS = new Set(['id', 'text', 'type', 'weight', 'required', 'outcomeIds', 'options'])
const WRITTEN_QUESTION_FIELDS = new Set(['id', 'text', 'type', 'weight', 'required', 'outcomeIds'])
const CHECKPOINT_OUTCOME_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const CHECKPOINT_QUESTION_ID = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function invalid(code = 'CHECKPOINT_ENVELOPE_INVALID', path = 'checkpoint', error = 'Checkpoint data is invalid.') {
  return { valid: false, code, path, error }
}

function exactKeys(value, allowed) {
  return Object.keys(value).every((key) => allowed.has(key))
}

function validateOutcomes(outcomes) {
  if (!Array.isArray(outcomes) || outcomes.length === 0) {
    return invalid('CHECKPOINT_OUTCOMES_INVALID', 'outcomes', 'Chapter outcomes are unavailable.')
  }

  const ids = new Set()
  let hasCore = false
  for (const [index, outcome] of outcomes.entries()) {
    const path = `outcomes[${index}]`
    if (!isRecord(outcome) || !exactKeys(outcome, OUTCOME_FIELDS)
      || typeof outcome.id !== 'string' || outcome.id.length < 3 || outcome.id.length > 80 || !CHECKPOINT_OUTCOME_ID.test(outcome.id)
      || typeof outcome.title !== 'string' || outcome.title.trim().length < 5 || outcome.title.trim().length > 160 || /[<>\r\n\u0000-\u001f]/.test(outcome.title)
      || !['knowledge', 'skill'].includes(outcome.kind) || !['core', 'breadth'].includes(outcome.role)
      || !Array.isArray(outcome.evidence) || outcome.evidence.length === 0 || outcome.evidence.some((item) => !EVIDENCE_TYPES.has(item))
      || (outcome.kind === 'skill' && !outcome.evidence.includes('activity'))
      || new Set(outcome.evidence).size !== outcome.evidence.length || ids.has(outcome.id)) {
      return invalid('CHECKPOINT_OUTCOMES_INVALID', path, 'Chapter outcomes must use the validated outcome manifest schema and unique IDs.')
    }
    ids.add(outcome.id)
    if (outcome.role === 'core') hasCore = true
  }

  if (!hasCore) return invalid('CHECKPOINT_OUTCOMES_INVALID', 'outcomes', 'A Chapter checkpoint requires at least one core outcome.')
  return { valid: true, ids }
}

function validateEnvelope(value, outcomes) {
  if (!isRecord(value) || !exactKeys(value, ENVELOPE_FIELDS)) return invalid()
  if (value.schemaVersion !== 1) return invalid('CHECKPOINT_SCHEMA_UNSUPPORTED', 'checkpoint.schemaVersion', 'This checkpoint schema version is not supported.')
  const checkedOutcomes = validateOutcomes(outcomes)
  if (!checkedOutcomes.valid) return checkedOutcomes
  if (!Array.isArray(value.publicQuestions) || value.publicQuestions.length === 0 || value.publicQuestions.length > 25 || !isRecord(value.answerKey)) return invalid()

  const declaredOutcomes = checkedOutcomes.ids
  const questionIds = new Set()
  const coveredOutcomes = new Set()

  for (const [index, question] of value.publicQuestions.entries()) {
    const path = `checkpoint.publicQuestions[${index}]`
    if (!isRecord(question) || !['choice', 'written'].includes(question.type)) return invalid('CHECKPOINT_QUESTION_INVALID', path, 'Checkpoint question is invalid.')
    const allowed = question.type === 'choice' ? CHOICE_QUESTION_FIELDS : WRITTEN_QUESTION_FIELDS
    if (!exactKeys(question, allowed)) return invalid('CHECKPOINT_QUESTION_INVALID', path, 'Checkpoint question contains unsupported fields.')
    if (typeof question.id !== 'string' || question.id.length < 3 || question.id.length > 80 || !CHECKPOINT_QUESTION_ID.test(question.id) || questionIds.has(question.id)) return invalid('CHECKPOINT_QUESTION_INVALID', `${path}.id`, 'Question IDs must be unique 3-80 character lowercase identifiers.')
    if (typeof question.text !== 'string' || question.text.trim().length < 5 || question.text.length > 1600 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(question.text)) return invalid('CHECKPOINT_QUESTION_INVALID', `${path}.text`, 'Question text must be plain text between 5 and 1600 characters.')
    if (!Number.isInteger(question.weight) || question.weight < 1 || question.weight > 3 || question.required !== true) return invalid('CHECKPOINT_QUESTION_INVALID', path, 'Questions must be required and have weight 1-3.')
    if (!Array.isArray(question.outcomeIds) || question.outcomeIds.length === 0 || new Set(question.outcomeIds).size !== question.outcomeIds.length || question.outcomeIds.some((id) => !declaredOutcomes.has(id))) return invalid('CHECKPOINT_QUESTION_INVALID', `${path}.outcomeIds`, 'Question outcomes must reference declared Chapter outcomes.')
    for (const id of question.outcomeIds) coveredOutcomes.add(id)
    if (question.type === 'choice') {
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 5) return invalid('CHECKPOINT_QUESTION_INVALID', `${path}.options`, 'Choice questions need 2-5 options.')
      const optionIds = new Set()
      for (const option of question.options) {
        if (!isRecord(option) || !exactKeys(option, new Set(['id', 'label'])) || typeof option.id !== 'string' || option.id.length < 3 || option.id.length > 80 || !CHECKPOINT_QUESTION_ID.test(option.id) || optionIds.has(option.id) || typeof option.label !== 'string' || option.label.trim().length < 1 || option.label.length > 240 || /[<>\u0000-\u001f]/.test(option.label)) return invalid('CHECKPOINT_QUESTION_INVALID', `${path}.options`, 'Choice options are invalid.')
        optionIds.add(option.id)
      }
    }
    questionIds.add(question.id)
  }

  const coreOutcomes = outcomes.filter((outcome) => outcome.role === 'core')
  if (coreOutcomes.some((outcome) => !coveredOutcomes.has(outcome.id))) return invalid('CHECKPOINT_OUTCOME_COVERAGE_INVALID', 'checkpoint.publicQuestions', 'Every core outcome must appear in at least one question.')
  if (!exactKeys(value.answerKey, questionIds) || Object.keys(value.answerKey).length !== questionIds.size) return invalid('CHECKPOINT_ANSWER_KEY_INVALID', 'checkpoint.answerKey', 'Answer-key IDs must exactly match question IDs.')

  for (const question of value.publicQuestions) {
    const key = value.answerKey[question.id]
    if (!isRecord(key)) return invalid('CHECKPOINT_ANSWER_KEY_INVALID', `checkpoint.answerKey.${question.id}`, 'Answer key is invalid.')
    if (question.type === 'choice') {
      const optionIds = new Set(question.options.map((option) => option.id))
      if (!exactKeys(key, new Set(['kind', 'correctOptionId', 'explanation'])) || key.kind !== 'choice' || !optionIds.has(key.correctOptionId) || typeof key.explanation !== 'string' || key.explanation.length > 600 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(key.explanation)) return invalid('CHECKPOINT_ANSWER_KEY_INVALID', `checkpoint.answerKey.${question.id}`, 'Choice answer key is invalid.')
    } else {
      if (!exactKeys(key, new Set(['kind', 'criteria'])) || key.kind !== 'written' || !Array.isArray(key.criteria) || key.criteria.length === 0 || key.criteria.length > 12) return invalid('CHECKPOINT_ANSWER_KEY_INVALID', `checkpoint.answerKey.${question.id}`, 'Written rubric is invalid.')
      const criteriaIds = new Set()
      const criteriaOutcomes = new Set()
      for (const criterion of key.criteria) {
        if (!isRecord(criterion) || !exactKeys(criterion, new Set(['id', 'outcomeId', 'description', 'critical'])) || typeof criterion.id !== 'string' || criterion.id.length < 3 || criterion.id.length > 80 || !CHECKPOINT_QUESTION_ID.test(criterion.id) || criteriaIds.has(criterion.id) || !question.outcomeIds.includes(criterion.outcomeId) || typeof criterion.description !== 'string' || criterion.description.trim().length < 3 || criterion.description.length > 300 || typeof criterion.critical !== 'boolean') return invalid('CHECKPOINT_ANSWER_KEY_INVALID', `checkpoint.answerKey.${question.id}.criteria`, 'Written rubric criteria are invalid.')
        criteriaIds.add(criterion.id)
        criteriaOutcomes.add(criterion.outcomeId)
      }
      if (question.outcomeIds.some((id) => !criteriaOutcomes.has(id))) return invalid('CHECKPOINT_ANSWER_KEY_INVALID', `checkpoint.answerKey.${question.id}.criteria`, 'Rubric criteria must cover every outcome assessed by the question.')
    }
  }

  return { valid: true, value }
}

export function validateCheckpointEnvelope(value, outcomes) {
  return validateEnvelope(value, outcomes)
}

export function validateGeneratedCheckpointEnvelope(value, outcomes, { targeted = false } = {}) {
  const checked = validateEnvelope(value, outcomes)
  if (!checked.valid) return checked

  const minimum = targeted ? 2 : 4
  const maximum = targeted ? 4 : 8
  if (checked.value.publicQuestions.length < minimum || checked.value.publicQuestions.length > maximum) {
    return invalid('CHECKPOINT_QUESTION_COUNT_INVALID', 'checkpoint.publicQuestions', `Generated checkpoints must contain ${minimum}-${maximum} questions.`)
  }
  const kinds = new Set(checked.value.publicQuestions.map((question) => question.type))
  if (!kinds.has('choice') || !kinds.has('written')) {
    return invalid('CHECKPOINT_QUESTION_MIX_INVALID', 'checkpoint.publicQuestions', 'Generated checkpoints must include both objective and written questions.')
  }
  return checked
}

export function parseCheckpointEnvelope(raw, outcomes) {
  let value = raw
  if (typeof raw === 'string') {
    try {
      value = JSON.parse(raw)
    } catch {
      return invalid()
    }
  }
  return validateEnvelope(value, outcomes)
}

export function checkpointPublicQuestions(envelope) {
  return JSON.parse(JSON.stringify(envelope.publicQuestions))
}

export function validateWrittenEvaluation(question, rawEvaluation) {
  if (!isRecord(rawEvaluation) || !exactKeys(rawEvaluation, new Set(['criteria'])) || !Array.isArray(rawEvaluation.criteria)) return invalid('CHECKPOINT_EVALUATION_INVALID', question.id, 'Written-answer evaluation is incomplete.')
  const rubric = question.criteria
  if (!Array.isArray(rubric)) return invalid('CHECKPOINT_EVALUATION_INVALID', question.id, 'Written-answer rubric is unavailable.')
  const expected = new Map(rubric.map((criterion) => [criterion.id, criterion]))
  const received = new Set()
  for (const item of rawEvaluation.criteria) {
    if (!isRecord(item) || !exactKeys(item, new Set(['id', 'score', 'feedback'])) || !expected.has(item.id) || received.has(item.id) || !Number.isInteger(item.score) || item.score < 0 || item.score > 100 || typeof item.feedback !== 'string' || item.feedback.length > 500 || /[<>\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(item.feedback)) return invalid('CHECKPOINT_EVALUATION_INVALID', question.id, 'Written-answer evaluation does not match its rubric.')
    received.add(item.id)
  }
  if (received.size !== expected.size) return invalid('CHECKPOINT_EVALUATION_INVALID', question.id, 'Written-answer evaluation must score every rubric criterion.')
  return { valid: true, value: { criteria: rawEvaluation.criteria.map((item) => ({ ...item })) } }
}

function normalizedText(value) {
  return typeof value === 'string' ? value.trim() : ''
}

export function scoreCheckpoint({ envelope, outcomes, answers, writtenEvaluations }) {
  const outcomeMap = new Map(outcomes.map((outcome) => [outcome.id, outcome]))
  const evidenceByOutcome = new Map(outcomes.map((outcome) => [outcome.id, []]))
  const feedback = []
  let weightedScore = 0
  let totalWeight = 0

  for (const question of envelope.publicQuestions) {
    const answer = normalizedText(answers?.[question.id])
    let score = 0
    let explanation
    let criteriaResults = []
    const key = envelope.answerKey[question.id]
    if (question.type === 'choice') {
      const correct = answer === key.correctOptionId
      score = correct ? 100 : 0
      explanation = key.explanation
    } else {
      const checked = validateWrittenEvaluation({ ...question, criteria: key.criteria }, writtenEvaluations?.[question.id])
      if (!checked.valid) throw Object.assign(new Error(checked.error), { code: checked.code, path: checked.path })
      criteriaResults = checked.value.criteria
      score = Math.round(criteriaResults.reduce((sum, item) => sum + item.score, 0) / criteriaResults.length)
      explanation = criteriaResults.map((item) => item.feedback).filter(Boolean).join(' ')
    }
    weightedScore += score * question.weight
    totalWeight += question.weight
    feedback.push({ questionId: question.id, score, explanation, criteria: criteriaResults })

    for (const outcomeId of question.outcomeIds) {
      const outcomeScore = question.type === 'choice'
        ? score
        : Math.round(criteriaResults.filter((item) => key.criteria.find((criterion) => criterion.id === item.id)?.outcomeId === outcomeId).reduce((sum, item, _, list) => sum + item.score / list.length, 0))
      evidenceByOutcome.get(outcomeId).push({ questionId: question.id, score: outcomeScore, weight: question.weight })
    }
  }

  const perOutcomeEvidence = {}
  for (const outcome of outcomes) {
    const entries = evidenceByOutcome.get(outcome.id)
    const weight = entries.reduce((sum, entry) => sum + entry.weight, 0)
    const score = entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.score * entry.weight, 0) / weight) : null
    perOutcomeEvidence[outcome.id] = { title: outcome.title, kind: outcome.kind, role: outcome.role, score, evidence: entries }
  }

  const overallScore = totalWeight ? Math.round(weightedScore / totalWeight) : 0
  const failedOutcomeIds = outcomes.filter((outcome) => perOutcomeEvidence[outcome.id].score !== null && perOutcomeEvidence[outcome.id].score < 60).map((outcome) => outcome.id)
  const criticalGap = outcomes.some((outcome) => outcome.role === 'core' && (perOutcomeEvidence[outcome.id].score === null || perOutcomeEvidence[outcome.id].score < 60))
  const passed = overallScore >= 80 && !criticalGap
  return { overallScore, passed, criticalGap, failedOutcomeIds, perOutcomeEvidence, feedback }
}
