import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import os from 'os'

function tempDbPath() {
  return path.join(os.tmpdir(), `test-course-lineage-${Date.now()}-${Math.random().toString(36).slice(2)}.db`)
}

function seedCourse(db, { title = 'DevOps', moduleCount = 1, lessonsPerModule = 2, status = 'active' } = {}) {
  const topic = db.prepare('INSERT INTO topics (title, status) VALUES (?, ?)').run(title, status)
  const lessonIds = []
  const moduleIds = []
  for (let moduleIndex = 0; moduleIndex < moduleCount; moduleIndex += 1) {
    const module = db.prepare('INSERT INTO modules (topic_id, module_index, title) VALUES (?, ?, ?)').run(topic.lastInsertRowid, moduleIndex, `Module ${moduleIndex + 1}`)
    moduleIds.push(Number(module.lastInsertRowid))
    for (let lessonIndex = 0; lessonIndex < lessonsPerModule; lessonIndex += 1) {
      const lesson = db.prepare('INSERT INTO lessons (module_id, lesson_index, title, outcomes) VALUES (?, ?, ?, ?)').run(
        module.lastInsertRowid,
        lessonIndex,
        `Lesson ${moduleIndex + 1}.${lessonIndex + 1}`,
        JSON.stringify([`Outcome ${moduleIndex + 1}.${lessonIndex + 1}`]),
      )
      lessonIds.push(Number(lesson.lastInsertRowid))
      db.prepare('INSERT INTO progress (topic_id, lesson_id, state, quiz_score) VALUES (?, ?, ?, ?)').run(topic.lastInsertRowid, lesson.lastInsertRowid, 'passed', 80)
    }
  }
  return { topicId: Number(topic.lastInsertRowid), moduleIds, lessonIds }
}

