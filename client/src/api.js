const API_BASE = 'http://localhost:3200'

export async function getSettings() {
  const res = await fetch(`${API_BASE}/api/settings`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function saveSettings({ provider, apiKey, model }) {
  const res = await fetch(`${API_BASE}/api/settings`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, apiKey, model }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function clearApiKey() {
  const res = await fetch(`${API_BASE}/api/settings/key`, {
    method: 'DELETE',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

// Dashboard / Topics API
export async function getTopics() {
  const res = await fetch(`${API_BASE}/api/topics`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function getDefaultTopic() {
  const res = await fetch(`${API_BASE}/api/topics/default`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function getDashboard(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/dashboard`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function createTopic(title) {
  const res = await fetch(`${API_BASE}/api/topics`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ title }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function deleteTopic(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}`, {
    method: 'DELETE',
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function selectTopic(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/select`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function updateLessonState(topicId, lessonId, state) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/state`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ state }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

// Curriculum / Onboarding API
export async function getSetupQuestions(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/setup-questions`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function saveProfile(topicId, { level, timeCommitment }) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, timeCommitment }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function getCurriculum(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/curriculum`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function confirmCurriculum(topicId, curriculum) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/curriculum/confirm`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ curriculum }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function tweakCurriculum(topicId, request) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/curriculum/tweak`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ request }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function regenerateCurriculum(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/curriculum/regenerate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

export async function generateCurriculum(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/curriculum/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

export async function getTestOutQuestions(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/test-out`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function submitTestOut(topicId, lessonId, answers) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/test-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

// Lesson Chat API
export async function getLesson(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok && !body.locked) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function sendChatMessage(topicId, lessonId, content) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

export async function continueLesson(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/continue`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

// Quiz API
export async function startQuiz(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/quiz`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function getQuiz(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/quiz`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function submitQuiz(topicId, lessonId, answers) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function getRemediationState(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/remediate`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function sendRemediateChat(topicId, lessonId, content) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/remediate/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ content }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

export async function startRetest(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/remediate/retest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function deferLesson(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/remediate/defer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}
