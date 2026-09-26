import { describe, expect, it } from 'vitest'
import { collectCurriculumDraft, validateCurriculum } from '../utils/curriculum-draft.js'

function makeTask() {
  return {
    title: 'Verify a component output',
    scenario: 'Use a small local fixture.',
    goal: 'Render and verify the expected output.',
    constraints: ['Use test data only'],
    deliverables: ['Component source', 'Observed output'],
    success_criteria: ['The output is observable', 'The result is reproducible'],
    estimated_time: 20,
    primary_setup: { kind: 'local', description: 'Run in a local project.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
    free_fallback: { kind: 'no_software', description: 'Trace the expected output by hand.', requires_account: false, requires_payment: false, requires_secret: false, requires_external_target: false },
    hints: [],
    safety_notes: ['Use only local test data.'],
  }
}

function makeOutcome(id, kind, role = 'core') {
  return {
    id,
    title: `Learn ${id.replaceAll('-', ' ')}`,
    kind,
    role,
    evidence: kind === 'skill' ? ['activity', 'checkpoint', 'artifact'] : ['activity', 'checkpoint'],
  }
}

function makeCurriculum() {
  return {
    course: { kind: 'core', stage: 0, focus: '' },
    modules: Array.from({ length: 3 }, (_, moduleIndex) => {
      const index = moduleIndex + 1
      const knowledge = makeOutcome(`react-knowledge-${index}`, 'knowledge')
      const skill = makeOutcome(`react-skill-${index}`, 'skill')
      return {
        title: `React chapter ${index}`,
        summary: `Chapter ${index} summary`,
        skill_outcomes: [knowledge, skill],
        lessons: [
          { title: `Session ${index}.1`, depth: 'Beginner', estimated_time: 10, outcomes: [knowledge], prerequisites: [], artifact_required: false },
          { title: `Session ${index}.2`, depth: 'Intermediate', estimated_time: 15, outcomes: [skill], prerequisites: [`Session ${index}.1`], artifact_required: true, task: makeTask() },
          { title: `Session ${index}.3`, depth: 'Intermediate', estimated_time: 15, outcomes: [knowledge, skill], prerequisites: [`Session ${index}.2`], artifact_required: false },
        ],
      }
    }),
  }
}

describe('curriculum draft outcome and Build contracts', () => {
  it('accepts structured outcomes with one selected Build per Chapter', () => {
    const result = validateCurriculum(makeCurriculum(), { enforceBounds: true })
    expect(result.valid).toBe(true)
    expect(result.value.modules[0].skill_outcomes[0]).toMatchObject({ id: 'react-knowledge-1', kind: 'knowledge' })
    expect(result.value.modules[0].lessons.filter((lesson) => lesson.artifact_required)).toHaveLength(1)
  })

  it('does not require a practical task on every Session', () => {
    const result = validateCurriculum(makeCurriculum(), { enforceBounds: true, requireTasks: true })
    expect(result.valid).toBe(true)
    expect(result.value.modules[0].lessons[0]).not.toHaveProperty('task')
  })

  it.each([0, 3])('requires one or two Build Sessions per Chapter (got %i)', (buildCount) => {
    const curriculum = makeCurriculum()
    const lessons = curriculum.modules[0].lessons
    if (buildCount === 0) {
      lessons[1].artifact_required = false
      delete lessons[1].task
    } else {
      lessons[0].artifact_required = true
      lessons[0].task = makeTask()
      lessons[2].artifact_required = true
      lessons[2].task = makeTask()
    }
    const result = validateCurriculum(curriculum, { enforceBounds: true })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/one or two required Builds/i)
  })

  it('requires a task spec on each selected Build Session', () => {
    const curriculum = makeCurriculum()
    delete curriculum.modules[0].lessons[1].task
    const result = validateCurriculum(curriculum, { enforceBounds: true })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/selected Build/i)
  })

  it('rejects task specs on Sessions that do not require a Build', () => {
    const curriculum = makeCurriculum()
    curriculum.modules[0].lessons[0].task = makeTask()
    const result = validateCurriculum(curriculum, { enforceBounds: true })
    expect(result.valid).toBe(false)
    expect(result.error).toMatch(/does not require a Build/i)
  })

  it('rejects legacy string outcomes rather than coercing them', () => {
    const curriculum = makeCurriculum()
    curriculum.modules[0].skill_outcomes[0] = 'Understand JSX'
    const result = validateCurriculum(curriculum, { enforceBounds: true })
    expect(result.valid).toBe(false)
    expect(result.code).toBe('OUTCOME_INVALID')
  })

  it('forwards continuation lineage duplicate validation', () => {
    const curriculum = makeCurriculum()
    curriculum.course.kind = 'advanced'
    const result = validateCurriculum(curriculum, {
      enforceBounds: true,
      trackKind: 'continuation',
      lineageOutcomes: [{ id: 'react-knowledge-1', title: 'Earlier outcome' }],
    })
    expect(result.valid).toBe(false)
    expect(result.code).toBe('OUTCOME_LINEAGE_ID_DUPLICATE')
  })

  it('requires bounded new Tracks and 3-5 Sessions per Chapter', () => {
    const tooFewChapters = makeCurriculum()
    tooFewChapters.modules.pop()
    expect(validateCurriculum(tooFewChapters, { enforceBounds: true }).valid).toBe(false)

    const tooFewSessions = makeCurriculum()
    tooFewSessions.modules[0].lessons.pop()
    expect(validateCurriculum(tooFewSessions, { enforceBounds: true }).valid).toBe(false)
  })
})

describe('curriculum draft streaming progress', () => {
  it('reports each streamed chunk for generation lease renewal', async () => {
    const chunks = []
    const raw = JSON.stringify(makeCurriculum())
    const stream = (async function* () {
      yield raw.slice(0, 12)
      yield raw.slice(12, 40)
      yield raw.slice(40)
    })()

    await expect(collectCurriculumDraft(stream, { onChunk: (chunk) => chunks.push(chunk) })).resolves.toMatchObject({
      modules: expect.arrayContaining([expect.objectContaining({ title: 'React chapter 1' })]),
    })
    expect(chunks).toHaveLength(3)
  })
})
