import { describe, expect, it } from 'vitest'
import { buildSessionViewModel, createSessionState } from './controller.js'

describe('session controller model', () => {
  it('normalizes an absent or null draft map before rendering blocks', () => {
    expect(createSessionState({ draftsByBlockId: null }).draftsByBlockId).toEqual({})
  })

  it('keeps all activity drafts, tutor state, and completed-step review state together', () => {
    const blocks = [{ id: 'read-1', type: 'read' }, { id: 'quiz-1', type: 'choice' }]
    const model = buildSessionViewModel(createSessionState({
      session: { id: 8 }, activityDocument: { blocks },
      activityState: { currentBlockId: 'quiz-1', blocks: { 'read-1': { status: 'completed' }, 'quiz-1': { response: 'saved' } } },
      activityProgress: { currentBlockId: 'quiz-1', completed: 1, total: 2, percent: 50 },
      reviewBlockId: 'read-1', draftsByBlockId: { 'quiz-1': { selected: 'b', text: 'draft' } },
      tutor: { draft: 'Why does this matter?', expanded: true }, artifactRequired: true,
    }))

    expect(model).toMatchObject({
      state: 'active', currentBlock: blocks[1], viewedBlock: blocks[0], viewedEntry: { status: 'completed' },
      draftsByBlockId: { 'quiz-1': { selected: 'b', text: 'draft' } }, reviewMode: true,
      artifactRequired: true, tutor: { draft: 'Why does this matter?', expanded: true },
    })
    expect(model.progress).toMatchObject({ completed: 1, total: 2, percent: 50 })
  })

  it('classifies locked, complete, and unavailable states', () => {
    expect(buildSessionViewModel({ data: { locked: true } }).state).toBe('locked')
    expect(buildSessionViewModel({ data: { progress: { state: 'passed' }, activityDocument: { blocks: [] }, activityState: { blocks: {} } } }).state).toBe('complete')
    expect(buildSessionViewModel({ error: Object.assign(new Error('SQLITE_ERROR'), { status: 500 }) }).publicError.message)
      .toContain('Session')
  })
})
