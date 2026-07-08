import { describe, expect, it } from 'vitest'
import { normalizeSetupQuestions } from '../setupQuestions.js'

describe('normalizeSetupQuestions', () => {
  it('converts legacy labels and unknown model options to canonical values', () => {
    const questions = normalizeSetupQuestions([
      { text: 'Level?', options: ['Novice', 'Intermediate', 'Wizard'] },
      { text: 'Time?', options: ['30 min', 'Whenever'] },
    ])

    expect(questions[0].options.map((option) => option.value)).toEqual(['Beginner', 'Intermediate', 'Advanced'])
    expect(questions[1].options.map((option) => option.value)).toEqual(['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day'])
    expect(questions[1].options.find((option) => option.value === '30 min/day').label).toBe('30 min')
  })

  it('fills a missing time question so a transient provider response cannot strand onboarding', () => {
    const questions = normalizeSetupQuestions([{ text: 'Level?', options: ['Beginner'] }])
    expect(questions).toHaveLength(2)
    expect(questions[1].id).toBe('timeCommitment')
  })
})
