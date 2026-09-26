import { describe, expect, it } from 'vitest'
import { checkpointPublicQuestions, parseCheckpointEnvelope, scoreCheckpoint, validateCheckpointEnvelope, validateGeneratedCheckpointEnvelope, validateWrittenEvaluation } from '../utils/checkpoint-format.js'

const outcomes = [
  { id: 'joins-core', title: 'Choose the right join', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] },
  { id: 'joins-breadth', title: 'Explain null handling', kind: 'knowledge', role: 'breadth', evidence: ['checkpoint'] },
]

function envelope() {
  return {
    schemaVersion: 1,
    publicQuestions: [
      { id: 'core-choice', text: 'Which join keeps left rows?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-core'], options: [{ id: 'inner', label: 'INNER JOIN' }, { id: 'left', label: 'LEFT JOIN' }] },
      { id: 'core-written', text: 'Explain why unmatched rows remain.', type: 'written', weight: 2, required: true, outcomeIds: ['joins-core'] },
      { id: 'breadth-choice', text: 'What does NULL represent?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-breadth'], options: [{ id: 'unknown', label: 'Unknown or missing' }, { id: 'zero', label: 'Always zero' }] },
    ],
    answerKey: {
      'core-choice': { kind: 'choice', correctOptionId: 'left', explanation: 'A LEFT JOIN keeps every row from the left input.' },
      'core-written': { kind: 'written', criteria: [{ id: 'preserved-side', outcomeId: 'joins-core', description: 'Names the preserved side.', critical: true }, { id: 'no-match', outcomeId: 'joins-core', description: 'Explains unmatched rows.', critical: false }] },
      'breadth-choice': { kind: 'choice', correctOptionId: 'unknown', explanation: 'NULL means a value is absent or unknown.' },
    },
  }
}

