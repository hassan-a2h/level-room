import { describe, expect, it } from 'vitest'
import {
  MAX_WRITTEN_CHARS,
  MAX_WRITTEN_WORDS,
  aggregateMixedScore,
  sanitizeQuizQuestions,
  scoreChoiceAnswers,
  validateAnswerSubmission,
  validateQuizQuestions,
} from '../utils/mixed-quiz.js'

function rawQuestions() {
  return [
    {
      id: 'q1', format: 'multiple_choice', category: 'Recall', prompt: 'Which command lists files?',
      options: [{ id: 'a', text: 'ls' }, { id: 'b', text: 'pwd' }], correct_option: 'a', weight: 1,
    },
    {
      id: 'q2', format: 'multiple_choice', category: 'Apply', prompt: 'Which command prints the directory?',
      options: [{ id: 'a', text: 'pwd' }, { id: 'b', text: 'cd' }], correct_option: 'a', weight: 1,
    },
    {
      id: 'q3', format: 'written', category: 'Explain', prompt: 'Explain why the command is useful.', max_words: 80, weight: 2,
    },
    {
      id: 'q4', format: 'written', category: 'Transfer', prompt: 'Describe how you would verify the result.', max_words: 80, weight: 2,
    },
  ]
}

describe('mixed quiz validation and grading', () => {
  it('requires exactly two choices and two written questions for a regular quiz', () => {
    const result = validateQuizQuestions(rawQuestions(), { mode: 'regular' })
    expect(result.valid).toBe(true)
    expect(result.value.questions).toHaveLength(4)
    expect(result.value.answerKey).toEqual({ q1: 'a', q2: 'a' })
    expect(validateQuizQuestions(rawQuestions().slice(0, 3), { mode: 'regular' }).valid).toBe(false)
  })

  it('requires one choice and one written question for a retest', () => {
    const questions = [rawQuestions()[0], rawQuestions()[2]]
    const result = validateQuizQuestions(questions, { mode: 'retest' })
    expect(result.valid).toBe(true)
    expect(result.value.questions).toHaveLength(2)
  })

  it('rejects duplicate question or option ids and strips hidden answer fields', () => {
    const duplicate = rawQuestions().map((question) => ({ ...question }))
    duplicate[1] = { ...duplicate[1], id: 'q1' }
    expect(validateQuizQuestions(duplicate, { mode: 'regular' }).valid).toBe(false)

    const leaked = sanitizeQuizQuestions(rawQuestions())
    expect(leaked[0]).not.toHaveProperty('correct_option')
    expect(leaked[0].options[0]).toEqual({ id: 'a', text: 'ls' })
  })

  it('enforces exact answer ids and written limits', () => {
    const questions = sanitizeQuizQuestions(rawQuestions())
    const answerKey = { q1: 'a', q2: 'a' }
    expect(validateAnswerSubmission(questions, answerKey, { q1: 'a', q2: 'a', q3: 'ok', q4: 'ok' }).valid).toBe(true)
    expect(validateAnswerSubmission(questions, answerKey, { q1: 'a', q2: 'a', q3: 'ok' }).valid).toBe(false)
    expect(validateAnswerSubmission(questions, answerKey, { q1: 'bad', q2: 'a', q3: 'ok', q4: 'ok' }).valid).toBe(false)
    expect(validateAnswerSubmission(questions, answerKey, { q1: 'a', q2: 'a', q3: 'x'.repeat(MAX_WRITTEN_CHARS + 1), q4: 'ok' }).valid).toBe(false)
    expect(validateAnswerSubmission(questions, answerKey, { q1: 'a', q2: 'a', q3: Array(MAX_WRITTEN_WORDS + 1).fill('word').join(' '), q4: 'ok' }).valid).toBe(false)
  })

  it('scores choices deterministically and aggregates weighted written scores', () => {
    const questions = sanitizeQuizQuestions(rawQuestions())
    const choice = scoreChoiceAnswers(questions, { q1: 'a', q2: 'b' }, { q1: 'a', q2: 'a' })
    expect(choice.earned).toBe(1)
    expect(choice.max).toBe(2)
    const evaluation = aggregateMixedScore(questions, choice, {
      q3: { score: 100, explanation: 'Clear.' },
      q4: { score: 50, explanation: 'Partial.' },
    })
    expect(evaluation.overallScore).toBe(67)
    expect(evaluation.passed).toBe(false)
    expect(evaluation.feedback).toHaveLength(4)
  })

  it('passes legacy questions through as format one data', () => {
    const legacy = [{ id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 }]
    expect(validateQuizQuestions(legacy, { mode: 'legacy' }).value.formatVersion).toBe(1)
  })
})
