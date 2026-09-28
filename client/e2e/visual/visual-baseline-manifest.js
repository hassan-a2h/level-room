export const VISUAL_BASELINE_THEMES = Object.freeze(['living-atlas', 'curiosity-engine', 'mission-workshop'])
export const VISUAL_BASELINE_VIEWPORTS = Object.freeze([
  { id: '390x844', width: 390, height: 844 },
  { id: '1440x900', width: 1440, height: 900 },
])

export const VISUAL_BASELINE_STATES = Object.freeze([
  { route: 'dashboard', state: 'empty', path: '/', scenario: 'emptyDashboard' },
  { route: 'dashboard', state: 'active', path: '/', scenario: 'populatedDashboard' },
  { route: 'dashboard', state: 'setup-resume', path: '/', scenario: 'setupResume' },
  { route: 'dashboard', state: 'complete', path: '/', scenario: 'completeDashboard' },
  { route: 'settings', state: 'appearance', path: '/settings', scenario: 'settings' },
  { route: 'checkpoint', state: 'intro', path: '/topic/1/chapter/42/checkpoint', scenario: 'checkpoint' },
  { route: 'checkpoint', state: 'question', path: '/topic/1/chapter/42/checkpoint', scenario: 'checkpoint' },
  { route: 'checkpoint', state: 'passed', path: '/topic/1/chapter/42/checkpoint', scenario: 'checkpointPassed' },
  { route: 'checkpoint', state: 'remediation', path: '/topic/1/chapter/42/checkpoint', scenario: 'checkpointRemediation' },
  { route: 'reviews', state: 'queue', path: '/reviews', scenario: 'reviewFlow' },
  { route: 'reviews', state: 'question', path: '/reviews', scenario: 'reviewFlow' },
  { route: 'reviews', state: 'feedback', path: '/reviews', scenario: 'reviewFlow' },
  { route: 'reviews', state: 'summary', path: '/reviews', scenario: 'reviewFlow' },
  { route: 'onboarding', state: 'destination', path: '/onboarding', scenario: 'onboarding' },
  { route: 'onboarding', state: 'placement', path: '/onboarding', scenario: 'onboarding' },
  { route: 'onboarding', state: 'rhythm', path: '/onboarding', scenario: 'onboarding' },
  { route: 'onboarding', state: 'generating', path: '/onboarding', scenario: 'onboardingGenerating' },
  { route: 'onboarding', state: 'preview', path: '/onboarding', scenario: 'onboarding' },
  { route: 'session', state: 'choice', path: '/topic/1/lesson/8', scenario: 'sessionChoice' },
  { route: 'session', state: 'ordering', path: '/topic/1/lesson/8', scenario: 'sessionOrdering' },
  { route: 'session', state: 'written', path: '/topic/1/lesson/8', scenario: 'sessionWritten' },
  { route: 'session', state: 'tutor-open', path: '/topic/1/lesson/8', scenario: 'sessionTutorOpen' },
  { route: 'session', state: 'complete', path: '/topic/1/lesson/8', scenario: 'sessionComplete' },
  { route: 'build', state: 'brief', path: '/topic/1/lesson/8', scenario: 'buildBrief' },
  { route: 'build', state: 'evidence', path: '/topic/1/lesson/8', scenario: 'buildEvidence' },
  { route: 'build', state: 'review', path: '/topic/1/lesson/8', scenario: 'buildReview' },
  { route: 'build', state: 'failed-result', path: '/topic/1/lesson/8', scenario: 'buildFailed' },
  { route: 'build', state: 'passed-result', path: '/topic/1/lesson/8', scenario: 'buildPassed' },
  { route: 'continuation', state: 'preview', path: '/topic/1/continue', scenario: 'continuation' },
  { route: 'support', state: 'service-error', path: '/support?kind=server&message=SQLITE_ERROR%3A%20private%20details', scenario: 'settings' },
  { route: 'support', state: 'offline', path: '/', scenario: 'offline' },
  { route: 'not-found', state: '404', path: '/this-route-does-not-exist', scenario: 'settings' },
])

export function getVisualBaselineManifest() {
  return VISUAL_BASELINE_THEMES.flatMap((theme) => VISUAL_BASELINE_STATES.flatMap((state) => VISUAL_BASELINE_VIEWPORTS.map((viewport) => ({
    ...state,
    theme,
    viewport,
    screenshot: `${theme}-${state.route}-${state.state}-${viewport.id}.png`,
  }))))
}

export function assertCompleteVisualBaselineManifest(manifest = getVisualBaselineManifest()) {
  const expectedCount = VISUAL_BASELINE_THEMES.length * VISUAL_BASELINE_STATES.length * VISUAL_BASELINE_VIEWPORTS.length
  const names = manifest.map(({ screenshot }) => screenshot)
  if (manifest.length !== expectedCount || new Set(names).size !== expectedCount) {
    throw new Error(`Visual baseline matrix is incomplete or contains duplicates: expected ${expectedCount} unique captures, found ${names.length}.`)
  }
  for (const theme of VISUAL_BASELINE_THEMES) for (const state of VISUAL_BASELINE_STATES) for (const viewport of VISUAL_BASELINE_VIEWPORTS) {
    const expected = `${theme}-${state.route}-${state.state}-${viewport.id}.png`
    if (!names.includes(expected)) throw new Error(`Visual baseline matrix is missing ${expected}.`)
  }
  return manifest
}
