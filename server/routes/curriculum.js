import { Router } from 'express'
import { get, run, all, transaction } from '../db.js'
import { streamText, generateText, streamToSSE, LlmClientError } from '../llm/client.js'

const router = Router()

const VALID_LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const VALID_TIME_COMMITMENTS = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day']

/**
 * Get the configured LLM settings row.
 */
function getSettingsRow() {
  return get('SELECT * FROM llm_settings LIMIT 1')
}

/**
 * Generate setup questions for a topic via LLM.
 */
async function generateSetupQuestions(topicTitle) {
  const settings = getSettingsRow()
  if (!settings || !settings.api_key) {
    throw new LlmClientError('No LLM settings configured.', { code: 'MISSING_SETTINGS' })
  }

  const system = `You are a curriculum designer. Given a learning topic, generate exactly 2 concise setup questions to profile the learner.
Respond in strict JSON with this shape:
{
  "questions": [
    { "text": "...", "options": ["...", "..."] },
    { "text": "...", "options": ["...", "..."] }
  ]
}
The first question should assess current experience level. The second should assess time commitment.
Keep each option to 1-4 words. Do not include markdown formatting.`

  const result = await generateText({
    provider: settings.provider,
    apiKey: settings.api_key,
    model: settings.model,
    system,
    messages: [{ role: 'user', content: `Topic: ${topicTitle}` }],
  })

  const parsed = JSON.parse(result.text)
  if (!Array.isArray(parsed.questions) || parsed.questions.length === 0) {
    throw new Error('Invalid setup questions format')
  }
  // Limit to at most 2 questions
  parsed.questions = parsed.questions.slice(0, 2)
  return parsed
}

/**
 * Generate a full curriculum for a topic via LLM.
 */
async function generateCurriculum(topicTitle, level, timeCommitment) {
  const settings = getSettingsRow()
  if (!settings || !settings.api_key) {
    throw new LlmClientError('No LLM settings configured.', { code: 'MISSING_SETTINGS' })
  }

  const system = `You are an expert curriculum designer. Generate an adaptive learning curriculum.
Respond as a stream of JSON text representing a single object with this exact structure:
{
  "modules": [
    {
      "title": "Module Name",
      "lessons": [
        {
          "title": "Lesson Name",
          "depth": "Beginner|Intermediate|Advanced",
          "estimated_time": 15,
          "outcomes": ["By the end of this lesson, the learner can..."],
          "prerequisites": ["Lesson Name"]
        }
      ]
    }
  ]
}
Rules:
- 3-8 modules total.
- Each module has 3-7 lessons.
- Every lesson must have depth, estimated_time (minutes), outcomes (1-3 strings), and prerequisites (names of other lessons in the curriculum; empty for foundation lessons).
- Prerequisites must reference lesson titles that exist in the curriculum.
- No circular prerequisites. No lesson may list itself as a prerequisite.
- The curriculum must form a valid DAG.
- Depth should adapt to the learner's stated level: ${level}.
- Total lesson time per module should respect time commitment: ${timeCommitment}.
- Do not include markdown code fences. Output plain JSON only.`

  const userContent = `Topic: ${topicTitle}\nLearner level: ${level}\nTime commitment: ${timeCommitment}\nGenerate the curriculum now.`

  return streamText({
    provider: settings.provider,
    apiKey: settings.api_key,
    model: settings.model,
    system,
    messages: [{ role: 'user', content: userContent }],
  })
}

/**
 * Parse streamed JSON chunks into a curriculum object.
 * We accumulate the raw text and try JSON.parse when we see a complete object.
 */
async function parseStreamedCurriculum(textStream) {
  let buffer = ''
  for await (const chunk of textStream) {
    buffer += chunk
  }
  // Clean up any markdown fences
  buffer = buffer.replace(/```json/g, '').replace(/```/g, '').trim()
  const parsed = JSON.parse(buffer)
  return parsed
}

/**
 * Validate a curriculum structure.
 * Returns { valid: true } or { valid: false, error: string }.
 */
