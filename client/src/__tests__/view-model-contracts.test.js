import { describe, expect, it } from 'vitest'
import {
  VIEW_MODEL_FIELDS,
  VIEW_MODEL_NAMES,
  validateViewModelFixture,
} from '../theme/core/packContract.js'

const fixtures = {
  Trail: {
    state: 'ready', topic: {}, topics: [], nextAction: {}, chapters: [], visibleChapters: [], review: {}, rhythm: {}, focusAreas: [],
    ui: {}, busy: {}, error: null,
  },
  Onboarding: {
    stage: 'destination', stageIndex: 0, stageCount: 4, substep: null, destination: '', levelOptions: [], selectedLevel: null,
    placement: {}, timeOptions: [], selectedTime: null, paceOptions: [], selectedPace: null, generation: {}, preview: {}, error: null, busy: {}, providerReady: true,
  },
  Session: {
    state: 'active', session: {}, progress: {}, blocks: [], currentBlock: null, viewedBlock: null, viewedEntry: null, draftsByBlockId: {},
    reviewMode: false, artifactRequired: false, tutor: {}, busy: {}, publicError: null,
  },
  Checkpoint: {
    phase: 'intro', module: {}, outcomes: [], questions: [], currentQuestion: null, currentIndex: 0, answers: {}, answeredCount: 0,
    saveState: '', evaluation: null, isPartialRetest: false, ready: true, lessonsRemaining: 0, busy: {}, error: null,
  },
  Review: {
    phase: 'queue', counts: {}, dueItems: [], sessionId: null, questions: [], currentQuestion: null, currentIndex: 0,
    totalQuestions: 0, remainingCount: 0, answers: {}, feedbackByQuestionId: {}, feedbackIndex: 0, result: null,
    ui: {}, busy: {}, error: null,
  },
  Build: {
    phase: 'brief', taskSpec: {}, artifactType: '', evidence: {}, currentEvidenceStep: '', content: '', fileName: null, rubric: [],
    evaluation: null, ui: {}, error: null, busy: {},
  },
  Continuation: {
    phase: 'loading', parentTrack: {}, readiness: {}, level: null, timeCommitment: null, profileStale: false, preview: null,
    selectedChapterId: null, adjustmentDraft: null, adjustmentOpen: false, busy: {}, error: null,
  },
  Settings: {
    phase: 'loading', category: 'appearance', themes: [], themeId: 'living-atlas', providers: [], provider: null, model: null,
    reasoningEffort: null, environmentStatuses: {}, codexConnection: {}, ready: false, saving: false, exportState: {}, importState: {},
    pendingBackup: null, success: null, error: null,
  },
  Support: {
    kind: 'offline', title: 'Offline', message: 'Try again later.', detail: null, retryable: true, returnLabel: 'Home',
  },
}

describe('canonical view-model fixtures', () => {
  it('locks every canonical model and its top-level fields', () => {
    expect(VIEW_MODEL_NAMES).toEqual(Object.keys(fixtures))
    expect(Object.isFrozen(VIEW_MODEL_NAMES)).toBe(true)
    expect(Object.isFrozen(VIEW_MODEL_FIELDS)).toBe(true)

    for (const name of VIEW_MODEL_NAMES) {
      expect(Object.keys(fixtures[name])).toEqual(expect.arrayContaining(VIEW_MODEL_FIELDS[name]))
      expect(() => validateViewModelFixture(name, fixtures[name])).not.toThrow()
    }
  })

  it('rejects a missing canonical field and an unknown model name', () => {
    const { busy, ...incompleteTrail } = fixtures.Trail
    expect(busy).toEqual({})
    expect(() => validateViewModelFixture('Trail', incompleteTrail)).toThrow(/busy/)
    expect(() => validateViewModelFixture('Unknown', {})).toThrow(/Unknown/)
  })
})
