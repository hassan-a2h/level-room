const API_BASE = 'http://localhost:3200'

async function structuredRequest(url, options) {
  const res = options === undefined ? await fetch(url) : await fetch(url, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    const error = new Error(body.error || `HTTP ${res.status}`)
    error.code = body.code
    error.retryable = body.retryable
    error.latestState = body.latestState
    error.status = res.status
    error.body = body
    throw error
  }
  return body
}

async function settingsRequest(path, options) {
  const res = await fetch(`${API_BASE}/api/settings${path}`, options)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

export function getLocalDate() {
  return new Date().toLocaleDateString('en-CA')
}

export function getLocalTimeZone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'
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

export async function getDashboard(topicId, localDate = getLocalDate(), timeZone = getLocalTimeZone()) {
  const query = new URLSearchParams({ localDate, timeZone })
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/dashboard?${query}`)
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

export async function getCurriculumRecovery(topicId, { signal } = {}) {
  const url = `${API_BASE}/api/topics/${topicId}/curriculum/recovery`
  const res = signal ? await fetch(url, { signal }) : await fetch(url)
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
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

export async function generateCurriculum(topicId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/curriculum/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`)
  return body
}

function abortError() {
  const error = new Error('Roadmap generation wait was cancelled.')
  error.name = 'AbortError'
  return error
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw abortError()
}

function waitForPoll(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) {
      reject(abortError())
      return
    }
    let timer
    const onAbort = () => {
      clearTimeout(timer)
      signal?.removeEventListener('abort', onAbort)
      reject(abortError())
    }
    timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort)
      resolve()
    }, ms)
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

async function recoverGeneration(topicId, generation, onStatus, signal) {
  while (true) {
    throwIfAborted(signal)
    const recovery = await getCurriculumRecovery(topicId, { signal })
    throwIfAborted(signal)
    const status = recovery.generation || generation
    onStatus?.(status)
    if (recovery.curriculumState === 'draft_ready' && recovery.curriculum) return recovery.curriculum
    if (status?.state === 'failed' || recovery.curriculumState === 'failed') {
      throw new Error(status?.error || recovery.curriculumError || 'Roadmap generation failed.')
    }
    await waitForPoll(1500, signal)
  }
}

export async function waitForCurriculumGeneration(topicId, generation, onStatus, { signal } = {}) {
  if (!generation?.id) throw new Error('Roadmap generation did not return a job ID.')
  throwIfAborted(signal)
  if (typeof EventSource === 'undefined') return recoverGeneration(topicId, generation, onStatus, signal)

  return new Promise((resolve, reject) => {
    const eventsUrl = `${API_BASE}/api/topics/${topicId}/curriculum/generation/${encodeURIComponent(generation.id)}/events`
    const source = new EventSource(eventsUrl)
    let settled = false
    let polling = false
    let abortHandler
    const finish = (callback, value) => {
      if (settled) return
      settled = true
      source.close()
      signal?.removeEventListener('abort', abortHandler)
      callback(value)
    }
    abortHandler = () => finish(reject, abortError())
    signal?.addEventListener('abort', abortHandler, { once: true })
    source.addEventListener('generation', (event) => {
      let status
      try { status = JSON.parse(event.data) } catch { return finish(reject, new Error('Generation status was malformed.')) }
      onStatus?.(status)
      if (status.state === 'completed') {
        recoverGeneration(topicId, status, onStatus, signal).then(
          (curriculum) => finish(resolve, curriculum),
          (error) => finish(reject, error),
        )
      } else if (status.state === 'failed') {
        finish(reject, new Error(status.error || 'Roadmap generation failed.'))
      }
    })
    source.onerror = () => {
      if (settled || polling) return
      polling = true
      source.close()
      recoverGeneration(topicId, generation, onStatus, signal).then(
        (curriculum) => finish(resolve, curriculum),
        (error) => finish(reject, error),
      )
    }
  })
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

export async function generateContinuation(topicId, { level, timeCommitment }) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/continuations/generate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ level, timeCommitment }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    throw new Error(body.error || `HTTP ${res.status}`)
  }
  return res
}

export async function tweakContinuation(topicId, { level, timeCommitment, curriculum, request }) {
  return continuationJson(topicId, 'continuations/tweak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, timeCommitment, curriculum, request }),
  })
}

export async function confirmContinuation(topicId, { level, timeCommitment, curriculum }) {
  return continuationJson(topicId, 'continuations/confirm', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ level, timeCommitment, curriculum }),
  })
}

// Lesson Chat API
export async function getLesson(topicId, lessonId) {
  const url = `${API_BASE}/api/topics/${topicId}/lessons/${lessonId}`
  try {
    return await structuredRequest(url)
  } catch (error) {
    if (error.status === 403 && error.body?.locked) return error.body
    throw error
  }
}

export async function ensureActivities(topicId, lessonId) {
  return structuredRequest(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/activities`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })
}

export async function completeActivityBlock(topicId, lessonId, blockId, body) {
  return structuredRequest(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/activities/${encodeURIComponent(blockId)}/complete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function submitActivityBlock(topicId, lessonId, blockId, body) {
  return structuredRequest(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/activities/${encodeURIComponent(blockId)}/submit`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
}

export async function sendChatMessage(topicId, lessonId, content, activityBlockId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/lessons/${lessonId}/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
    body: JSON.stringify({ content, ...(activityBlockId ? { activityBlockId } : {}) }),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    const error = new Error(body.error || `HTTP ${res.status}`)
    error.code = body.code
    error.retryable = body.retryable
    error.latestState = body.latestState
    error.status = res.status
    throw error
  }
  return res
}

// Exam API
export async function getExam(topicId, moduleId) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam`)
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), body)
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
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), body)
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
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), body)
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
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), body)
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
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), body)
  }
  return body
}

export async function startPartialRetest(topicId, moduleId, failedOutcomeIds) {
  const res = await fetch(`${API_BASE}/api/topics/${topicId}/modules/${moduleId}/exam/partial-retest`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ failedOutcomeIds }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) {
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), body)
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
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), body)
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
    throw Object.assign(new Error(body.error || `HTTP ${res.status}`), body, { status: res.status })
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