function validateCurriculum(curriculum) {
  if (!curriculum || typeof curriculum !== 'object') {
    return { valid: false, error: 'Curriculum must be an object.' }
  }
  if (!Array.isArray(curriculum.modules)) {
    return { valid: false, error: 'Curriculum must have a modules array.' }
  }
  if (curriculum.modules.length === 0) {
    return { valid: false, error: 'Curriculum must have at least one module.' }
  }

  const lessonTitles = new Set()
  const lessonMap = new Map() // title -> { moduleIndex, lessonIndex }

  for (let mi = 0; mi < curriculum.modules.length; mi++) {
    const mod = curriculum.modules[mi]
    if (!mod.title || typeof mod.title !== 'string') {
      return { valid: false, error: `Module ${mi} is missing a title.` }
    }
    if (!Array.isArray(mod.lessons) || mod.lessons.length === 0) {
      return { valid: false, error: `Module "${mod.title}" has no lessons.` }
    }
    for (let li = 0; li < mod.lessons.length; li++) {
      const lesson = mod.lessons[li]
      if (!lesson.title || typeof lesson.title !== 'string') {
        return { valid: false, error: `Lesson ${li} in module "${mod.title}" is missing a title.` }
      }
      if (!lesson.depth || typeof lesson.depth !== 'string') {
        return { valid: false, error: `Lesson "${lesson.title}" is missing depth.` }
      }
      if (typeof lesson.estimated_time !== 'number' || lesson.estimated_time <= 0) {
        return { valid: false, error: `Lesson "${lesson.title}" has invalid estimated_time.` }
      }
      if (!Array.isArray(lesson.outcomes) || lesson.outcomes.length === 0) {
        return { valid: false, error: `Lesson "${lesson.title}" is missing outcomes.` }
      }
      if (!Array.isArray(lesson.prerequisites)) {
        return { valid: false, error: `Lesson "${lesson.title}" prerequisites must be an array.` }
      }
      if (lessonTitles.has(lesson.title)) {
        return { valid: false, error: `Duplicate lesson title: "${lesson.title}".` }
      }
      lessonTitles.add(lesson.title)
      lessonMap.set(lesson.title, { moduleIndex: mi, lessonIndex: li, lesson })
    }
  }

  // Validate prerequisites exist and no cycles
  const adjacency = new Map() // title -> Set(prereq titles)
  for (const [title, { lesson }] of lessonMap) {
    adjacency.set(title, new Set(lesson.prerequisites || []))
    for (const prereq of lesson.prerequisites || []) {
      if (!lessonTitles.has(prereq)) {
        return { valid: false, error: `Lesson "${title}" has unknown prerequisite: "${prereq}".` }
      }
      if (prereq === title) {
        return { valid: false, error: `Lesson "${title}" lists itself as a prerequisite.` }
      }
    }
  }

  // Cycle detection (DFS)
  const visiting = new Set()
  const visited = new Set()
  function dfs(node) {
    if (visiting.has(node)) return false
    if (visited.has(node)) return true
    visiting.add(node)
    for (const prereq of adjacency.get(node) || []) {
      if (!dfs(prereq)) return false
    }
    visiting.delete(node)
    visited.add(node)
    return true
  }
  for (const title of lessonTitles) {
    if (!dfs(title)) {
      return { valid: false, error: `Circular prerequisite detected involving "${title}".` }
    }
  }

  return { valid: true }
}

/**
 * Persist a validated curriculum to SQLite for a topic.
 * Replaces any existing modules/lessons for the topic.
 */
