import { describe, expect, it } from 'vitest'
import {
  collectOutcomeCoverage,
  outcomeTitles,
  publicOutcome,
  validateOutcome,
  validateOutcomeManifest,
} from '../utils/outcome-manifest.js'

const makeOutcome = (id, overrides = {}) => ({
  id,
  title: `Learn ${id.replaceAll('-', ' ')}`,
  kind: 'knowledge',
  role: 'core',
  evidence: ['activity', 'checkpoint'],
  ...overrides,
})

function makeCurriculum(outcomes = [
  makeOutcome('react-jsx-basics'),
  makeOutcome('react-component-boundaries', { kind: 'skill', evidence: ['activity', 'checkpoint', 'artifact'] }),
]) {
  return {
    modules: [{
      title: 'React foundations',
      skill_outcomes: outcomes,
      lessons: [{ title: 'Build a component', outcomes, artifact_required: true }],
    }],
  }
}

function tenOutcomeCurriculum(coreCount) {
  const outcomes = Array.from({ length: 10 }, (_, index) => makeOutcome(
    `outcome-${String(index + 1).padStart(2, '0')}`,
    {
      kind: index === 0 ? 'knowledge' : index === 1 ? 'skill' : index % 2 === 0 ? 'knowledge' : 'skill',
      role: index < coreCount ? 'core' : 'breadth',
      evidence: index === 1 ? ['activity', 'checkpoint', 'artifact'] : ['activity', 'checkpoint'],
    },
  ))
  return makeCurriculum(outcomes)
}

