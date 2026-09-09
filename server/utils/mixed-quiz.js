export const MAX_WRITTEN_WORDS = 80
export const MAX_WRITTEN_CHARS = 2000

const QUESTION_ID_MAX = 80
const PROMPT_MAX = 1200
const OPTION_TEXT_MAX = 500
const FEEDBACK_MAX = 1200
const ALLOWED_CATEGORIES = new Set(['Recall', 'Explain', 'Apply', 'Diagnose', 'Transfer'])

export class MixedQuizValidationError extends Error {
  constructor(message, code = 'INVALID_MIXED_QUIZ') {
    super(message)
    this.name = 'MixedQuizValidationError'
    this.code = code
  }
}

function result(value, error = null) {
  return error ? { valid: false, error } : { valid: true, value }
}

function cleanString(value, field, max) {
  if (typeof value !== 'string' || !value.trim()) return result(null, `${field} is required.`)
  const trimmed = value.trim()
  if (trimmed.length > max) return result(null, `${field} is too long.`)
  return result(trimmed)
}

function normalizeOption(option, field) {
  if (!option || typeof option !== 'object' || Array.isArray(option)) return result(null, `${field} must be an object.`)
  const id = cleanString(option.id, `${field}.id`, 40)
  if (!id.valid) return id
  const text = cleanString(option.text, `${field}.text`, OPTION_TEXT_MAX)
  if (!text.valid) return text
  return result({ id: id.value, text: text.value })
}

function questionModeCounts(questions) {
  return questions.reduce((counts, question) => {
    counts[question.format] += 1
    return counts
  }, { multiple_choice: 0, written: 0 })
}

export function sanitizeQuizQuestions(questions) {
  if (!Array.isArray(questions)) return []
  return questions.map((question) => {
    const output = {
      id: question.id,
      format: question.format,
      category: question.category,
      prompt: question.prompt,
      weight: question.weight,
    }
    if (question.format === 'multiple_choice') {
      output.options = (question.options || []).map((option) => ({ id: option.id, text: option.text }))
    } else {
      output.max_words = question.max_words
    }
    return output
  })
}

export function validateQuizQuestions(rawQuestions, { mode = 'regular' } = {}) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length === 0) return result(null, 'Quiz questions are required.')

  if (mode === 'legacy') {
    const ids = new Set()
    for (const [index, question] of rawQuestions.entries()) {
      const id = cleanString(question?.id, `questions[${index}].id`, QUESTION_ID_MAX)
      if (!id.valid || ids.has(id.value)) return result(null, id.valid ? `Duplicate question id: ${id.value}.` : id.error)
      ids.add(id.value)
    }
    return result({ formatVersion: 1, questions: rawQuestions })
  }

  const normalized = []
  const answerKey = {}
  const questionIds = new Set()
  for (const [index, raw] of rawQuestions.entries()) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return result(null, `questions[${index}] must be an object.`)
    const id = cleanString(raw.id, `questions[${index}].id`, QUESTION_ID_MAX)
    if (!id.valid) return id
    if (questionIds.has(id.value)) return result(null, `Duplicate question id: ${id.value}.`)
    questionIds.add(id.value)
    if (!['multiple_choice', 'written'].includes(raw.format)) return result(null, `Question ${id.value} has an unsupported format.`)
    const category = cleanString(raw.category, `Question ${id.value} category`, 30)
    if (!category.valid) return category
    if (!ALLOWED_CATEGORIES.has(category.value)) return result(null, `Question ${id.value} has an unsupported category.`)
    const prompt = cleanString(raw.prompt ?? raw.text, `Question ${id.value} prompt`, PROMPT_MAX)
    if (!prompt.valid) return prompt
    if (!Number.isInteger(raw.weight) || raw.weight < 1 || raw.weight > 3) return result(null, `Question ${id.value} has an invalid weight.`)

    if (raw.format === 'multiple_choice') {
      if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 6) return result(null, `Question ${id.value} must have 2-6 options.`)
      const optionIds = new Set()
      const options = []
      for (const [optionIndex, option] of raw.options.entries()) {
        const normalizedOption = normalizeOption(option, `Question ${id.value} option ${optionIndex}`)
        if (!normalizedOption.valid) return normalizedOption
        if (optionIds.has(normalizedOption.value.id)) return result(null, `Question ${id.value} has duplicate option ids.`)
        optionIds.add(normalizedOption.value.id)
        options.push(normalizedOption.value)
      }
      const correct = raw.correct_option ?? raw.correctOption ?? raw.answer
      if (typeof correct !== 'string' || !optionIds.has(correct)) return result(null, `Question ${id.value} has an invalid correct option.`)
      answerKey[id.value] = correct
      normalized.push({ id: id.value, format: raw.format, category: category.value, prompt: prompt.value, options, weight: raw.weight })
    } else {
      const maxWords = raw.max_words === undefined ? MAX_WRITTEN_WORDS : raw.max_words
      if (!Number.isInteger(maxWords) || maxWords < 1 || maxWords > MAX_WRITTEN_WORDS) return result(null, `Question ${id.value} has an invalid word limit.`)
      normalized.push({ id: id.value, format: raw.format, category: category.value, prompt: prompt.value, max_words: maxWords, weight: raw.weight })
    }
  }

  const counts = questionModeCounts(normalized)
  const expected = mode === 'retest' ? { multiple_choice: 1, written: 1 } : { multiple_choice: 2, written: 2 }
  if (counts.multiple_choice !== expected.multiple_choice || counts.written !== expected.written) {
    return result(null, `A ${mode} quiz must contain exactly ${expected.multiple_choice} multiple-choice and ${expected.written} written questions.`)
  }
  return result({ formatVersion: 2, questions: normalized, answerKey })
}

