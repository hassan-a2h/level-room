import { describe, expect, it } from 'vitest'
import {
  evaluatePlacementScores,
  normalizePlacementQuestions,
} from '../utils/placement-assessment.js'

function questionSet() {
  return {
    questions: [
      { id: 'q1', text: 'Explain the selected-level concept clearly.', type: 'multiple_choice', difficulty_band: 'target', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }], correct_answer: 'A' },
      { id: 'q2', text: 'Choose the selected-level practical approach.', type: 'multiple_choice', difficulty_band: 'target', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }], correct_answer: 'A' },
      { id: 'q3', text: 'Describe a selected-level implementation decision.', type: 'objective', difficulty_band: 'target', rubric: 'Names the relevant decision and tradeoff.' },
      { id: 'q4', text: 'Explain how you would troubleshoot the selected-level issue.', type: 'objective', difficulty_band: 'target', rubric: 'Uses a practical troubleshooting process.' },
      { id: 'q5', text: 'Describe when to apply the selected-level technique.', type: 'objective', difficulty_band: 'target', rubric: 'Connects the technique to a realistic situation.' },
      { id: 'q6', text: 'Handle a more advanced stretch scenario.', type: 'objective', difficulty_band: 'stretch', rubric: 'Shows deeper judgment without relying on trivia.' },
    ],
  }
}

describe('placement assessment utilities', () => {
  it('accepts exactly five target questions and one stretch question', () => {
    const normalized = normalizePlacementQuestions(questionSet(), 'Intermediate')

    expect(normalized).toHaveLength(6)
    expect(normalized.filter((question) => question.difficulty_band === 'target')).toHaveLength(5)
    expect(normalized.filter((question) => question.difficulty_band === 'stretch')).toHaveLength(1)
  })

  it('rejects a placement assessment with max-level questions mislabeled as target questions', () => {
    const parsed = questionSet()
    parsed.questions[0].difficulty_band = 'stretch'

    expect(() => normalizePlacementQuestions(parsed, 'Intermediate')).toThrow(/five target.*one stretch/i)
  })

  it('uses an 80/20 score while allowing target-level mastery to pass', () => {
    expect(evaluatePlacementScores({ requestedLevel: 'Intermediate', targetScore: 80, stretchScore: 0 })).toMatchObject({
      score: 64,
      recommendedLevel: 'Intermediate',
      passed: true,
    })
  })

  it('does not let a strong stretch answer compensate for failed target-level competence', () => {
    expect(evaluatePlacementScores({ requestedLevel: 'Intermediate', targetScore: 60, stretchScore: 100 })).toMatchObject({
      score: 68,
      recommendedLevel: 'Beginner',
      passed: false,
    })
  })

  it('does not let a weak Advanced stretch answer downgrade Advanced target mastery', () => {
    expect(evaluatePlacementScores({ requestedLevel: 'Advanced', targetScore: 90, stretchScore: 0 })).toMatchObject({
      score: 72,
      recommendedLevel: 'Advanced',
      passed: true,
    })
  })

  it('rejects malformed non-numeric score values', () => {
    expect(() => evaluatePlacementScores({ requestedLevel: 'Intermediate', targetScore: '80', stretchScore: 20 })).toThrow(/invalid placement/i)
  })
})
