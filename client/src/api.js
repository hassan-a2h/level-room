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
