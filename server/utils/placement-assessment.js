const VALID_LEVELS = ['Beginner', 'Intermediate', 'Advanced']

function normalizeLevel(value) {
  if (typeof value !== 'string') return null
  return VALID_LEVELS.find((level) => level.toLowerCase() === value.trim().toLowerCase()) || null
}

function invalid(message) {
  throw new Error(message)
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

    const type = question?.type === 'multiple_choice' || question?.type === 'multiple-choice'
      ? 'multiple_choice'
      : question?.type === 'objective' || question?.type === 'open'
        ? 'objective'
        : null
    if (!type) invalid('Placement assessment contains an invalid question type')

    if (type === 'multiple_choice') {
      if (!Array.isArray(question.options) || question.options.length < 2 || question.options.length > 5) {
        invalid('Placement assessment contains invalid multiple-choice options')
      }
      const optionValues = new Set()
      const options = question.options.map((option) => {
        const value = typeof option === 'string' ? option.trim() : option?.value?.toString().trim()
        const label = typeof option === 'string' ? option.trim() : option?.label?.toString().trim()
        if (!value || !label || value.length > 100 || label.length > 200) invalid('Placement assessment contains an invalid option')
        if (optionValues.has(value)) invalid('Placement assessment contains duplicate options')
        optionValues.add(value)
        return { value, label }
      })
      const correctAnswer = typeof question.correct_answer === 'string' ? question.correct_answer.trim() : ''
      if (!correctAnswer || !options.some((option) => option.value === correctAnswer)) {
        invalid('Placement assessment is missing a valid answer key')
      }
      return { id, text, type, difficulty_band: difficultyBand, options, correct_answer: correctAnswer }
    }

    const rubric = typeof question.rubric === 'string' ? question.rubric.trim() : ''
    if (!rubric || rubric.length > 1000) invalid('Placement assessment is missing an objective rubric')
    return { id, text, type, difficulty_band: difficultyBand, rubric }
  })

  const targetCount = questions.filter((question) => question.difficulty_band === 'target').length
  const stretchCount = questions.filter((question) => question.difficulty_band === 'stretch').length
  if (targetCount !== 5 || stretchCount !== 1) invalid('Placement assessment must contain exactly five target questions and one stretch question')

  const multipleChoiceCount = questions.filter((question) => question.type === 'multiple_choice').length
  const objectiveCount = questions.filter((question) => question.type === 'objective').length
  if (multipleChoiceCount < 2 || objectiveCount < 2) invalid('Placement assessment must include multiple-choice and objective questions')
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
