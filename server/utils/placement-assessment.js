const VALID_LEVELS = ['Beginner', 'Intermediate', 'Advanced']

export class PlacementAssessmentError extends Error {
  constructor(message) {
    super(message)
    this.name = 'PlacementAssessmentError'
    this.code = 'INVALID_PLACEMENT_ASSESSMENT'
    this.retryable = true
  }
}

function normalizeLevel(value) {
  if (typeof value !== 'string') return null
  return VALID_LEVELS.find((level) => level.toLowerCase() === value.trim().toLowerCase()) || null
}

function invalid(message) {
  throw new PlacementAssessmentError(message)
}

export function normalizePlacementQuestions(parsed, requestedLevel) {
  const level = normalizeLevel(requestedLevel)
  if (!level || level === 'Beginner') invalid('Placement assessment requires an Intermediate or Advanced level')
  if (!parsed || !Array.isArray(parsed.questions) || parsed.questions.length !== 6) {
    invalid('Placement assessment must contain exactly 6 questions')
  }

  const ids = new Set()
  const questions = parsed.questions.map((question, index) => {
    const id = typeof question?.id === 'string' && /^[a-zA-Z0-9_-]{1,40}$/.test(question.id)
      ? question.id
      : `q${index + 1}`
    if (ids.has(id)) invalid('Placement assessment contains duplicate question ids')
    ids.add(id)

    const text = typeof question?.text === 'string' ? question.text.trim() : ''
    if (text.length < 10 || text.length > 500) invalid('Placement assessment contains invalid question text')

    const difficultyBand = question?.difficulty_band === 'target' || question?.difficulty_band === 'stretch'
      ? question.difficulty_band
      : null
    if (!difficultyBand) invalid('Placement assessment contains an invalid difficulty band')

    const type = question?.type === 'objective' || question?.type === 'open' ? 'objective' : null
    if (!type) invalid('Placement assessment questions must be free-response')
    const rubric = typeof question.rubric === 'string' ? question.rubric.trim() : ''
    if (!rubric || rubric.length > 1000) invalid('Placement assessment is missing an objective rubric')
    return { id, text, type, difficulty_band: difficultyBand, rubric }
  })

  const targetCount = questions.filter((question) => question.difficulty_band === 'target').length
  const stretchCount = questions.filter((question) => question.difficulty_band === 'stretch').length
  if (targetCount !== 5 || stretchCount !== 1) invalid('Placement assessment must contain exactly five target questions and one stretch question')

  return questions
}

export function placementPublicQuestions(questions) {
  return questions.map(({ id, text, type, difficulty_band: difficultyBand, options }) => ({
    id,
    text,
    type,
    difficultyBand,
    ...(type === 'multiple_choice' ? { options } : {}),
  }))
}

export function evaluatePlacementScores({ requestedLevel, targetScore, stretchScore }) {
  const level = normalizeLevel(requestedLevel)
  const target = typeof targetScore === 'number' ? targetScore : Number.NaN
  const stretch = typeof stretchScore === 'number' ? stretchScore : Number.NaN
  if (!level || level === 'Beginner' || !Number.isFinite(target) || !Number.isFinite(stretch) || target < 0 || target > 100 || stretch < 0 || stretch > 100) {
    throw new Error('Invalid placement assessment scores')
  }

  const score = Math.round(target * 0.8 + stretch * 0.2)
  let recommendedLevel = 'Beginner'
  if (level === 'Intermediate') {
    recommendedLevel = target >= 70 ? 'Intermediate' : 'Beginner'
  } else if (target >= 85) {
    recommendedLevel = 'Advanced'
  } else if (target >= 65) {
    recommendedLevel = 'Intermediate'
  }

  return {
    score,
    targetScore: Math.round(target),
    stretchScore: Math.round(stretch),
    recommendedLevel,
    passed: recommendedLevel === level,
  }
}

function normalizeFeedbackList(value) {
  return Array.isArray(value)
    ? value
      .filter((item) => typeof item === 'string')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((item) => item.slice(0, 500))
      .slice(0, 8)
    : []
}

export function normalizePlacementEvaluation({ requestedLevel, questions, scores, feedback, gaps }) {
  if (!Array.isArray(questions) || questions.length !== 6 || !Array.isArray(scores) || scores.length !== questions.length) {
    invalid('Placement question scores must contain exactly one result per question')
  }

  const questionById = new Map(questions.map((question) => [question.id, question]))
  const seen = new Set()
  const questionScores = scores.map((entry) => {
    const questionId = typeof entry?.question_id === 'string' ? entry.question_id.trim() : ''
    const score = entry?.score
    if (!questionId || seen.has(questionId) || !questionById.has(questionId)) {
      invalid('Placement question scores must cover each question exactly once')
    }
    if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
      invalid('Placement question scores must be numbers from 0 to 100')
    }
    if (typeof entry?.feedback !== 'string' || !entry.feedback.trim()) {
      invalid('Placement question scores must include evidence-based feedback')
    }
    seen.add(questionId)
    const itemFeedback = typeof entry?.feedback === 'string' ? entry.feedback.trim().slice(0, 500) : ''
    return { questionId, score: Math.round(score), feedback: itemFeedback }
  })

  if (seen.size !== questionById.size) invalid('Placement question scores must cover each question exactly once')

  const targetScores = questionScores
    .filter((entry) => questionById.get(entry.questionId).difficulty_band === 'target')
    .map((entry) => entry.score)
  const stretchScores = questionScores
    .filter((entry) => questionById.get(entry.questionId).difficulty_band === 'stretch')
    .map((entry) => entry.score)
  if (targetScores.length !== 5 || stretchScores.length !== 1) {
    invalid('Placement question scores must contain five target results and one stretch result')
  }

  const targetScore = targetScores.reduce((sum, score) => sum + score, 0) / targetScores.length
  const stretchScore = stretchScores[0]
  return {
    ...evaluatePlacementScores({ requestedLevel, targetScore, stretchScore }),
    questionScores,
    feedback: normalizeFeedbackList(feedback),
    gaps: normalizeFeedbackList(gaps),
  }
}