function persistCurriculum(topicId, curriculum) {
  const tx = transaction((cur) => {
    // Delete existing modules (cascades to lessons via FK)
    run('DELETE FROM modules WHERE topic_id = ?', topicId)

    const lessonIdMap = new Map() // title -> lesson_db_id

    for (let mi = 0; mi < cur.modules.length; mi++) {
      const mod = cur.modules[mi]
      const modResult = run(
        'INSERT INTO modules (topic_id, module_index, title, summary, skill_outcomes) VALUES (?, ?, ?, ?, ?)',
        topicId,
        mi,
        mod.title,
        mod.summary || '',
        mod.skill_outcomes || ''
      )
      const moduleId = modResult.lastInsertRowid

      for (let li = 0; li < mod.lessons.length; li++) {
        const lesson = mod.lessons[li]
        const lessonResult = run(
          'INSERT INTO lessons (module_id, lesson_index, title, depth, estimated_time, outcomes, prerequisites, artifact_required, artifact_type, artifact_rubric) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
          moduleId,
          li,
          lesson.title,
          lesson.depth,
          lesson.estimated_time,
          JSON.stringify(lesson.outcomes),
          JSON.stringify(lesson.prerequisites || []),
          lesson.artifact_required ? 1 : 0,
          lesson.artifact_type || '',
          lesson.artifact_rubric || ''
        )
        lessonIdMap.set(lesson.title, lessonResult.lastInsertRowid)
      }
    }

    // Update prerequisites from lesson titles to lesson IDs
    for (let mi = 0; mi < cur.modules.length; mi++) {
      const mod = cur.modules[mi]
      const dbModules = all('SELECT id FROM modules WHERE topic_id = ? ORDER BY module_index', topicId)
      const dbModuleId = dbModules[mi].id
      const dbLessons = all('SELECT id, title FROM lessons WHERE module_id = ? ORDER BY lesson_index', dbModuleId)

      for (let li = 0; li < mod.lessons.length; li++) {
        const lesson = mod.lessons[li]
        const prereqIds = (lesson.prerequisites || []).map((prTitle) => {
          const pid = lessonIdMap.get(prTitle)
          return pid || null
        }).filter(Boolean)

        run(
          'UPDATE lessons SET prerequisites = ? WHERE id = ?',
          JSON.stringify(prereqIds.map((id) => ({ lessonId: id, title: '' }))),
          dbLessons[li].id
        )
      }
    }

    // Create progress rows for all lessons as not_started
    const allLessons = all(
      `SELECT l.id FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE m.topic_id = ?`,
      topicId
    )
    for (const lesson of allLessons) {
      const existing = get('SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lesson.id)
      if (!existing) {
        run(
          'INSERT INTO progress (topic_id, lesson_id, state) VALUES (?, ?, ?)',
          topicId,
          lesson.id,
          'not_started'
        )
      }
    }
  })

  tx(curriculum)
}

/**
 * POST /api/topics/:id/profile
 * Save learner profile (level + time commitment).
 */
router.post('/topics/:id/profile', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const { level, timeCommitment } = req.body

    const topic = get('SELECT id FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    if (!level || !VALID_LEVELS.includes(level)) {
      return res.status(400).json({ error: `Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}.` })
    }
    if (!timeCommitment || typeof timeCommitment !== 'string' || timeCommitment.trim().length === 0) {
      return res.status(400).json({ error: 'Time commitment is required.' })
    }

    run(
      'UPDATE topics SET level = ?, time_per_week = ? WHERE id = ?',
      level,
      timeCommitment.trim(),
      topicId
    )

    return res.json({ ok: true, level, timeCommitment: timeCommitment.trim() })
  } catch (err) {
    console.error('POST /api/topics/:id/profile error:', err.message)
    return res.status(500).json({ error: 'Failed to save profile.' })
  }
})

/**
 * GET /api/topics/:id/setup-questions
 * Generate setup questions for a topic.
 */
router.get('/topics/:id/setup-questions', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const settings = getSettingsRow()
    if (!settings || !settings.api_key) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    const questions = await generateSetupQuestions(topic.title)
    return res.json(questions)
  } catch (err) {
    console.error('GET /api/topics/:id/setup-questions error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate setup questions.' })
  }
})

/**
 * POST /api/topics/:id/curriculum/generate
 * Stream curriculum generation via SSE.
 */
