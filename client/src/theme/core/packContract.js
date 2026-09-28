export const DEFAULT_THEME_ID = 'living-atlas'

export const REQUIRED_THEME_IDS = Object.freeze([
  'living-atlas',
  'curiosity-engine',
  'mission-workshop',
])

export const REQUIRED_TOKEN_KEYS = Object.freeze([
  'canvas', 'panel', 'elevated', 'inset', 'border', 'borderStrong', 'ink', 'inkSoft', 'inkMuted',
  'primary', 'primaryHover', 'primaryContrast', 'secondary', 'accentWarm', 'accentSun', 'success',
  'warning', 'danger', 'fontDisplay', 'fontBody', 'fontLabel', 'radiusControl', 'radiusPanel',
  'radiusHero', 'motionFast', 'motionStandard', 'motionSpatial',
])

export const THEME_VIEW_NAMES = Object.freeze([
  'OnboardingView', 'TrailView', 'SessionView', 'CheckpointView', 'ReviewQueueView', 'ReviewSessionView',
  'BuildView', 'ContinuationView', 'SettingsView', 'SupportView',
])

export const VIEW_MODEL_FIELDS = Object.freeze({
  Trail: Object.freeze([
    'state', 'topic', 'topics', 'nextAction', 'chapters', 'visibleChapters', 'review', 'rhythm', 'focusAreas', 'ui', 'busy', 'error',
  ]),
  Onboarding: Object.freeze([
    'stage', 'stageIndex', 'stageCount', 'substep', 'destination', 'levelOptions', 'selectedLevel', 'placement', 'timeOptions',
    'selectedTime', 'paceOptions', 'selectedPace', 'generation', 'preview', 'error', 'busy', 'providerReady',
  ]),
  Session: Object.freeze([
    'state', 'session', 'progress', 'blocks', 'currentBlock', 'viewedBlock', 'viewedEntry', 'draftsByBlockId', 'reviewMode',
    'artifactRequired', 'tutor', 'busy', 'publicError',
  ]),
  Checkpoint: Object.freeze([
    'phase', 'module', 'outcomes', 'questions', 'currentQuestion', 'currentIndex', 'answers', 'answeredCount', 'saveState',
    'evaluation', 'isPartialRetest', 'ready', 'lessonsRemaining', 'busy', 'error',
  ]),
  Review: Object.freeze([
    'phase', 'counts', 'dueItems', 'sessionId', 'questions', 'currentQuestion', 'currentIndex', 'totalQuestions', 'remainingCount',
    'answers', 'feedbackByQuestionId', 'feedbackIndex', 'result', 'ui', 'busy', 'error',
  ]),
  Build: Object.freeze([
    'phase', 'taskSpec', 'artifactType', 'evidence', 'currentEvidenceStep', 'content', 'fileName', 'rubric', 'evaluation', 'ui', 'error', 'busy',
  ]),
  Continuation: Object.freeze([
    'phase', 'parentTrack', 'readiness', 'level', 'timeCommitment', 'profileStale', 'preview', 'selectedChapterId', 'adjustmentDraft',
    'adjustmentOpen', 'busy', 'error',
  ]),
  Settings: Object.freeze([
    'phase', 'category', 'themes', 'themeId', 'providers', 'provider', 'model', 'reasoningEffort', 'environmentStatuses',
    'codexConnection', 'ready', 'saving', 'exportState', 'importState', 'pendingBackup', 'success', 'error',
  ]),
  Support: Object.freeze(['kind', 'title', 'message', 'detail', 'retryable', 'returnLabel']),
})

export const VIEW_MODEL_NAMES = Object.freeze(Object.keys(VIEW_MODEL_FIELDS))

const requiredPackFields = Object.freeze([
  'id', 'name', 'mode', 'tagline', 'previewAsset', 'tokens', 'artwork', 'viewLoaders',
])

function isRecord(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function assertFields(record, fields, prefix) {
  for (const field of fields) {
    if (!Object.hasOwn(record, field)) throw new Error(`${prefix}.${field} is required`)
  }
}

export function validateThemePack(pack) {
  if (!isRecord(pack)) throw new Error('Theme pack must be an object')
  assertFields(pack, requiredPackFields, 'pack')

  if (!REQUIRED_THEME_IDS.includes(pack.id)) throw new Error(`pack.id must be one of: ${REQUIRED_THEME_IDS.join(', ')}`)
  const expectedMode = pack.id === 'mission-workshop' ? 'dark' : 'light'
  if (pack.mode !== expectedMode) throw new Error(`pack.mode for ${pack.id} must be ${expectedMode}`)
  for (const field of ['name', 'tagline', 'previewAsset']) {
    if (typeof pack[field] !== 'string' || pack[field].trim() === '') throw new Error(`pack.${field} must be a non-empty string`)
  }
  if (!isRecord(pack.tokens)) throw new Error('pack.tokens must be an object')
  for (const key of REQUIRED_TOKEN_KEYS) {
    if (typeof pack.tokens[key] !== 'string' || pack.tokens[key].trim() === '') {
      throw new Error(`pack.tokens.${key} must be a non-empty string`)
    }
  }
  if (!isRecord(pack.artwork)) throw new Error('pack.artwork must be an object')
  if (!isRecord(pack.viewLoaders)) throw new Error('pack.viewLoaders must be an object')
  for (const name of THEME_VIEW_NAMES) {
    if (typeof pack.viewLoaders[name] !== 'function') throw new Error(`pack.viewLoaders.${name} must be a loader function`)
  }

  return pack
}

export function validateViewModelFixture(name, model) {
  const fields = VIEW_MODEL_FIELDS[name]
  if (!fields) throw new Error(`Unknown view model: ${name}`)
  if (!isRecord(model)) throw new Error(`${name} view model must be an object`)
  assertFields(model, fields, `${name} view model`)
  return model
}
