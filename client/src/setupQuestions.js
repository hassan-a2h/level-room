export const LEVEL_OPTIONS = Object.freeze([
  { value: 'Beginner', label: 'Beginner' },
  { value: 'Intermediate', label: 'Intermediate' },
  { value: 'Advanced', label: 'Advanced' },
])

export const TIME_COMMITMENT_OPTIONS = Object.freeze([
  { value: '15 min/day', label: '15 min/day' },
  { value: '30 min/day', label: '30 min/day' },
  { value: '1 hour/day', label: '1 hour/day' },
  { value: '2+ hours/day', label: '2+ hours/day' },
])

const TIME_ALIASES = new Map([
  ['15 min', '15 min/day'],
  ['30 min', '30 min/day'],
  ['1 hour', '1 hour/day'],
  ['2 hours', '2+ hours/day'],
  ['2+ hours', '2+ hours/day'],
])

function canonicalLevel(value) {
  if (typeof value !== 'string') return null
  return LEVEL_OPTIONS.find((option) => option.value.toLowerCase() === value.trim().toLowerCase())?.value || null
}

function canonicalTime(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return TIME_COMMITMENT_OPTIONS.find((option) => option.value === trimmed)?.value
    || TIME_ALIASES.get(trimmed.toLowerCase())
    || null
}

function optionValue(option) {
  return typeof option === 'string' ? option : option?.value
}

function canonicalOptions(rawOptions, catalog, normalize) {
  const recognized = new Map()
  for (const option of Array.isArray(rawOptions) ? rawOptions : []) {
    const value = normalize(optionValue(option))
    if (!value || recognized.has(value)) continue
    const label = typeof option === 'string' ? option.trim() : option?.label?.toString().trim()
    recognized.set(value, label || value)
  }
  // Always render the full canonical catalog. A model-generated subset or unknown
  // label must never remove a valid choice or leak an unaccepted value.
  return catalog.map((option) => ({
    ...option,
    label: recognized.get(option.value) || option.label,
  }))
}

export function normalizeSetupQuestions(rawQuestions) {
  if (!Array.isArray(rawQuestions) || rawQuestions.length < 1) return []

  const levelQuestion = rawQuestions.find((question) => question?.id === 'level') || rawQuestions[0]
  const timeQuestion = rawQuestions.find((question) => question?.id === 'timeCommitment') || rawQuestions[1] || {
    id: 'timeCommitment',
    text: 'How much time can you study most days?',
    options: [],
  }
  if (!levelQuestion) return []

  return [
    {
      ...levelQuestion,
      id: 'level',
      text: typeof levelQuestion.text === 'string' && levelQuestion.text.trim()
        ? levelQuestion.text
        : 'How familiar are you with this topic?',
      options: canonicalOptions(levelQuestion.options, LEVEL_OPTIONS, canonicalLevel),
    },
    {
      ...timeQuestion,
      id: 'timeCommitment',
      text: typeof timeQuestion.text === 'string' && timeQuestion.text.trim()
        ? timeQuestion.text
        : 'How much time can you study most days?',
      options: canonicalOptions(timeQuestion.options, TIME_COMMITMENT_OPTIONS, canonicalTime),
    },
  ]
}