router.post('/topics/:id/curriculum/generate', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT title, level, time_per_week FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    if (!topic.level || !topic.time_per_week) {
      return res.status(400).json({ error: 'Learner profile not set. Please answer setup questions first.' })
    }

    const settings = getSettingsRow()
    if (!settings || !settings.api_key) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    const streamResult = await generateCurriculum(topic.title, topic.level, topic.time_per_week)
    await streamToSSE(streamResult, res)
  } catch (err) {
    console.error('POST /api/topics/:id/curriculum/generate error:', err.message)
    if (!res.headersSent) {
      if (err instanceof LlmClientError) {
        return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      return res.status(500).json({ error: 'Failed to generate curriculum.' })
    }
    // If headers already sent (SSE started), we can't send JSON error
    res.write(`event: error\n`)
    res.write(`data: ${JSON.stringify({ message: err.message })}\n\n`)
    res.end()
  }
})

/**
 * POST /api/topics/:id/curriculum/confirm
 * Persist the curriculum and unlock first lesson.
 */
router.post('/topics/:id/curriculum/confirm', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT id FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const { curriculum } = req.body
    if (!curriculum || typeof curriculum !== 'object') {
      return res.status(400).json({ error: 'Curriculum object is required.' })
    }

    const validation = validateCurriculum(curriculum)
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    persistCurriculum(topicId, curriculum)

    // Unlock the first lesson (foundation lessons with no prerequisites)
    const firstLessons = all(
      `SELECT l.id FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE m.topic_id = ? AND (l.prerequisites = '[]' OR l.prerequisites = '')
       ORDER BY m.module_index, l.lesson_index`,
      topicId
    )

    // The first foundation lesson stays not_started but is "available"
    // We don't need to change state; not_started with no prerequisites means available
    const firstLessonId = firstLessons[0]?.id || null

    return res.json({ ok: true, firstLessonId })
  } catch (err) {
    console.error('POST /api/topics/:id/curriculum/confirm error:', err.message)
    return res.status(500).json({ error: 'Failed to confirm curriculum.' })
  }
})

/**
 * GET /api/topics/:id/curriculum
 * Get the current curriculum for a topic.
 */
router.get('/topics/:id/curriculum', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const modules = all('SELECT * FROM modules WHERE topic_id = ? ORDER BY module_index', topicId)
    if (modules.length === 0) {
      return res.status(404).json({ error: 'No curriculum found for this topic.' })
    }

    const modulesWithLessons = modules.map((mod) => {
      const lessons = all(
        `SELECT l.id, l.lesson_index, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites, l.artifact_required
         FROM lessons l
         WHERE l.module_id = ?
         ORDER BY l.lesson_index`,
        mod.id
      )

      const lessonsWithProgress = lessons.map((lesson) => {
        const prog = get(
          'SELECT state, quiz_score, quiz_attempts FROM progress WHERE topic_id = ? AND lesson_id = ?',
          topicId, lesson.id
        )
        let prerequisites = []
        try {
          prerequisites = lesson.prerequisites ? JSON.parse(lesson.prerequisites) : []
        } catch {
          prerequisites = []
        }
        let outcomes = []
        try {
          outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
        } catch {
          outcomes = []
        }

        return {
          id: lesson.id,
          title: lesson.title,
          depth: lesson.depth,
          estimated_time: lesson.estimated_time,
          outcomes,
          prerequisites,
          artifact_required: !!lesson.artifact_required,
          state: prog?.state || 'not_started',
          quiz_score: prog?.quiz_score ?? null,
          quiz_attempts: prog?.quiz_attempts ?? 0,
        }
      })

      return {
        id: mod.id,
        title: mod.title,
        summary: mod.summary,
        skill_outcomes: mod.skill_outcomes,
        lessons: lessonsWithProgress,
      }
    })

    return res.json({ topicId, modules: modulesWithLessons })
  } catch (err) {
    console.error('GET /api/topics/:id/curriculum error:', err.message)
    return res.status(500).json({ error: 'Failed to load curriculum.' })
  }
})

/**
 * POST /api/topics/:id/curriculum/tweak
 * Apply a natural-language tweak to the curriculum.
 */
