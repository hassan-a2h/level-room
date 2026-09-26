import { describe, expect, it } from 'vitest'
import {
  evaluatePlacementScores,
  normalizePlacementQuestions,
  normalizePlacementEvaluation,
} from '../utils/placement-assessment.js'

function questionSet() {
  return {
    questions: [
      { id: 'q1', text: 'Explain the selected-level concept clearly.', type: 'objective', difficulty_band: 'target', rubric: 'Names the concept and explains why it matters.' },
      { id: 'q2', text: 'Choose a practical approach and explain why.', type: 'objective', difficulty_band: 'target', rubric: 'States a sound approach and a relevant trade-off.' },
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
    expect(normalized.every((question) => question.type === 'objective')).toBe(true)
    expect(normalized.every((question) => !('options' in question) && !('correct_answer' in question))).toBe(true)
    expect(normalized.filter((question) => question.difficulty_band === 'target')).toHaveLength(5)
    expect(normalized.filter((question) => question.difficulty_band === 'stretch')).toHaveLength(1)
  })

  it('rejects a placement assessment with multiple-choice questions', () => {
    const parsed = questionSet()
    parsed.questions[0] = {
      id: 'q1',
      text: 'Choose the best approach.',
      type: 'multiple_choice',
      difficulty_band: 'target',
      options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }],
      correct_answer: 'A',
    }

    expect(() => normalizePlacementQuestions(parsed, 'Intermediate')).toThrow(/free-response/i)
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

  it('derives placement scores from one validated result per question', () => {
    const result = normalizePlacementEvaluation({
      requestedLevel: 'Advanced',
      questions: questionSet().questions,
      scores: [
        { question_id: 'q1', score: 80, feedback: 'Good concept explanation.' },
        { question_id: 'q2', score: 90, feedback: 'Sound trade-off.' },
        { question_id: 'q3', score: 70, feedback: 'Mostly practical.' },
        { question_id: 'q4', score: 80, feedback: 'Clear troubleshooting.' },
        { question_id: 'q5', score: 80, feedback: 'Good application.' },
        { question_id: 'q6', score: 40, feedback: 'Needs deeper judgment.' },
      ],
      feedback: ['Strong target-level reasoning.'],
      gaps: ['Deeper stretch judgment.'],
    })

    expect(result).toMatchObject({
      targetScore: 80,
      stretchScore: 40,
      score: 72,
      recommendedLevel: 'Intermediate',
      passed: false,
    })
    expect(result.questionScores).toHaveLength(6)
  })

  it('rejects incomplete or duplicate per-question evaluations', () => {
    const questions = questionSet().questions
    const scores = questions.map((question) => ({ question_id: question.id, score: 80, feedback: 'Evidence.' }))
    scores[5].question_id = 'q1'

    expect(() => normalizePlacementEvaluation({ requestedLevel: 'Intermediate', questions, scores }))
      .toThrow(/question scores/i)
  })

  it('requires evidence feedback for every scored response', () => {
    const questions = questionSet().questions
    const scores = questions.map((question) => ({ question_id: question.id, score: 80, feedback: 'Evidence.' }))
    scores[0].feedback = ''

    expect(() => normalizePlacementEvaluation({ requestedLevel: 'Intermediate', questions, scores }))
      .toThrow(/feedback/i)
  })
})
