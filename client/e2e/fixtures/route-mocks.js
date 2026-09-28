const API_ORIGIN = 'http://localhost:3200'

const settings = {
  provider: '',
  model: '',
  apiKeySet: false,
  ready: false,
  envStatus: [],
  providers: [],
}

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
  emptyReviews: {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
  settings: {
    topics: { topics: [] },
    reviewCount: { totalDue: 0, dueToday: 0, overdue: 0 },
    reviews: { due: [] },
  },
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