router.post('/topics/:id/curriculum/tweak', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const { request: tweakRequest } = req.body

    const topic = get('SELECT id, title, level, time_per_week FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    if (!tweakRequest || typeof tweakRequest !== 'string' || tweakRequest.trim().length === 0) {
      return res.status(400).json({ error: 'Tweak request is required.' })
    }

    const settings = getSettingsRow()
    if (!settings || !settings.api_key) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    // Get existing curriculum as context
    const existingModules = all('SELECT * FROM modules WHERE topic_id = ? ORDER BY module_index', topicId)
    const existingLessons = []
    for (const mod of existingModules) {
      const lessons = all('SELECT title, depth, estimated_time, outcomes, prerequisites FROM lessons WHERE module_id = ? ORDER BY lesson_index', mod.id)
      existingLessons.push(...lessons.map((l) => ({
        moduleTitle: mod.title,
        ...l,
        outcomes: JSON.parse(l.outcomes || '[]'),
        prerequisites: JSON.parse(l.prerequisites || '[]'),
      })))
    }

    const system = `You are a curriculum designer. Modify an existing curriculum based on a user's natural-language request.
Return the full updated curriculum as plain JSON (no markdown fences) with the same structure as the original.
Structure:
{
  "modules": [
    {
      "title": "Module Name",
      "lessons": [
        {
          "title": "Lesson Name",
          "depth": "Beginner|Intermediate|Advanced",
          "estimated_time": 15,
          "outcomes": ["..."],
          "prerequisites": ["Lesson Name"]
        }
      ]
    }
  ]
}
Rules:
- Maintain 3-8 modules, 3-7 lessons per module.
- Every lesson must have depth, estimated_time, outcomes, and prerequisites.
- Prerequisites must reference actual lesson titles in the curriculum.
- No circular prerequisites. No self-references.
- Preserve as much of the existing structure as possible; only change what the user requested.`

    const userContent = `Topic: ${topic.title}\nLearner level: ${topic.level || 'Beginner'}\nTime commitment: ${topic.time_per_week || '30 min/day'}\n\nExisting curriculum:\n${JSON.stringify(existingLessons, null, 2)}\n\nUser request: ${tweakRequest.trim()}\n\nReturn the updated full curriculum.`

    const result = await generateText({
      provider: settings.provider,
      apiKey: settings.api_key,
      model: settings.model,
      system,
      messages: [{ role: 'user', content: userContent }],
    })

    const raw = result.text.replace(/```json/g, '').replace(/```/g, '').trim()
    const updated = JSON.parse(raw)
    const validation = validateCurriculum(updated)
    if (!validation.valid) {
      return res.status(400).json({ error: `Tweak produced an invalid curriculum: ${validation.error}` })
    }

    persistCurriculum(topicId, updated)
    return res.json({ ok: true, modules: updated.modules })
  } catch (err) {
    console.error('POST /api/topics/:id/curriculum/tweak error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to tweak curriculum.' })
  }
})

/**
 * POST /api/topics/:id/curriculum/regenerate
 * Regenerate the curriculum from scratch (replaces old draft).
 */
router.post('/topics/:id/curriculum/regenerate', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT title, level, time_per_week FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    if (!topic.level || !topic.time_per_week) {
      return res.status(400).json({ error: 'Learner profile not set. Please answer setup questions first.' })
    }

    const settings = getSettingsRow()
    if (!settings || !settings.api_key) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    // Delete old curriculum modules (cascades to lessons)
    run('DELETE FROM modules WHERE topic_id = ?', topicId)

    const streamResult = await generateCurriculum(topic.title, topic.level, topic.time_per_week)
    await streamToSSE(streamResult, res)
  } catch (err) {
    console.error('POST /api/topics/:id/curriculum/regenerate error:', err.message)
    if (!res.headersSent) {
      if (err instanceof LlmClientError) {
        return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      return res.status(500).json({ error: 'Failed to regenerate curriculum.' })
    }
    res.write(`event: error\n`)
    res.write(`data: ${JSON.stringify({ message: err.message })}\n\n`)
    res.end()
  }
})