describe('structured outcome manifests', () => {
  it('accepts a well-formed outcome object without coercing its fields', () => {
    const value = makeOutcome('sql-joins', { title: 'Choose the right SQL join', kind: 'skill', role: 'breadth', evidence: ['activity'] })
    expect(validateOutcome(value, 'module.skill_outcomes[0]')).toEqual({ valid: true, value })
  })

  it('returns a structured error for non-object outcomes', () => {
    expect(validateOutcome('Read the docs', 'curriculum.modules[0].skill_outcomes[0]')).toEqual({
      valid: false,
      code: 'OUTCOME_INVALID',
      path: 'curriculum.modules[0].skill_outcomes[0]',
      error: 'Outcome must be an object.',
    })
    expect(validateOutcome([]).valid).toBe(false)
  })

  it.each([
    ['id', { id: 'not Kebab Case' }],
    ['title', { title: 'Tiny' }],
    ['title', { title: '<b>Choose a join</b>' }],
    ['kind', { kind: 'practice' }],
    ['role', { role: 'optional' }],
    ['evidence', { evidence: [] }],
    ['evidence', { evidence: ['activity', 'activity'] }],
    ['evidence', { evidence: ['chat'] }],
    ['extra', { owner: 'provider' }],
  ])('rejects invalid %s values', (_label, overrides) => {
    const result = validateOutcome(makeOutcome('valid-outcome', overrides), 'outcomes[0]')
    expect(result).toMatchObject({ valid: false, code: 'OUTCOME_INVALID', path: expect.stringMatching(/^outcomes\[0\](\.\w+)?$/) })
    expect(result.error).toBeTruthy()
  })

  it.each(['id', 'title', 'kind', 'role', 'evidence'])('rejects a missing required %s field', (field) => {
    const outcome = makeOutcome('valid-outcome')
    delete outcome[field]
    expect(validateOutcome(outcome, 'outcomes[0]')).toMatchObject({
      valid: false,
      code: 'OUTCOME_INVALID',
      path: `outcomes[0].${field}`,
    })
  })

  it('accepts initial Tracks without breadth outcomes', () => {
    expect(validateOutcomeManifest(makeCurriculum(), { trackKind: 'initial' }).valid).toBe(true)
  })

  it('rejects duplicate outcome IDs across Chapters', () => {
    const curriculum = makeCurriculum()
    curriculum.modules.push({ title: 'More React', skill_outcomes: [curriculum.modules[0].skill_outcomes[0]], lessons: [{ title: 'Second Session', outcomes: [curriculum.modules[0].skill_outcomes[0]], artifact_required: true }] })
    expect(validateOutcomeManifest(curriculum)).toMatchObject({ valid: false, code: 'OUTCOME_ID_DUPLICATE' })
  })

  it('rejects Session outcomes that are undeclared or not the declared full outcome', () => {
    const unknown = makeCurriculum()
    unknown.modules[0].lessons[0].outcomes = [makeOutcome('not-declared')]
    expect(validateOutcomeManifest(unknown).code).toBe('OUTCOME_NOT_IN_CHAPTER')

    const partial = makeCurriculum()
    partial.modules[0].lessons[0].outcomes = [{ id: partial.modules[0].skill_outcomes[0].id }]
    expect(validateOutcomeManifest(partial).code).toBe('OUTCOME_INVALID')

    const mismatchedEvidence = makeCurriculum()
    mismatchedEvidence.modules[0].lessons[0].outcomes = [{
      ...mismatchedEvidence.modules[0].skill_outcomes[0], evidence: ['checkpoint'],
    }]
    expect(validateOutcomeManifest(mismatchedEvidence)).toMatchObject({
      valid: false,
      code: 'OUTCOME_LESSON_MISMATCH',
      path: 'curriculum.modules[0].lessons[0].outcomes[0]',
    })
  })

  it('requires each Chapter to cover both knowledge and skill outcomes', () => {
    const curriculum = makeCurriculum([makeOutcome('knowledge-only')])
    expect(validateOutcomeManifest(curriculum).code).toBe('CHAPTER_OUTCOME_KIND_MISSING')
    const skillOnly = makeCurriculum([makeOutcome('skill-only', { kind: 'skill', evidence: ['activity'] })])
    expect(validateOutcomeManifest(skillOnly).code).toBe('CHAPTER_OUTCOME_KIND_MISSING')
  })

  it('requires at least one core outcome in each Chapter', () => {
    const outcomes = [
      makeOutcome('breadth-knowledge', { role: 'breadth' }),
      makeOutcome('breadth-skill', { kind: 'skill', role: 'breadth', evidence: ['activity'] }),
    ]
    expect(validateOutcomeManifest(makeCurriculum(outcomes)).code).toBe('CHAPTER_CORE_OUTCOME_MISSING')
  })

  it('requires activity evidence for every skill outcome', () => {
    const outcomes = [
      makeOutcome('knowledge-outcome'),
      makeOutcome('skill-outcome', { kind: 'skill', evidence: ['checkpoint'] }),
    ]
    expect(validateOutcomeManifest(makeCurriculum(outcomes)).code).toBe('SKILL_ACTIVITY_EVIDENCE_REQUIRED')
  })

  it('requires at least one artifact Session per Chapter', () => {
    const curriculum = makeCurriculum()
    curriculum.modules[0].lessons[0].artifact_required = false
    expect(validateOutcomeManifest(curriculum).code).toBe('CHAPTER_BUILD_REQUIRED')
  })

  it('requires breadth outcomes in continuation Tracks', () => {
    expect(validateOutcomeManifest(makeCurriculum(), { trackKind: 'continuation' }).code).toBe('CONTINUATION_BREADTH_REQUIRED')
  })

  it('enforces the 70–90 percent core range for continuation Tracks with at least ten outcomes', () => {
    expect(validateOutcomeManifest(tenOutcomeCurriculum(7), { trackKind: 'continuation' }).valid).toBe(true)
    expect(validateOutcomeManifest(tenOutcomeCurriculum(9), { trackKind: 'continuation' }).valid).toBe(true)
    expect(validateOutcomeManifest(tenOutcomeCurriculum(6), { trackKind: 'continuation' }).code).toBe('CONTINUATION_CORE_RATIO_INVALID')
    expect(validateOutcomeManifest(tenOutcomeCurriculum(10), { trackKind: 'continuation' }).code).toBe('CONTINUATION_BREADTH_REQUIRED')
  })

  it('does not apply the rounded core ratio to continuation Tracks with fewer than ten outcomes', () => {
    const outcomes = [
      makeOutcome('small-core-knowledge'),
      makeOutcome('small-core-skill', { kind: 'skill', evidence: ['activity'] }),
      makeOutcome('small-breadth', { role: 'breadth' }),
    ]
    expect(validateOutcomeManifest(makeCurriculum(outcomes), { trackKind: 'continuation' }).valid).toBe(true)
  })

  it('rejects IDs and normalized titles already present in continuation lineage', () => {
    const curriculum = makeCurriculum()
    expect(validateOutcomeManifest(curriculum, {
      trackKind: 'continuation',
      lineageOutcomes: [{ id: 'react-jsx-basics', title: 'Old title' }],
    }).code).toBe('OUTCOME_LINEAGE_ID_DUPLICATE')

    const titleRepeat = makeCurriculum([
      makeOutcome('new-knowledge', { title: '  LEARN   React jsx basics ' }),
      makeOutcome('new-skill', { title: 'Different skill title', kind: 'skill', evidence: ['activity'] }),
      makeOutcome('new-breadth', { role: 'breadth' }),
    ])
    expect(validateOutcomeManifest(titleRepeat, {
      trackKind: 'continuation',
      lineageOutcomes: [{ id: 'old-id', title: 'Learn react jsx basics' }],
    }).code).toBe('OUTCOME_LINEAGE_TITLE_DUPLICATE')
  })

  it('keeps lineage duplicate checks out of initial Tracks', () => {
    expect(validateOutcomeManifest(makeCurriculum(), {
      trackKind: 'initial',
      lineageOutcomes: [{ id: 'react-jsx-basics', title: 'Learn react jsx basics' }],
    }).valid).toBe(true)
  })

  it('returns public outcome allowlists and title strings explicitly', () => {
    const privateOutcome = { ...makeOutcome('sql-joins'), answerKey: 'private' }
    expect(publicOutcome(privateOutcome)).toEqual(makeOutcome('sql-joins'))
    expect(outcomeTitles([makeOutcome('sql-joins'), makeOutcome('sql-filters')])).toEqual(['Learn sql joins', 'Learn sql filters'])
    expect(outcomeTitles(['legacy string'])).toEqual([])
  })

  it('collects evidence and Session coverage by outcome ID', () => {
    const curriculum = makeCurriculum()
    const coverage = collectOutcomeCoverage(curriculum)
    expect(coverage.outcomes).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'react-jsx-basics', lessonTitles: ['Build a component'], evidence: ['activity', 'checkpoint'] }),
      expect.objectContaining({ id: 'react-component-boundaries', artifactLessonTitles: ['Build a component'] }),
    ]))
    expect(coverage.byEvidence.activity).toEqual(['react-jsx-basics', 'react-component-boundaries'])
  })
})
