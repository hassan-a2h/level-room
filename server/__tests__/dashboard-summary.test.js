import { describe, expect, it } from 'vitest'
import { deriveNextAction, deriveWeeklyRhythm } from '../utils/dashboard-summary.js'

const topic = { id: 7, title: 'SQL', status: 'active' }
const openChapter = { id: 11, title: 'Joins', status: 'active', examReady: false, lessonsRemaining: 1 }
const availableSession = { id: 21, title: 'Choose a join', state: 'not_started', locked: false, estimated_time: 12, moduleId: 11, moduleTitle: 'Joins' }

describe('dashboard summary', () => {
  it('routes an empty Track to setup', () => {
    expect(deriveNextAction({ topic, modules: [] })).toMatchObject({ kind: 'setup_track', topicId: 7 })
  })

  it('resumes a structured Session before any review or new work', () => {
    expect(deriveNextAction({
      topic,
      modules: [openChapter],
      sessions: [{ ...availableSession, state: 'practicing', currentActivity: 'Pick the join' }],
      overdueReviews: 4,
    })).toMatchObject({ kind: 'resume_session', lessonId: 21, currentActivity: 'Pick the join' })
  })

  it('resumes an in-progress checkpoint before overdue reviews', () => {
    expect(deriveNextAction({
      topic,
      modules: [openChapter],
      checkpoints: [{ moduleId: 11, moduleTitle: 'Joins', status: 'pending' }],
      overdueReviews: 2,
    })).toMatchObject({ kind: 'resume_checkpoint', moduleId: 11 })
  })

  it('starts an overdue review before a new Session when nothing is active', () => {
    expect(deriveNextAction({ topic, modules: [openChapter], sessions: [availableSession], overdueReviews: 1 }))
      .toMatchObject({ kind: 'start_review', overdueReviews: 1 })
  })

  it('starts the earliest unlocked Session in the first incomplete Chapter', () => {
    expect(deriveNextAction({
      topic,
      modules: [openChapter, { ...openChapter, id: 12, title: 'Indexes' }],
      sessions: [
        { id: 22, title: 'Later session', state: 'not_started', locked: false, moduleId: 12, moduleTitle: 'Indexes' },
        { ...availableSession, locked: true },
        availableSession,
      ],
    })).toMatchObject({ kind: 'start_session', lessonId: 21, chapterTitle: 'Joins' })
  })

  it('starts a ready checkpoint after that Chapter has no remaining unlocked Session', () => {
    expect(deriveNextAction({
      topic,
      modules: [{ ...openChapter, examReady: true, lessonsRemaining: 0 }],
      sessions: [{ ...availableSession, state: 'passed' }],
    })).toMatchObject({ kind: 'start_checkpoint', moduleId: 11 })
  })

  it('offers continuation only after every Chapter is complete on a completed Track', () => {
    expect(deriveNextAction({
      topic: { ...topic, status: 'completed' },
      modules: [{ ...openChapter, status: 'completed', examReady: false }],
      sessions: [{ ...availableSession, state: 'passed' }],
    })).toMatchObject({ kind: 'track_complete', topicId: 7 })
  })

  it('fails closed when an incomplete Track has no valid unlocked action', () => {
    expect(deriveNextAction({
      topic,
      modules: [{ ...openChapter, examReady: false }],
      sessions: [{ ...availableSession, locked: true }],
    })).toMatchObject({ kind: 'unavailable' })
  })

  it('returns seven local-calendar days and counts each active day once across event types', () => {
    const rhythm = deriveWeeklyRhythm({
      localDate: '2026-09-26',
      timeZone: 'Asia/Karachi',
      sessions: [
        { started_at: '2026-09-19T20:30:00.000Z', completed_at: '2026-09-19T21:00:00.000Z' },
        { started_at: '2026-09-20T18:00:00.000Z', completed_at: '2026-09-20T18:20:00.000Z' },
      ],
      checkpoints: [{ completed_at: '2026-09-21T12:00:00.000Z' }],
      reviews: [{ last_reviewed: '2026-09-22T10:00:00.000Z' }],
    })

    expect(rhythm.days).toHaveLength(7)
    expect(rhythm.days.map((day) => day.date)).toEqual([
      '2026-09-20', '2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25', '2026-09-26',
    ])
    expect(rhythm.days.filter((day) => day.active)).toHaveLength(3)
    expect(rhythm.activeDays).toBe(3)
    expect(rhythm.days[0]).toMatchObject({ active: true, sessions: 1 })
    expect(rhythm.days[1]).toMatchObject({ active: true, checkpoints: 1 })
    expect(rhythm.days[2]).toMatchObject({ active: true, reviews: 1 })
  })

  it('ignores malformed dates and timestamps instead of inflating activity', () => {
    const rhythm = deriveWeeklyRhythm({
      localDate: '2026-09-26',
      sessions: [{ started_at: 'not-a-date' }],
      checkpoints: [{ completed_at: '2099-01-01T00:00:00Z' }],
      reviews: [],
    })
    expect(rhythm.activeDays).toBe(0)
    expect(rhythm.days.every((day) => !day.active)).toBe(true)
  })
})
