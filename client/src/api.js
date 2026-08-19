const API_BASE = 'http://localhost:3200'

async function settingsRequest(path, options) {
  const res = await fetch(`${API_BASE}/api/settings${path}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

export function getLocalDate() {
  return new Date().toLocaleDateString('en-CA')
}

export async function getSettings() {
  return settingsRequest('')
}

export async function getProviderCatalog() {
  return settingsRequest('/catalog')
}

export async function saveSettings({ provider, model, reasoningEffort = 'none' }) {
  return settingsRequest('', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ provider, model, reasoningEffort }),
  })
}

export async function getCodexConnection() {
  return settingsRequest('/codex/connection')
}

export async function startCodexLogin(mode = 'browser') {
  return settingsRequest('/codex/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mode }),
  })
}

export async function getCodexLoginStatus(flowId) {
  return settingsRequest(`/codex/flow/${encodeURIComponent(flowId)}`)
}

export async function submitCodexManualCode(flowId, code) {
  return settingsRequest(`/codex/flow/${encodeURIComponent(flowId)}/code`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  })
}

export async function cancelCodexLogin(flowId) {
  return settingsRequest(`/codex/flow/${encodeURIComponent(flowId)}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export async function disconnectCodex() {
  return settingsRequest('/codex/disconnect', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
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

// Curriculum / Onboarding API
export async function getSetupQuestions(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/setup-questions`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function saveProfile(topicId, { level, timeCommitment, selfReportedLevel, placementAssessmentId } = {}) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/profile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, timeCommitment, selfReportedLevel, placementAssessmentId }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function startPlacementAssessment(topicId, level) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/placement/start`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

export async function submitPlacementAssessment(topicId, assessmentId, answers) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/placement/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assessmentId, answers }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
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

// Advanced continuation API. Generation is intentionally transient until confirm.
async function continuationJson(topicId, path, options = {}) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/${path}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

export async function getContinuationReadiness(topicId) {
  return continuationJson(topicId, 'continuation-readiness')
}

export async function getContinuationOptions(topicId) {
  return continuationJson(topicId, 'continuation-options', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export async function generateContinuation(topicId, { lane, level, timeCommitment }) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/continuations/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ lane, level, timeCommitment }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

export async function tweakContinuation(topicId, { lane, level, timeCommitment, curriculum, request }) {
  return continuationJson(topicId, 'continuations/tweak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lane, level, timeCommitment, curriculum, request }),
  })
}

export async function confirmContinuation(topicId, { lane, level, timeCommitment, curriculum }) {
  return continuationJson(topicId, 'continuations/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ lane, level, timeCommitment, curriculum }),
  })
}

export async function getTestOutQuestions(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/test-out`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function submitTestOut(topicId, lessonId, answers, localDate) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/test-out`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, localDate }),
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

export async function submitQuiz(topicId, lessonId, answers, localDate, attemptId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/quiz/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, localDate, ...(attemptId ? { attemptId } : {}) }),
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

// Exam API
export async function getExam(topicId, moduleId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function startExam(topicId, moduleId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function saveExamProgress(topicId, moduleId, answers) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam/save-progress`, {
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

export async function submitExam(topicId, moduleId, answers, localDate) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, localDate }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function retakeExam(topicId, moduleId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam/retake`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function startPartialRetest(topicId, moduleId, weakLessons) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ weakLessons }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function submitPartialRetest(topicId, moduleId, retestId, answers, localDate) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest/${retestId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, localDate }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

// Artifact API
export async function submitArtifact(topicId, lessonId, content, localDate, evidence) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/artifact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ content, localDate, ...(evidence ? { evidence } : {}) }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function getArtifact(topicId, lessonId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/artifact`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

// Data Export / Import API
export async function exportData() {
  const res = await fetch(`${API_BASE}/api/data/export`)
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res.json()
}

export async function importData(backup) {
  const res = await fetch(`${API_BASE}/api/data/import`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(backup),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

// Streak API
export async function getStreak(today) {
  const url = today ? `${API_BASE}/api/streak?today=${encodeURIComponent(today)}` : `${API_BASE}/api/streak`
  const res = await fetch(url)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function recordStreakEvent(localDate) {
  const res = await fetch(`${API_BASE}/api/streak/record`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ localDate }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

// SRS / Review Queue API
export async function getReviews() {
  const res = await fetch(`${API_BASE}/api/reviews`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function getReviewCount() {
  const res = await fetch(`${API_BASE}/api/reviews/count`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function startReviewSession() {
  const res = await fetch(`${API_BASE}/api/reviews/start`, {
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

export async function submitReview(sessionId, answers, localDate) {
  const res = await fetch(`${API_BASE}/api/reviews/${sessionId}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ answers, localDate }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}

export async function cancelReview(sessionId) {
  const res = await fetch(`${API_BASE}/api/reviews/${sessionId}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return body
}