export function normalizeQuizQuestions(rawQuestions, options) {
  const validated = validateQuizQuestions(rawQuestions, options)
  if (!validated.valid) throw new MixedQuizValidationError(validated.error)
  return validated.value
}

export function validatePersistedQuiz(questions, answerKey, { mode = 'regular' } = {}) {
  if (!Array.isArray(questions) || !answerKey || typeof answerKey !== 'object' || Array.isArray(answerKey)) return result(null, 'Persisted mixed quiz is invalid.')
  const enriched = questions.map((question) => question.format === 'multiple_choice'
    ? { ...question, correct_option: answerKey[question.id] }
    : question)
  return validateQuizQuestions(enriched, { mode })
}

function exactKeys(actual, expected) {
  const actualKeys = Object.keys(actual || {}).sort()
  const expectedKeys = Object.keys(expected || {}).sort()
  return actualKeys.length === expectedKeys.length && actualKeys.every((key, index) => key === expectedKeys[index])
}

function wordCount(value) {
  return value.trim() ? value.trim().split(/\s+/u).length : 0
}

export function validateAnswerSubmission(questions, answerKey, answers) {
  if (!Array.isArray(questions) || !answers || typeof answers !== 'object' || Array.isArray(answers)) return result(null, 'Answers must be an object.')
  const expectedIds = Object.fromEntries(questions.map((question) => [question.id, true]))
  if (!exactKeys(answers, expectedIds)) return result(null, 'Answers must include exactly one answer for every question.')
  const choiceQuestions = questions.filter((question) => question.format === 'multiple_choice')
  const expectedKey = Object.fromEntries(choiceQuestions.map((question) => [question.id, answerKey?.[question.id]]))
  if (!exactKeys(answerKey, expectedKey) || Object.values(expectedKey).some((value) => typeof value !== 'string')) return result(null, 'The quiz answer key is invalid.')

  for (const question of questions) {
    const answer = answers[question.id]
    if (typeof answer !== 'string' || !answer.trim()) return result(null, `Answer for ${question.id} is required.`)
    if (question.format === 'multiple_choice') {
      if (!question.options.some((option) => option.id === answer)) return result(null, `Answer for ${question.id} is not a valid option.`)
    } else {
      if (answer.length > MAX_WRITTEN_CHARS) return result(null, `Answer for ${question.id} exceeds the character limit.`)
      if (wordCount(answer) > Math.min(question.max_words || MAX_WRITTEN_WORDS, MAX_WRITTEN_WORDS)) return result(null, `Answer for ${question.id} exceeds the word limit.`)
    }
  }
  return result({ answers })
}

export function scoreChoiceAnswers(questions, answers, answerKey) {
  const choiceQuestions = questions.filter((question) => question.format === 'multiple_choice')
  const feedback = []
  let earned = 0
  let max = 0
  for (const question of choiceQuestions) {
    const correct = answers[question.id] === answerKey[question.id]
    max += question.weight
    if (correct) earned += question.weight
    feedback.push({
      questionId: question.id,
      correctness: correct ? 'correct' : 'incorrect',
      score: correct ? 100 : 0,
      explanation: correct ? 'Correct choice.' : 'Review this concept and the available alternatives.',
    })
  }
  return { earned, max, feedback }
}

export function validateWrittenEvaluation(questions, rawEvaluation) {
  const written = questions.filter((question) => question.format === 'written')
  if (!rawEvaluation || typeof rawEvaluation !== 'object' || Array.isArray(rawEvaluation)) return result(null, 'Written evaluation is required.')
  if (!exactKeys(rawEvaluation, Object.fromEntries(written.map((question) => [question.id, true])))) return result(null, 'Written evaluation must match the written question ids.')
  const normalized = {}
  for (const question of written) {
    const item = rawEvaluation[question.id]
    if (!item || typeof item !== 'object' || typeof item.score !== 'number' || item.score < 0 || item.score > 100) return result(null, `Written evaluation for ${question.id} is invalid.`)
    const explanation = typeof item.explanation === 'string' ? item.explanation.trim().slice(0, FEEDBACK_MAX) : ''
    normalized[question.id] = { score: Math.round(item.score), explanation }
  }
  return result(normalized)
}

export function aggregateMixedScore(questions, choiceScore, writtenEvaluation) {
  const feedback = [...(choiceScore.feedback || [])]
  const gaps = []
  let earned = choiceScore.earned
  let max = choiceScore.max
  for (const question of questions.filter((item) => item.format === 'written')) {
    const item = writtenEvaluation[question.id]
    const score = Math.max(0, Math.min(100, Number(item?.score) || 0))
    earned += (score / 100) * question.weight
    max += question.weight
    const correctness = score >= 80 ? 'correct' : score >= 50 ? 'partial' : 'incorrect'
    feedback.push({ questionId: question.id, correctness, score, explanation: item?.explanation || '' })
    if (correctness !== 'correct') gaps.push(`${question.id}: ${item?.explanation || 'Written answer needs revision.'}`)
  }
  const byQuestion = new Map(feedback.map((item) => [item.questionId, item]))
  for (const question of questions) {
    const item = byQuestion.get(question.id)
    if (['Recall', 'Explain'].includes(question.category) && item?.score === 0) gaps.push(`${question.id}: foundational understanding needs review.`)
  }
  const overallScore = max > 0 ? Math.round((earned / max) * 100) : 0
  const criticalGap = questions.some((question) => ['Recall', 'Explain'].includes(question.category) && (byQuestion.get(question.id)?.score || 0) === 0)
  return { overallScore, passed: overallScore >= 80 && !criticalGap, criticalGap, feedback, gaps }
}