describe('checkpoint-format', () => {
  it('accepts and serializes only the validated public questions', () => {
    const checked = validateCheckpointEnvelope(envelope(), outcomes)
    expect(checked).toMatchObject({ valid: true })
    expect(checkpointPublicQuestions(checked.value)).toHaveLength(3)
    expect(JSON.stringify(checkpointPublicQuestions(checked.value))).not.toContain('answerKey')
    expect(JSON.stringify(checkpointPublicQuestions(checked.value))).not.toContain('preserved-side')
  })

  it('rejects arrays, unknown versions, and unsupported private fields', () => {
    expect(parseCheckpointEnvelope('[]', outcomes)).toMatchObject({ valid: false })
    expect(validateCheckpointEnvelope({ ...envelope(), schemaVersion: 2 }, outcomes)).toMatchObject({ valid: false, code: 'CHECKPOINT_SCHEMA_UNSUPPORTED' })
    const extra = envelope()
    extra.answerKey.secretNote = 'Never accepted'
    expect(validateCheckpointEnvelope(extra, outcomes)).toMatchObject({ valid: false })
  })

  it('rejects duplicate or malformed outcome identifiers and exact-schema violations at every level', () => {
    const duplicateOutcomes = [outcomes[0], { ...outcomes[1], id: outcomes[0].id, role: 'core' }]
    const duplicateEnvelope = envelope()
    duplicateEnvelope.publicQuestions[2].outcomeIds = ['joins-core']
    expect(validateCheckpointEnvelope(duplicateEnvelope, duplicateOutcomes)).toMatchObject({ valid: false })

    const malformedOutcomeEnvelope = envelope()
    malformedOutcomeEnvelope.publicQuestions[0].outcomeIds = ['bad id']
    malformedOutcomeEnvelope.publicQuestions[1].outcomeIds = ['bad id']
    malformedOutcomeEnvelope.answerKey['core-written'].criteria.forEach((criterion) => { criterion.outcomeId = 'bad id' })
    expect(validateCheckpointEnvelope(malformedOutcomeEnvelope, [{ ...outcomes[0], id: 'bad id' }, outcomes[1]])).toMatchObject({ valid: false })
    expect(validateCheckpointEnvelope(envelope(), [{ ...outcomes[0], kind: 'skill' }, outcomes[1]])).toMatchObject({ valid: false, code: 'CHECKPOINT_OUTCOMES_INVALID' })

    const extraQuestionField = envelope()
    extraQuestionField.publicQuestions[0].answer = 'left'
    expect(validateCheckpointEnvelope(extraQuestionField, outcomes)).toMatchObject({ valid: false, code: 'CHECKPOINT_QUESTION_INVALID' })

    const extraOptionField = envelope()
    extraOptionField.publicQuestions[0].options[0].correct = true
    expect(validateCheckpointEnvelope(extraOptionField, outcomes)).toMatchObject({ valid: false, code: 'CHECKPOINT_QUESTION_INVALID' })

    const extraCriterionField = envelope()
    extraCriterionField.answerKey['core-written'].criteria[0].answer = 'left side'
    expect(validateCheckpointEnvelope(extraCriterionField, outcomes)).toMatchObject({ valid: false, code: 'CHECKPOINT_ANSWER_KEY_INVALID' })
  })

  it('requires coverage of every core outcome and exact answer-key question IDs', () => {
    const missingCoverage = envelope()
    missingCoverage.publicQuestions = missingCoverage.publicQuestions.filter((question) => question.id !== 'core-choice' && question.id !== 'core-written')
    delete missingCoverage.answerKey['core-choice']
    delete missingCoverage.answerKey['core-written']
    expect(validateCheckpointEnvelope(missingCoverage, outcomes)).toMatchObject({ valid: false, code: 'CHECKPOINT_OUTCOME_COVERAGE_INVALID' })

    const missingKey = envelope()
    delete missingKey.answerKey['breadth-choice']
    expect(validateCheckpointEnvelope(missingKey, outcomes)).toMatchObject({ valid: false })
  })

  it('rejects mismatched rubric outcomes and malformed checkpoint JSON', () => {
    const wrongOutcome = envelope()
    wrongOutcome.answerKey['core-written'].criteria[0].outcomeId = 'other-outcome'
    expect(validateCheckpointEnvelope(wrongOutcome, outcomes)).toMatchObject({ valid: false })
    expect(parseCheckpointEnvelope('{', outcomes)).toMatchObject({ valid: false, code: 'CHECKPOINT_ENVELOPE_INVALID' })
  })

  it('enforces full and targeted question counts and requires objective plus written evidence', () => {
    expect(validateGeneratedCheckpointEnvelope(envelope(), outcomes)).toMatchObject({ valid: false, code: 'CHECKPOINT_QUESTION_COUNT_INVALID' })

    const full = envelope()
    full.publicQuestions.push({ id: 'core-extra', text: 'Which side stays in a LEFT JOIN?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-core'], options: [{ id: 'left-side', label: 'The left side' }, { id: 'right-side', label: 'The right side' }] })
    full.answerKey['core-extra'] = { kind: 'choice', correctOptionId: 'left-side', explanation: 'A LEFT JOIN preserves the left side.' }
    expect(validateGeneratedCheckpointEnvelope(full, outcomes)).toMatchObject({ valid: true })

    const partial = {
      schemaVersion: 1,
      publicQuestions: full.publicQuestions.slice(0, 2),
      answerKey: { 'core-choice': full.answerKey['core-choice'], 'core-written': full.answerKey['core-written'] },
    }
    expect(validateGeneratedCheckpointEnvelope(partial, [outcomes[0]], { targeted: true })).toMatchObject({ valid: true })

    const objectiveOnly = { ...partial, publicQuestions: [full.publicQuestions[0], full.publicQuestions[3]], answerKey: { 'core-choice': full.answerKey['core-choice'], 'core-extra': full.answerKey['core-extra'] } }
    expect(validateGeneratedCheckpointEnvelope(objectiveOnly, [outcomes[0]], { targeted: true })).toMatchObject({ valid: false, code: 'CHECKPOINT_QUESTION_MIX_INVALID' })
  })

  it('scores objective answers locally and applies the 80 overall / 60 core outcome rule', () => {
    const checked = validateCheckpointEnvelope(envelope(), outcomes)
    const result = scoreCheckpoint({
      envelope: checked.value,
      outcomes,
      answers: { 'core-choice': 'left', 'core-written': 'It keeps unmatched rows from the left table.', 'breadth-choice': 'unknown' },
      writtenEvaluations: { 'core-written': { criteria: [
        { id: 'preserved-side', score: 100, feedback: 'You identified the preserved side.' },
        { id: 'no-match', score: 80, feedback: 'You described the unmatched rows.' },
      ] } },
    })
    expect(result).toMatchObject({ overallScore: 95, passed: true, failedOutcomeIds: [] })
    expect(result.perOutcomeEvidence['joins-core'].score).toBe(93)
    expect(result.perOutcomeEvidence['joins-breadth'].score).toBe(100)

    const belowCoreFloor = scoreCheckpoint({
      envelope: checked.value,
      outcomes,
      answers: { 'core-choice': 'inner', 'core-written': 'Rows remain.', 'breadth-choice': 'unknown' },
      writtenEvaluations: { 'core-written': { criteria: [
        { id: 'preserved-side', score: 40, feedback: 'Name which side remains.' },
        { id: 'no-match', score: 30, feedback: 'Explain what happens without a match.' },
      ] } },
    })
    expect(belowCoreFloor.passed).toBe(false)
    expect(belowCoreFloor.criticalGap).toBe(true)
    expect(belowCoreFloor.failedOutcomeIds).toContain('joins-core')
  })

  it('allows a supporting gap when overall and every core outcome meet their thresholds', () => {
    const checked = validateCheckpointEnvelope(envelope(), outcomes)
    const weightedEnvelope = {
      ...checked.value,
      publicQuestions: checked.value.publicQuestions.map((question) => ({
        ...question,
        weight: question.id === 'breadth-choice' ? 1 : 3,
      })),
    }
    const result = scoreCheckpoint({
      envelope: weightedEnvelope,
      outcomes,
      answers: { 'core-choice': 'left', 'core-written': 'The left side remains.', 'breadth-choice': 'zero' },
      writtenEvaluations: { 'core-written': { criteria: [
        { id: 'preserved-side', score: 100, feedback: 'You identified the preserved side.' },
        { id: 'no-match', score: 100, feedback: 'You explained missing matches.' },
      ] } },
    })

    expect(result.overallScore).toBe(86)
    expect(result.passed).toBe(true)
    expect(result.criticalGap).toBe(false)
    expect(result.failedOutcomeIds).toEqual(['joins-breadth'])
    expect(result.perOutcomeEvidence['joins-core'].evidence).toHaveLength(2)
  })

  it('keeps the core floor independent from the overall threshold', () => {
    const chapterOutcomes = [
      { id: 'core-one', title: 'Explain a core join rule', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] },
      { id: 'core-two', title: 'Apply a second join rule', kind: 'skill', role: 'core', evidence: ['activity', 'checkpoint'] },
      { id: 'breadth-one', title: 'Describe missing values', kind: 'knowledge', role: 'breadth', evidence: ['checkpoint'] },
    ]
    const chapterEnvelope = {
      schemaVersion: 1,
      publicQuestions: [
        { id: 'core-one-q', text: 'Which answer explains the core rule?', type: 'choice', weight: 1, required: true, outcomeIds: ['core-one'], options: [{ id: 'option-a', label: 'Correct explanation' }, { id: 'option-b', label: 'Incorrect explanation' }] },
        { id: 'core-two-q', text: 'Which answer applies the skill?', type: 'choice', weight: 1, required: true, outcomeIds: ['core-two'], options: [{ id: 'option-a', label: 'Correct application' }, { id: 'option-b', label: 'Incorrect application' }] },
        { id: 'breadth-q', text: 'Which answer describes a missing value?', type: 'choice', weight: 3, required: true, outcomeIds: ['breadth-one'], options: [{ id: 'option-a', label: 'Unknown or absent' }, { id: 'option-b', label: 'Always zero' }] },
        { id: 'breadth-written', text: 'Explain how you recognize a missing value.', type: 'written', weight: 1, required: true, outcomeIds: ['breadth-one'] },
      ],
      answerKey: {
        'core-one-q': { kind: 'choice', correctOptionId: 'option-a', explanation: 'That is the core rule.' },
        'core-two-q': { kind: 'choice', correctOptionId: 'option-a', explanation: 'That is the correct application.' },
        'breadth-q': { kind: 'choice', correctOptionId: 'option-a', explanation: 'Missing values are unknown or absent.' },
        'breadth-written': { kind: 'written', criteria: [{ id: 'describe-missing', outcomeId: 'breadth-one', description: 'Describes missing values.', critical: false }] },
      },
    }
    const checked = validateCheckpointEnvelope(chapterEnvelope, chapterOutcomes)
    const result = scoreCheckpoint({
      envelope: checked.value,
      outcomes: chapterOutcomes,
      answers: { 'core-one-q': 'option-b', 'core-two-q': 'option-a', 'breadth-q': 'option-a', 'breadth-written': 'It has no known value.' },
      writtenEvaluations: { 'breadth-written': { criteria: [{ id: 'describe-missing', score: 100, feedback: 'You identified the missing value.' }] } },
    })

    expect(result.overallScore).toBe(83)
    expect(result.passed).toBe(false)
    expect(result.criticalGap).toBe(true)
    expect(result.failedOutcomeIds).toContain('core-one')
  })

  it('rejects unbounded or mismatched written evaluations before scoring', () => {
    const question = { id: 'core-written', criteria: envelope().answerKey['core-written'].criteria }
    for (const criteria of [
      [{ id: 'unknown-criterion', score: 100, feedback: 'Unknown.' }],
      [{ id: 'preserved-side', score: 101, feedback: 'Too high.' }, { id: 'no-match', score: 100, feedback: 'Okay.' }],
      [{ id: 'preserved-side', score: 100, feedback: 'x'.repeat(501) }, { id: 'no-match', score: 100, feedback: 'Okay.' }],
      [{ id: 'preserved-side', score: 100, feedback: 'Duplicate.' }, { id: 'preserved-side', score: 100, feedback: 'Duplicate.' }],
    ]) {
      expect(validateWrittenEvaluation(question, { criteria }).valid).toBe(false)
    }
  })
})