describe('course lineage utilities', () => {
  let dbPath
  let dbModule
  let lineage

  beforeEach(async () => {
    dbPath = tempDbPath()
    process.env.DB_PATH = dbPath
    vi.resetModules()
    dbModule = await import('../db.js')
    dbModule.initSchema()
    lineage = await import('../utils/course-lineage.js')
  })

  afterEach(() => {
    try { dbModule.default.close() } catch {}
    try { fs.unlinkSync(dbPath) } catch {}
    delete process.env.DB_PATH
  })

  it('reports an incomplete course when a module exam is unfinished', () => {
    const seeded = seedCourse(dbModule.default)
    const readiness = lineage.getCourseReadiness(seeded.topicId)

    expect(readiness.eligible).toBe(false)
    expect(readiness.reason).toMatch(/module/i)
  })

  it('reports a completed course only after every module is completed', () => {
    const seeded = seedCourse(dbModule.default, { moduleCount: 2 })
    dbModule.run('UPDATE modules SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE topic_id = ?', 'completed', seeded.topicId)
    const readiness = lineage.getCourseReadiness(seeded.topicId)

    expect(readiness.eligible).toBe(true)
    expect(readiness.course.id).toBe(seeded.topicId)
  })

  it('builds a bounded deterministic completion summary', () => {
    const seeded = seedCourse(dbModule.default)
    dbModule.run('UPDATE modules SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE topic_id = ?', 'completed', seeded.topicId)
    const summary = lineage.buildCourseSummary(seeded.topicId)

    expect(summary).toMatchObject({ topicId: seeded.topicId, title: 'DevOps' })
    expect(summary.outcomes).toContain('Outcome 1.1')
    expect(JSON.stringify(summary).length).toBeLessThan(12000)
  })

  it('completes an eligible course atomically and records completion metadata', () => {
    const seeded = seedCourse(dbModule.default)
    dbModule.run('UPDATE modules SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE topic_id = ?', 'completed', seeded.topicId)
    const completed = lineage.completeCourseIfEligible(seeded.topicId)
    const topic = dbModule.get('SELECT status, course_completed_at, course_summary FROM topics WHERE id = ?', seeded.topicId)

    expect(completed).toBe(true)
    expect(topic.status).toBe('completed')
    expect(topic.course_completed_at).toBeTruthy()
    expect(JSON.parse(topic.course_summary).topicId).toBe(seeded.topicId)
  })

  it('builds ancestry and rejects duplicate normalized lanes for linked children', () => {
    const parent = seedCourse(dbModule.default, { title: 'DevOps' })
    dbModule.run('UPDATE modules SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE topic_id = ?', 'completed', parent.topicId)
    lineage.completeCourseIfEligible(parent.topicId)
    const child = seedCourse(dbModule.default, { title: 'Cloud Security' })
    dbModule.run('UPDATE topics SET course_kind = ?, course_stage = ?, course_focus = ? WHERE id = ?', 'advanced', 1, 'Cloud Security', child.topicId)
    dbModule.run('INSERT INTO course_links (child_topic_id, parent_topic_id, lane, normalized_lane) VALUES (?, ?, ?, ?)', child.topicId, parent.topicId, 'Cloud Security', 'cloud security')

    expect(lineage.getLineage(child.topicId).map((entry) => entry.id)).toEqual([parent.topicId, child.topicId])
    expect(() => dbModule.run('INSERT INTO course_links (child_topic_id, parent_topic_id, lane, normalized_lane) VALUES (?, ?, ?, ?)', child.topicId + 1, parent.topicId, 'CLOUD   SECURITY', 'cloud security')).toThrow(/UNIQUE/i)
  })

  it('rejects a link to a missing parent and self-links at the database boundary', () => {
    const child = seedCourse(dbModule.default)
    expect(() => dbModule.run('INSERT INTO course_links (child_topic_id, parent_topic_id, lane, normalized_lane) VALUES (?, ?, ?, ?)', child.topicId, 99999, 'Lane', 'lane')).toThrow(/FOREIGN KEY/i)
    expect(() => dbModule.run('INSERT INTO course_links (child_topic_id, parent_topic_id, lane, normalized_lane) VALUES (?, ?, ?, ?)', child.topicId, child.topicId, 'Self', 'self')).toThrow(/CHECK/i)
  })

  it('creates a linked advanced course with its curriculum and next stage atomically', () => {
    const parent = seedCourse(dbModule.default, { title: 'DevOps' })
    dbModule.run('UPDATE modules SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE topic_id = ?', 'completed', parent.topicId)
    lineage.completeCourseIfEligible(parent.topicId)

    const created = lineage.createLinkedCourse(parent.topicId, {
      lane: 'Cloud Security',
      curriculum: {
        modules: [{
          title: 'Identity foundations',
          lessons: [{ title: 'Least privilege', outcomes: ['Apply least privilege'], prerequisites: [] }],
        }],
      },
    })
    const child = dbModule.get('SELECT course_kind, course_stage, course_focus, status FROM topics WHERE id = ?', created.topic.id)
    const link = dbModule.get('SELECT parent_topic_id, normalized_lane FROM course_links WHERE child_topic_id = ?', created.topic.id)
    const progress = dbModule.get('SELECT state FROM progress WHERE topic_id = ? AND lesson_id = ?', created.topic.id, created.firstLessonId)

    expect(child).toMatchObject({ course_kind: 'advanced', course_stage: 1, course_focus: 'Cloud Security', status: 'active' })
    expect(link).toMatchObject({ parent_topic_id: parent.topicId, normalized_lane: 'cloud security' })
    expect(progress.state).toBe('not_started')
  })

  it('rejects duplicate lanes and active-topic capacity without partial child rows', () => {
    const parent = seedCourse(dbModule.default, { title: 'DevOps' })
    dbModule.run('UPDATE modules SET status = ?, completed_at = CURRENT_TIMESTAMP WHERE topic_id = ?', 'completed', parent.topicId)
    lineage.completeCourseIfEligible(parent.topicId)
    const curriculum = { modules: [{ title: 'Basics', lessons: [{ title: 'One', outcomes: [], prerequisites: [] }] }] }
    lineage.createLinkedCourse(parent.topicId, { lane: 'Cloud Security', curriculum })

    expect(() => lineage.createLinkedCourse(parent.topicId, { lane: ' CLOUD   SECURITY ', curriculum })).toThrow(/already exists/i)
    expect(dbModule.get('SELECT COUNT(*) AS count FROM topics WHERE course_kind = ?', 'advanced').count).toBe(1)

    dbModule.run("INSERT INTO topics (title, status) VALUES (?, 'active')", 'Existing 1')
    dbModule.run("INSERT INTO topics (title, status) VALUES (?, 'active')", 'Existing 2')
    expect(() => lineage.createLinkedCourse(parent.topicId, { lane: 'Networking', curriculum })).toThrow(/active course limit/i)
    expect(dbModule.get('SELECT COUNT(*) AS count FROM course_links WHERE parent_topic_id = ?', parent.topicId).count).toBe(1)
  })
})
