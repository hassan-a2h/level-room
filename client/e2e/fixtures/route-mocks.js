const API_ORIGIN = 'http://localhost:3200'

const settings = {
  provider: '',
  model: '',
  apiKeySet: false,
  ready: false,
  envStatus: [],
  providers: [],
}

const longTrailTitle = 'A deliberately long learning Trail title for responsive layout checks, narrow screens, zoom, and keyboard navigation'.slice(0, 100)
const longChapterTitle = 'Chapter 01: review long titles and responsive content across narrow screens with keyboard navigation'

const stressChapters = Array.from({ length: 20 }, (_, index) => ({
  id: 100 + index,
  title: index === 0
    ? longChapterTitle
    : `Chapter ${index + 1}: practice and apply the core idea`,
  status: index === 0 ? 'in_progress' : 'ready',
  sessions: [],
  checkpointStatus: 'locked',
}))

const scenarios = {
  emptyDashboard: {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  populatedDashboard: {
    topics: {
      topics: [{ id: 1, title: 'React foundations', status: 'active', progress: 0, totalLessons: 0, passedLessons: 0, hasChildren: false }],
    },
    dashboard: {
      topic: { id: 1, title: 'React foundations', status: 'active', progress: 0, totalLessons: 0, passedLessons: 0, resumeAvailable: false },
      modules: [],
      nextAction: { kind: 'unavailable', title: 'Your next practice session is ready.' },
      reviewSummary: { totalDue: 0, dueToday: 0, overdue: 0 },
      weeklyRhythm: { activeDays: 0, days: [] },
      focusAreas: [],
      mistakes: [],
    },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  stressTrail: {
    topics: { topics: [{ id: 1, title: longTrailTitle, status: 'active', progress: 0, totalLessons: 20, passedLessons: 0, hasChildren: false }] },
    dashboard: {
      topic: { id: 1, title: longTrailTitle, status: 'active', progress: 0, totalLessons: 20, passedLessons: 0, resumeAvailable: false },
      modules: stressChapters,
      nextAction: { kind: 'unavailable', title: 'Your next practice session is ready.' },
      reviewSummary: { totalDue: 0, dueToday: 0, overdue: 0 },
      weeklyRhythm: { activeDays: 0, days: [] },
      focusAreas: [],
      mistakes: [],
    },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  emptyReviews: {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  checkpoint: {
    topics: { topics: [{ id: 1, title: 'SQL foundations', status: 'active', progress: 100, totalLessons: 1, passedLessons: 1 }] },
    dashboard: {
      topic: { id: 1, title: 'SQL foundations', status: 'active', progress: 100, totalLessons: 1, passedLessons: 1 },
      modules: [{ id: 42, title: 'Joins', skill_outcomes: [{ id: 'join-core', title: 'Choose the right join', role: 'core' }], lessons: [{ id: 7, title: 'Join tables', state: 'passed', outcomes: [{ id: 'join-core', title: 'Choose the right join' }] }] }],
      nextAction: { kind: 'checkpoint', moduleId: 42, title: 'Chapter checkpoint' },
      reviewSummary: { totalDue: 0, dueToday: 0, overdue: 0 }, weeklyRhythm: { activeDays: 0, days: [] }, focusAreas: [], mistakes: [],
    },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  settings: {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  continuation: {
    topics: { topics: [{ id: 1, title: 'Completed SQL foundations', status: 'complete', progress: 100, totalLessons: 1, passedLessons: 1 }] },
    dashboard: {
      topic: { id: 1, title: 'Completed SQL foundations', status: 'complete', progress: 100, totalLessons: 1, passedLessons: 1 },
      modules: [{ id: 42, title: 'Joins', lessons: [{ id: 7, title: 'Join tables', task: null }], skill_outcomes: [{ id: 'join-core', title: 'Choose the right join' }] }],
      reviewSummary: { totalDue: 0, dueToday: 0, overdue: 0 },
    },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  offline: {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  onboarding: {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  onboardingGenerating: {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  setupResume: {
    topics: { topics: [{ id: 1, title: 'A Trail in progress', status: 'active', progress: 0, resumeAvailable: true, curriculumState: 'setup', hasChildren: false }] },
    dashboard: { topic: { id: 1, title: 'A Trail in progress', status: 'active', progress: 0, resumeAvailable: true, curriculumState: 'setup', hasChildren: false }, modules: [], nextAction: { kind: 'unavailable', title: 'Your next practice session is ready.' }, reviewSummary: { totalDue: 0, dueToday: 0, overdue: 0 } },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 }, reviews: { due: [] },
  },
  completeDashboard: {
    topics: { topics: [{ id: 1, title: 'Completed SQL foundations', status: 'completed', progress: 100, resumeAvailable: false, hasChildren: false }] },
    dashboard: { topic: { id: 1, title: 'Completed SQL foundations', status: 'completed', progress: 100, resumeAvailable: false, hasChildren: false }, modules: [], nextAction: { kind: 'track_complete', title: 'Your Track is complete.' }, reviewSummary: { totalDue: 0, dueToday: 0, overdue: 0 } },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 }, reviews: { due: [] },
  },
  reviewFlow: {
    topics: { topics: [] },
    reviewCount: { totalDue: 1, dueToday: 1, overdue: 0 },
    reviews: { due: [{ id: 71, topicId: 1, topicTitle: 'SQL foundations', moduleTitle: 'Working with joins', lessonTitle: 'Left and right joins', dueDate: 'Today', isOverdue: false }] },
  },
  checkpointPassed: {
    topics: { topics: [{ id: 1, title: 'SQL foundations', status: 'active', progress: 100, totalLessons: 1, passedLessons: 1 }] },
    dashboard: { topic: { id: 1, title: 'SQL foundations', status: 'active', progress: 100, totalLessons: 1, passedLessons: 1 }, modules: [{ id: 42, title: 'Joins', skill_outcomes: [{ id: 'join-core', title: 'Choose the right join', role: 'core' }], lessons: [{ id: 7, title: 'Join tables', state: 'passed', outcomes: [{ id: 'join-core', title: 'Choose the right join' }] }] }] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 }, reviews: { due: [] },
  },
  checkpointRemediation: {
    topics: { topics: [{ id: 1, title: 'SQL foundations', status: 'active', progress: 60, totalLessons: 1, passedLessons: 1 }] },
    dashboard: { topic: { id: 1, title: 'SQL foundations', status: 'active', progress: 60, totalLessons: 1, passedLessons: 1 }, modules: [{ id: 42, title: 'Joins', skill_outcomes: [{ id: 'join-core', title: 'Choose the right join', role: 'core' }], lessons: [{ id: 7, title: 'Join tables', state: 'passed', outcomes: [{ id: 'join-core', title: 'Choose the right join' }] }] }] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 }, reviews: { due: [] },
  },
}

const buildTaskSpec = {
  title: 'Explain a data relationship',
  scenario: 'A teammate needs a short explanation of how two datasets relate.',
  goal: 'Describe the join behavior using a small example.',
  constraints: ['Use only local example data.'],
  deliverables: ['A concise explanation.'],
  success_criteria: ['Identify which rows are preserved.'],
  primary_setup: { kind: 'local', description: 'Use a small in-memory table.' },
  free_fallback: { description: 'Describe the example in plain text.' },
  safety_notes: ['Use only sample data.'],
  hints: ['Compare the left and right tables.'],
}

function makeSessionScenario(block, { complete = false, artifactRequired = false, tutorMessages = [] } = {}) {
  const blocks = [block]
  const state = { status: complete ? 'completed' : 'active', attempts: complete ? 1 : 0, response: complete ? 'A LEFT JOIN preserves the left rows.' : undefined }
  return {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
    sessionData: {
      lesson: { id: 8, title: 'Working with data', module_title: 'Data foundations', estimated_time: 20, outcomes: [{ id: 'data-core', title: 'Describe a data relationship', role: 'core' }], artifact_required: artifactRequired, task_spec: artifactRequired ? buildTaskSpec : null, artifact_type: 'text' },
      progress: { state: complete ? 'passed' : 'practicing' },
      activityDocument: { schemaVersion: 1, lesson: { lessonId: 8 }, blocks },
      activityState: { currentBlockId: complete ? null : block.id, blocks: { [block.id]: state } },
      activityProgress: { completed: complete ? 1 : 0, total: 1, percent: complete ? 100 : 0, currentBlockId: complete ? null : block.id },
      artifactRequired,
      locked: false,
      messages: tutorMessages,
    },
  }
}

const choiceBlock = { id: 'choice-data', type: 'choice', title: 'Choose a join', prompt: 'Which join keeps every left row?', options: [{ id: 'left', label: 'LEFT JOIN' }, { id: 'inner', label: 'INNER JOIN' }], required: true, outcomeIds: ['data-core'] }
Object.assign(scenarios, {
  sessionChoice: makeSessionScenario(choiceBlock),
  sessionOrdering: makeSessionScenario({ id: 'order-data', type: 'ordering', title: 'Order the query steps', prompt: 'Put the query steps in order.', items: [{ id: 'select', label: 'Select columns' }, { id: 'join', label: 'Join the tables' }], required: true, outcomeIds: ['data-core'] }),
  sessionWritten: makeSessionScenario({ id: 'written-data', type: 'short_answer', title: 'Explain the relationship', prompt: 'How does a LEFT JOIN treat unmatched rows?', responseHint: 'Include which side is preserved.', minChars: 3, maxChars: 400, required: true, outcomeIds: ['data-core'] }),
  sessionTutorOpen: makeSessionScenario(choiceBlock, { tutorMessages: [{ id: 'guide-1', role: 'assistant', content: 'Start by identifying which table is on the left.' }] }),
  sessionComplete: makeSessionScenario({ id: 'read-data', type: 'read', title: 'Your takeaway', content: 'A LEFT JOIN preserves rows from the left table.', required: true, outcomeIds: ['data-core'] }, { complete: true }),
  buildBrief: makeSessionScenario({ id: 'read-build', type: 'read', title: 'Prepare for a Build', content: 'A practical Build will help you apply this skill.', required: true }, { complete: true, artifactRequired: true }),
  buildEvidence: makeSessionScenario({ id: 'read-build', type: 'read', title: 'Prepare for a Build', content: 'A practical Build will help you apply this skill.', required: true }, { complete: true, artifactRequired: true }),
  buildReview: makeSessionScenario({ id: 'read-build', type: 'read', title: 'Prepare for a Build', content: 'A practical Build will help you apply this skill.', required: true }, { complete: true, artifactRequired: true }),
  buildFailed: makeSessionScenario({ id: 'read-build', type: 'read', title: 'Prepare for a Build', content: 'A practical Build will help you apply this skill.', required: true }, { complete: true, artifactRequired: true }),
  buildPassed: makeSessionScenario({ id: 'read-build', type: 'read', title: 'Prepare for a Build', content: 'A practical Build will help you apply this skill.', required: true }, { complete: true, artifactRequired: true }),
})
scenarios.buildBrief.sessionData.lesson.task_spec = null
for (const name of ['buildBrief', 'buildEvidence', 'buildReview', 'buildFailed', 'buildPassed']) {
  scenarios[name].sessionData.progress.state = 'practicing'
}

function jsonResponse(route, body, status = 200) {
  return route.fulfill({
    status,
    contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' },
    body: JSON.stringify(body),
  })
}

async function installRouteMocks(context) {
  let scenarioName = 'emptyDashboard'
  const requests = []

  await context.route(`${API_ORIGIN}/health`, async (route) => {
    requests.push({ method: route.request().method(), path: '/health' })
    await jsonResponse(route, { ok: true })
  })

  await context.route(`${API_ORIGIN}/api/**`, async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const method = request.method()
    const path = url.pathname
    requests.push({ method, path })

    if (method === 'OPTIONS') {
      return route.fulfill({
        status: 204,
        headers: {
          'access-control-allow-origin': '*',
          'access-control-allow-methods': 'GET, POST, DELETE, OPTIONS',
          'access-control-allow-headers': 'content-type',
        },
      })
    }

    const state = scenarios[scenarioName]

    if ((scenarioName.startsWith('session') || scenarioName.startsWith('build')) && method === 'GET' && path === '/api/topics/1/lessons/8') {
      return jsonResponse(route, state.sessionData)
    }
    if (scenarioName.startsWith('build') && path === '/api/topics/1/lessons/8/artifact') {
      if (method === 'GET') return jsonResponse(route, {})
      if (method === 'POST') {
        const passed = scenarioName === 'buildPassed'
        return jsonResponse(route, { evaluation: { passed, overallScore: passed ? 100 : 45, scores: { Correctness: passed ? 4 : 2, Completeness: passed ? 4 : 2, Clarity: passed ? 4 : 2, 'Edge Cases': passed ? 4 : 1 }, feedback: { Correctness: 'The evidence is clear.', Completeness: 'The key details are covered.', Clarity: 'Easy to follow.', 'Edge Cases': 'Consider one additional case.' } } })
      }
    }

    if (scenarioName.startsWith('onboarding') && method === 'POST' && path === '/api/topics') return jsonResponse(route, { topic: { id: 1, title: 'Data skills' } })
    if (scenarioName.startsWith('onboarding') && path === '/api/topics/1/setup-questions') {
      return jsonResponse(route, { questions: [
        { id: 'level', text: 'How familiar are you with this topic?', options: ['Beginner', 'Intermediate', 'Advanced'] },
        { id: 'timeCommitment', text: 'How much time can you study most days?', options: ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day'] },
      ] })
    }
    if (scenarioName.startsWith('onboarding') && method === 'POST' && path === '/api/topics/1/profile') return jsonResponse(route, { ok: true })
    if (scenarioName === 'onboarding' && method === 'POST' && path === '/api/topics/1/curriculum/generate') return jsonResponse(route, {
      title: 'Data skills foundations', modules: [{ id: 21, title: 'Working with data', lessons: [{ id: 31, title: 'Shape a table', estimated_time: 20 }], skill_outcomes: [{ id: 'data-core', title: 'Describe a data table', role: 'core' }] }],
    })
    if (scenarioName.startsWith('onboarding') && method === 'POST' && path === '/api/topics/1/placement/start') return jsonResponse(route, {
      assessmentId: 8, questions: [{ id: 'data-q1', text: 'Which structure stores related records?', type: 'multiple_choice', options: [{ value: 'table', label: 'A table' }, { value: 'image', label: 'An image' }] }],
    })
    if (scenarioName.startsWith('onboarding') && method === 'POST' && path === '/api/topics/1/placement/submit') return jsonResponse(route, { assessmentId: 8, requestedLevel: 'Beginner', recommendedLevel: 'Beginner' })

    if (scenarioName === 'reviewFlow' && method === 'POST' && path === '/api/reviews/start') return jsonResponse(route, {
      sessionId: 'review-1', totalQuestions: 1, remainingCount: 0,
      questions: [{ id: 'review-q1', text: 'What does a LEFT JOIN preserve?', lessonTitle: 'Left and right joins', topicTitle: 'SQL foundations' }],
    })
    if (scenarioName === 'reviewFlow' && method === 'POST' && path === '/api/reviews/review-1/submit') return jsonResponse(route, {
      feedback: [{ questionId: 'review-q1', correct: true, score: 100, explanation: 'A LEFT JOIN preserves each row from the left table.' }],
      overallScore: 100, passed: true, accelerated: true, perItemResults: [{ lessonTitle: 'Left and right joins', score: 100, correctCount: 1, totalCount: 1 }],
    })

    if (scenarioName === 'continuation' && path === '/api/topics/1/continuation-readiness') {
      return jsonResponse(route, { eligible: true, course: { title: 'Completed SQL foundations', level: 'Intermediate', time_per_week: '30 min/day' }, summary: { outcomes: [{ id: 'join-core', title: 'Choose the right join' }] } })
    }
    if (scenarioName === 'continuation' && path === '/api/topics/1/continuations/generate') {
      return route.fulfill({ status: 200, contentType: 'text/event-stream', body: 'event: curriculum\ndata: {"title":"Practical SQL patterns","modules":[{"id":51,"title":"Reliable joins","summary":"Build from the foundations.","lessons":[{"id":61,"title":"Join with intent","estimated_time":25}],"skill_outcomes":[{"id":"join-core","title":"Choose the right join","role":"core"}]}]}\n\nevent: message\ndata: "[DONE]"\n\n' })
    }

    if (scenarioName.startsWith('checkpoint') && path === '/api/topics/1/modules/42/exam') {
      if (method === 'GET') return jsonResponse(route, { error: 'No checkpoint is in progress.', code: 'CHECKPOINT_NOT_FOUND' }, 404)
      if (method === 'POST') return jsonResponse(route, {
        id: 99, type: 'full', moduleTitle: 'Joins', answers: {},
        questions: [{ id: 'join-q1', text: 'Which join keeps every left row?', type: 'choice', options: [{ id: 'left', label: 'LEFT JOIN' }, { id: 'inner', label: 'INNER JOIN' }] }],
      })
    }
    if (scenarioName.startsWith('checkpoint') && path === '/api/topics/1/modules/42/exam/save-progress') return jsonResponse(route, { ok: true })
    if (scenarioName.startsWith('checkpoint') && path === '/api/topics/1/modules/42/exam/submit') {
      const passed = scenarioName === 'checkpointPassed'
      return jsonResponse(route, {
        passed, overallScore: passed ? 100 : 45, failedOutcomeIds: passed ? [] : ['join-core'],
        perOutcomeEvidence: { 'join-core': { score: passed ? 100 : 45 } }, feedback: [],
      })
    }

    if (method === 'GET' && path === '/api/topics') return jsonResponse(route, state.topics)
    if (method === 'GET' && path === '/api/topics/default') {
      return jsonResponse(route, { topic: state.dashboard?.topic || null })
    }
    if (method === 'POST' && path === '/api/topics/1/select') return jsonResponse(route, { ok: true })
    if (method === 'GET' && path === '/api/topics/1/dashboard' && state.dashboard) {
      return jsonResponse(route, state.dashboard)
    }
    if (method === 'GET' && path === '/api/reviews/count') return jsonResponse(route, state.reviewCount)
    if (method === 'GET' && path === '/api/reviews') return jsonResponse(route, state.reviews)
    if (method === 'GET' && path === '/api/settings') return jsonResponse(route, settings)
    if (method === 'POST' && path === '/api/settings') return jsonResponse(route, { ...settings, ready: true })
    if (method === 'GET' && path === '/api/settings/codex/connection') {
      return jsonResponse(route, { status: 'disconnected', connected: false })
    }

    return jsonResponse(route, { error: `Unhandled test API request: ${method} ${path}` }, 501)
  })

  return {
    requests,
    useScenario(name) {
      if (!Object.hasOwn(scenarios, name)) throw new Error(`Unknown API fixture scenario: ${name}`)
      scenarioName = name
    },
  }
}

export { installRouteMocks }
