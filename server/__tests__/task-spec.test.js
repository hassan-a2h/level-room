import { describe, expect, it } from 'vitest'
import {
  TASK_SETUP_KINDS,
  normalizeTaskSpec,
  validateTaskSpec,
  validateTaskTextPolicy,
} from '../utils/task-spec.js'

function validTask(overrides = {}) {
  return {
    title: 'Build and verify a small local setup',
    scenario: 'You are preparing a safe development environment for a teammate.',
    goal: 'Create the setup and demonstrate the requested behavior.',
    constraints: ['Use test data only', 'Do not use paid services or secrets'],
    deliverables: ['Relevant configuration or commands', 'Observed output', 'A short explanation'],
    success_criteria: ['The requested behavior is observable', 'The result can be reproduced from the submitted evidence'],
    estimated_time: 25,
    primary_setup: {
      kind: 'local',
      description: 'Use a local installation or containerized equivalent.',
      requires_account: false,
      requires_payment: false,
      requires_secret: false,
      requires_external_target: false,
    },
    free_fallback: {
      kind: 'no_software',
      description: 'Use the supplied sample data and explain the expected configuration and output.',
      requires_account: false,
      requires_payment: false,
      requires_secret: false,
      requires_external_target: false,
    },
    hints: ['Start by identifying the smallest working setup.'],
    safety_notes: ['Use only systems you own or an isolated local environment.'],
    ...overrides,
  }
}

describe('task specification validation', () => {
  it('accepts every supported free setup kind', () => {
    for (const kind of TASK_SETUP_KINDS) {
      const result = validateTaskSpec(validTask({ primary_setup: { ...validTask().primary_setup, kind } }))
      expect(result.valid, kind).toBe(true)
    }
  })

  it('normalizes bounded text without silently repairing unsafe data', () => {
    const result = normalizeTaskSpec(validTask({ title: '  Local task  ' }))
    expect(result.title).toBe('Local task')
    expect(() => normalizeTaskSpec(validTask({ primary_setup: { ...validTask().primary_setup, requires_secret: true } }))).toThrow(/secret/i)
  })

  it('requires fallback, deliverables, and success criteria', () => {
    expect(validateTaskSpec(validTask({ free_fallback: undefined })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ deliverables: [] })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ success_criteria: ['only one'] })).valid).toBe(false)
  })

  it('rejects unsupported access flags and unsafe setup kinds', () => {
    expect(validateTaskSpec(validTask({ primary_setup: { ...validTask().primary_setup, kind: 'paid_service' } })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ primary_setup: { ...validTask().primary_setup, requires_payment: true } })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ primary_setup: { ...validTask().primary_setup, requires_external_target: true } })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ primary_setup: { ...validTask().primary_setup, requires_account: true } })).valid).toBe(false)
  })

  it('allows a free-public primary account only with an account-free fallback', () => {
    const primary = { ...validTask().primary_setup, kind: 'free_public', requires_account: true }
    expect(validateTaskSpec(validTask({ primary_setup: primary })).valid).toBe(true)
    expect(validateTaskSpec(validTask({
      primary_setup: primary,
      free_fallback: { ...validTask().free_fallback, requires_account: true },
    })).valid).toBe(false)
  })

  it('rejects positive unsafe imperatives but accepts explicit prohibitions', () => {
    expect(validateTaskTextPolicy('Use production credentials to complete this task.').valid).toBe(false)
    expect(validateTaskTextPolicy('Paste an API token into the live service.').valid).toBe(false)
    expect(validateTaskTextPolicy('Create an account to continue.').valid).toBe(false)
    expect(validateTaskTextPolicy('Do not use production credentials or live systems.').valid).toBe(true)
    expect(validateTaskTextPolicy('Without secrets, use the local fixture.').valid).toBe(true)
    expect(validateTaskTextPolicy('Do not use production credentials. Then use production credentials.').valid).toBe(false)
    expect(validateTaskTextPolicy('Do not use paid services, then paste an API token.').valid).toBe(false)
  })

  it('enforces all field and time boundaries', () => {
    expect(validateTaskSpec(validTask({ title: 'x'.repeat(121) })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ estimated_time: 0 })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ estimated_time: 181 })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ hints: ['one', 'two', 'three'] })).valid).toBe(false)
    expect(validateTaskSpec(validTask({ constraints: ['one', 'two', 'three', 'four', 'five', 'six'] })).valid).toBe(false)
  })
})