/**
 * GET /api/topics/:id/lessons/:lid/test-out
 * Get test-out quiz questions for a lesson.
 */
router.get('/topics/:id/lessons/:lid/test-out', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)

    const topic = get('SELECT title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const lesson = get(
      `SELECT l.title, l.outcomes FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = ? AND m.topic_id = ?`,
      lessonId, topicId
    )
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }

    const settings = getSettingsRow()
    if (!settings || !settings.api_key) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    let outcomes = []
    try {
      outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
    } catch {
      outcomes = []
    }

    const system = `You are an assessment designer. Generate 1-3 concise diagnostic questions to test whether a learner has already mastered a specific lesson.
Respond in strict JSON:
{
  "questions": [
    { "text": "Question text?", "type": "open" }
  ]
}
Questions should cover the lesson's learning outcomes directly. Do not include markdown formatting.`

    const result = await generateText({
      provider: settings.provider,
      apiKey: settings.api_key,
      model: settings.model,
      system,
      messages: [{ role: 'user', content: `Lesson: ${lesson.title}\nOutcomes: ${outcomes.join(', ')}` }],
    })

    const parsed = JSON.parse(result.text)
    return res.json({ questions: parsed.questions || [] })
  } catch (err) {
    console.error('GET /api/topics/:id/lessons/:lid/test-out error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate test-out questions.' })
  }
})

/**
 * POST /api/topics/:id/lessons/:lid/test-out
 * Evaluate test-out answers.
 */
router.post('/topics/:id/lessons/:lid/test-out', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const lessonId = Number(req.params.lid)
    const { answers } = req.body

    const topic = get('SELECT title FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const lesson = get(
      `SELECT l.title, l.outcomes FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = ? AND m.topic_id = ?`,
      lessonId, topicId
    )
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Answers are required.' })
    }

    const settings = getSettingsRow()
    if (!settings || !settings.api_key) {
      return res.status(400).json({ error: 'LLM settings not configured. Please add an API key in Settings.' })
    }

    let outcomes = []
    try {
      outcomes = lesson.outcomes ? JSON.parse(lesson.outcomes) : []
    } catch {
      outcomes = []
    }

    const system = `You are an evaluator. Assess the user's answers to diagnostic questions about a lesson.
Respond in strict JSON:
{
  "passed": true|false,
  "score": 0-100,
  "feedback": "Overall feedback",
  "gaps": ["Specific gap if any"]
}
Pass requires score >= 80 AND no critical gaps. Be strict but fair. Do not include markdown formatting.`

    const userContent = `Lesson: ${lesson.title}\nOutcomes: ${outcomes.join(', ')}\n\nUser answers:\n${answers.map((a, i) => `${i + 1}. ${a}`).join('\n')}`

    const result = await generateText({
      provider: settings.provider,
      apiKey: settings.api_key,
      model: settings.model,
      system,
      messages: [{ role: 'user', content: userContent }],
    })

    const parsed = JSON.parse(result.text)
    const passed = parsed.passed === true && (parsed.score || 0) >= 80 && (parsed.gaps || []).length === 0

    if (passed) {
      const existing = get('SELECT id FROM progress WHERE topic_id = ? AND lesson_id = ?', topicId, lessonId)
      if (existing) {
        run(
          'UPDATE progress SET state = ?, quiz_score = ?, completed_at = ? WHERE id = ?',
          'tested_out',
          parsed.score || 100,
          new Date().toISOString(),
          existing.id
        )
      } else {
        run(
          'INSERT INTO progress (topic_id, lesson_id, state, quiz_score, completed_at) VALUES (?, ?, ?, ?, ?)',
          topicId,
          lessonId,
          'tested_out',
          parsed.score || 100,
          new Date().toISOString()
        )
      }
    }

    return res.json({
      passed,
      score: parsed.score || 0,
      feedback: parsed.feedback || '',
      gaps: parsed.gaps || [],
    })
  } catch (err) {
    console.error('POST /api/topics/:id/lessons/:lid/test-out error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to evaluate test-out answers.' })
  }
})

export default router
