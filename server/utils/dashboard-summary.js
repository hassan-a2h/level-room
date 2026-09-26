const SESSION_STATES = new Set(['not_started', 'practicing', 'passed'])

function validCalendarDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const [year, month, day] = value.split('-').map(Number)
  const parsed = new Date(Date.UTC(year, month - 1, day))
  return parsed.getUTCFullYear() === year && parsed.getUTCMonth() === month - 1 && parsed.getUTCDate() === day
}

function recordDate(value, timeZone) {
  if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) return null
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value))
  } catch {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: 'UTC',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(new Date(value))
  }
}

function action(kind, topic, fields = {}) {
  return {
    kind,
    topicId: topic?.id ?? null,
    topicTitle: topic?.title ?? '',
    ...fields,
  }
}

export function deriveNextAction({ topic = {}, modules = [], sessions = [], checkpoints = [], overdueReviews = 0 } = {}) {
  const topicId = Number.isSafeInteger(topic.id) ? topic.id : null
  if (modules.length === 0) return action('setup_track', topic, { topicId, title: 'Finish setting up your Track' })

  const activeSession = sessions.find((session) => session.state === 'practicing' && !session.locked)
  if (activeSession) {
    return action('resume_session', topic, {
      topicId,
      lessonId: activeSession.id,
      moduleId: activeSession.moduleId,
      chapterTitle: activeSession.moduleTitle || '',
      sessionTitle: activeSession.title || '',
      currentActivity: activeSession.currentActivity || '',
      estimatedMinutes: Number.isInteger(activeSession.estimated_time) ? activeSession.estimated_time : null,
    })
  }

  const activeCheckpoint = checkpoints.find((checkpoint) => checkpoint.status === 'pending')
  if (activeCheckpoint) {
    return action('resume_checkpoint', topic, {
      topicId,
      moduleId: activeCheckpoint.moduleId,
      chapterTitle: activeCheckpoint.moduleTitle || '',
    })
  }

  const overdue = Number.isFinite(overdueReviews) ? Math.max(0, Math.floor(overdueReviews)) : 0
  if (overdue > 0) return action('start_review', topic, { overdueReviews: overdue })

  const earliestIncomplete = modules.find((module) => module.status !== 'completed')
  if (earliestIncomplete) {
    const session = sessions.find((item) => item.moduleId === earliestIncomplete.id
      && !item.locked
      && SESSION_STATES.has(item.state)
      && item.state !== 'passed')
    if (session) {
      return action('start_session', topic, {
        topicId,
        lessonId: session.id,
        moduleId: session.moduleId,
        chapterTitle: session.moduleTitle || earliestIncomplete.title || '',
        sessionTitle: session.title || '',
        estimatedMinutes: Number.isInteger(session.estimated_time) ? session.estimated_time : null,
      })
    }

    if (earliestIncomplete.examReady) {
      return action('start_checkpoint', topic, {
        topicId,
        moduleId: earliestIncomplete.id,
        chapterTitle: earliestIncomplete.title || '',
      })
    }
  }

  if (topic.status === 'completed' && modules.every((module) => module.status === 'completed')) {
    return action('track_complete', topic, { title: 'Review your Track and plan what comes next' })
  }

  return action('unavailable', topic, { title: 'This Trail needs attention' })
}

export function deriveWeeklyRhythm({ localDate, timeZone = 'UTC', sessions = [], checkpoints = [], reviews = [] } = {}) {
  const today = validCalendarDate(localDate) ? localDate : new Date().toISOString().slice(0, 10)
  let parsedTimeZone = timeZone
  try { new Intl.DateTimeFormat('en-US', { timeZone: parsedTimeZone }) } catch { parsedTimeZone = 'UTC' }

  const buckets = new Map()
  const todayDate = new Date(`${today}T00:00:00.000Z`)
  for (let offset = 6; offset >= 0; offset -= 1) {
    const date = new Date(todayDate)
    date.setUTCDate(date.getUTCDate() - offset)
    const key = date.toISOString().slice(0, 10)
    buckets.set(key, { date: key, sessions: new Set(), checkpoints: new Set(), reviews: new Set() })
  }

  const add = (kind, key, values) => {
    for (const value of values) {
      const date = recordDate(value, parsedTimeZone)
      if (date && buckets.has(date)) buckets.get(date)[kind].add(key)
    }
  }

  sessions.forEach((session, index) => {
    const key = session.id ?? `session-${index}`
    add('sessions', key, [session.started_at, session.completed_at])
  })
  checkpoints.forEach((checkpoint, index) => {
    const key = checkpoint.module_id ?? checkpoint.moduleId ?? checkpoint.id ?? `checkpoint-${index}`
    add('checkpoints', key, [checkpoint.completed_at, checkpoint.created_at])
  })
  reviews.forEach((review, index) => {
    const key = review.id ?? `review-${index}`
    add('reviews', key, [review.last_reviewed])
  })

  const days = [...buckets.values()].map((bucket) => {
    const date = new Date(`${bucket.date}T12:00:00.000Z`)
    return {
      date: bucket.date,
      label: new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: 'UTC' }).format(date),
      active: bucket.sessions.size + bucket.checkpoints.size + bucket.reviews.size > 0,
      sessions: Number(bucket.sessions.size > 0),
      checkpoints: Number(bucket.checkpoints.size > 0),
      reviews: Number(bucket.reviews.size > 0),
    }
  })
  return { days, activeDays: days.filter((day) => day.active).length }
}
