import { validateViewModelFixture } from './packContract.js'

export const THEME_VIEW_ACTIONS = Object.freeze({
  Session: Object.freeze([
    'setBlockDraft', 'setOrdering', 'revealWorkedStep', 'completeBlock', 'submitBlock', 'reviewBlock',
    'returnToCurrentBlock', 'openTutor', 'closeTutor', 'setTutorDraft', 'returnToTrail',
  ]),
  Build: Object.freeze([
    'begin', 'setPhase', 'setEvidence', 'setContent', 'selectFile', 'nextEvidence', 'previousEvidence',
    'openHints', 'closeHints', 'openRubric', 'closeRubric', 'reviewSubmission', 'submit', 'revise', 'returnToTrail',
  ]),
  Settings: Object.freeze([
    'selectCategory', 'selectTheme', 'setProvider', 'setModel', 'setReasoningEffort', 'saveProvider',
    'exportData', 'chooseImportFile', 'cancelImport', 'confirmImport', 'retry',
  ]),
})

export const THEME_VIEW_SLOTS = Object.freeze({
  Session: Object.freeze(['activity', 'tutor']),
  Build: Object.freeze(['genericArtifactInput']),
  Settings: Object.freeze(['codexConnection']),
})

export function validateThemeViewContract(name, contract) {
  const actions = THEME_VIEW_ACTIONS[name]
  const slots = THEME_VIEW_SLOTS[name]
  if (!actions || !slots) throw new Error(`Unknown theme view contract: ${name}`)
  if (!contract || typeof contract !== 'object') throw new Error(`${name} view contract must be an object`)

  validateViewModelFixture(name, contract.model)

  if (!contract.actions || typeof contract.actions !== 'object' || Array.isArray(contract.actions)) {
    throw new Error(`${name} actions must be an object`)
  }
  for (const action of actions) {
    if (typeof contract.actions[action] !== 'function') throw new Error(`${name} actions.${action} must be a function`)
  }

  if (!contract.slots || typeof contract.slots !== 'object' || Array.isArray(contract.slots)) {
    throw new Error(`${name} slots must be an object`)
  }
  for (const slot of slots) {
    if (!Object.hasOwn(contract.slots, slot)) throw new Error(`${name} slots.${slot} is required`)
  }
  for (const slot of Object.keys(contract.slots)) {
    if (!slots.includes(slot)) throw new Error(`${name} slots.${slot} is not allowed`)
  }
  return contract
}
