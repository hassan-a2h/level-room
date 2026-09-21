import { Router } from 'express'
import { get, run, all, transaction } from '../db.js'
import { streamText, generateText, LlmClientError } from '../llm/client.js'
import { requireLlmConfig } from '../utils/llm-config.js'
import { createRequestAbortSignal, llmRequestOptions } from '../llm/request-options.js'
import { validateCurriculum as validateCurriculumDraft, collectCurriculumDraft, CurriculumDraftError, writeCurriculumSSE, writeCurriculumSSEError } from '../utils/curriculum-draft.js'
import { persistCurriculumInTransaction } from '../utils/course-lineage.js'
import { evaluatePlacementScores, normalizePlacementQuestions, placementPublicQuestions } from '../utils/placement-assessment.js'
import {
  CurriculumGenerationError,
  claimCurriculumGeneration,
  completeCurriculumGeneration,
  failCurriculumGeneration,
  getCurriculumRecovery,
  parseCurriculumDraft,
} from '../utils/curriculum-recovery.js'

const router = Router()

const VALID_LEVELS = ['Beginner', 'Intermediate', 'Advanced']
const VALID_TIME_COMMITMENTS = ['15 min/day', '30 min/day', '1 hour/day', '2+ hours/day']
const LEVEL_RANK = { Beginner: 0, Intermediate: 1, Advanced: 2 }
const TIME_ALIASES = new Map([
  ['15 min', '15 min/day'],
  ['30 min', '30 min/day'],
  ['1 hour', '1 hour/day'],
  ['2 hours', '2+ hours/day'],
  ['2+ hours', '2+ hours/day'],
])

const SETUP_OPTIONS = Object.freeze({
  levels: Object.freeze([
    { value: 'Beginner', label: 'Beginner' },
    { value: 'Intermediate', label: 'Intermediate' },
    { value: 'Advanced', label: 'Advanced' },
  ]),
  timeCommitments: Object.freeze([
    { value: '15 min/day', label: '15 min/day' },
    { value: '30 min/day', label: '30 min/day' },
    { value: '1 hour/day', label: '1 hour/day' },
    { value: '2+ hours/day', label: '2+ hours/day' },
  ]),
})

function normalizeLevel(value) {
  if (typeof value !== 'string') return null
  const match = VALID_LEVELS.find((level) => level.toLowerCase() === value.trim().toLowerCase())
  return match || null
}

function normalizeTimeCommitment(value) {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  const canonical = VALID_TIME_COMMITMENTS.find((option) => option.toLowerCase() === trimmed.toLowerCase())
  if (canonical) return canonical
  return TIME_ALIASES.get(trimmed.toLowerCase()) || null
}

function setupQuestions(topicTitle) {
  const title = typeof topicTitle === 'string' && topicTitle.trim() ? topicTitle.trim() : 'this topic'
  return {
    questions: [
      {
        id: 'level',
        text: `How familiar are you with ${title}?`,
        options: SETUP_OPTIONS.levels.map((option) => ({ ...option })),
      },
      {
        id: 'timeCommitment',
        text: 'How much time can you study most days?',
        options: SETUP_OPTIONS.timeCommitments.map((option) => ({ ...option })),
      },
    ],
  }
}

function placementResult(assessment) {
  const recommended = assessment.recommended_level || 'Beginner'
  let feedback = []
  let gaps = []
  try { feedback = assessment.feedback ? JSON.parse(assessment.feedback) : [] } catch {}
  try { gaps = assessment.gaps ? JSON.parse(assessment.gaps) : [] } catch {}
  return {
    assessmentId: assessment.id,
    requestedLevel: assessment.requested_level,
    score: assessment.score,
    targetScore: assessment.target_score,
    stretchScore: assessment.stretch_score,
    passed: recommended === assessment.requested_level,
    recommendedLevel: recommended,
    feedback: Array.isArray(feedback) ? feedback : [],
    gaps: Array.isArray(gaps) ? gaps : [],
  }
}

/**
 * Generate a full curriculum for a topic via LLM.
 */
async function generateCurriculum(topicTitle, level, timeCommitment, config, signal) {
  const system = `You are an expert curriculum designer. Generate an adaptive learning curriculum.
Respond as a stream of JSON text representing a single object with this exact structure:
{
  "course": { "kind": "core", "stage": 0, "scope": "80/20 foundation" },
  "modules": [
    {
      "title": "Module Name",
      "summary": "The practical capability this module builds.",
      "skill_outcomes": ["..."],
      "lessons": [
        {
          "title": "Lesson Name",
          "depth": "Beginner|Intermediate|Advanced",
          "estimated_time": 15,
          "outcomes": ["By the end of this lesson, the learner can..."],
          "prerequisites": ["Lesson Name"],
          "task": {
            "title": "Build and verify a small local setup",
            "scenario": "A safe local scenario.",
            "goal": "Create and verify the requested behavior.",
            "constraints": ["Use test data only"],
            "deliverables": ["Commands or configuration", "Observed output"],
            "success_criteria": ["The behavior is observable", "The result is reproducible"],
            "estimated_time": 25,
            "primary_setup": { "kind": "local", "description": "Use a local installation or container.", "requires_account": false, "requires_payment": false, "requires_secret": false, "requires_external_target": false },
            "free_fallback": { "kind": "no_software", "description": "Explain the expected local result with sample data.", "requires_account": false, "requires_payment": false, "requires_secret": false, "requires_external_target": false },
            "hints": [],
            "safety_notes": ["Use only systems you own or an isolated local environment."]
          }
        }
      ]
    }
  ]
}
Rules:
- 3-5 modules total.
- Each module has 3-5 lessons.
- This is a finite 80/20 foundation course, not an endless syllabus.
- Every lesson must have depth, estimated_time (minutes), outcomes (1-3 strings), and prerequisites (names of other lessons in the curriculum; empty for foundation lessons).
- Prerequisites must reference lesson titles that exist in the curriculum.
- No circular prerequisites. No lesson may list itself as a prerequisite.
- The curriculum must form a valid DAG.
- Depth should adapt to the learner's stated level: ${level}.
- Total lesson time per module should respect time commitment: ${timeCommitment}.
- Do not include markdown code fences. Output plain JSON only.`

  const userContent = `Topic: ${topicTitle}\nLearner level: ${level}\nTime commitment: ${timeCommitment}\nGenerate the curriculum now.`

  return streamText({
    ...llmRequestOptions(config, { signal }),
    system,
    messages: [{ role: 'user', content: userContent }],
  })
}

async function streamGeneratedCurriculum(topicId, topic, req, res) {
  const { token } = claimCurriculumGeneration(topicId)
  try {
    const config = requireLlmConfig()
    const request = createRequestAbortSignal(req, res)
    let lastError
    for (let attempt = 0; attempt < 3; attempt += 1) {
      const streamResult = await generateCurriculum(topic.title, topic.level, topic.time_per_week, config, request.signal)
      try {
        const curriculum = await collectCurriculumDraft(streamResult.textStream, { enforceBounds: true, requireTasks: true })
        completeCurriculumGeneration(topicId, token, curriculum)
        return writeCurriculumSSE(res, curriculum)
      } catch (error) {
        lastError = error
        if (!(error.code === 'INVALID_CURRICULUM' && error.retryable && attempt < 2)) throw error
      }
    }
    throw lastError
  } catch (error) {
    failCurriculumGeneration(topicId, token, error)
    throw error
  }
}

/**
 * Parse streamed JSON chunks into a curriculum object.
 * Kept for compatibility with older route consumers; new generation uses the buffered validator.
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
function validateLegacyCurriculum(curriculum) {
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

function persistCurriculum(topicId, curriculum) {
  return transaction(() => {
    run('DELETE FROM modules WHERE topic_id = ?', topicId)
    const firstLessonId = persistCurriculumInTransaction(topicId, curriculum)
    if (curriculum.course) {
      run(
        `UPDATE topics SET course_kind = ?, course_stage = ?, course_focus = ? WHERE id = ?`,
        curriculum.course.kind,
        curriculum.course.stage,
        curriculum.course.focus || '',
        topicId,
      )
    }
    run(
      `UPDATE topics
       SET curriculum_state = 'confirmed', curriculum_draft = NULL, curriculum_error = NULL,
           curriculum_generation_started_at = NULL, curriculum_generation_token = NULL
       WHERE id = ?`,
      topicId,
    )
    return firstLessonId
  })()
}

function curriculumMutationError(message = 'This course can no longer be replaced after learning has started.') {
  const error = new Error(message)
  error.code = 'CURRICULUM_LOCKED'
  error.status = 409
  return error
}

function assertCurriculumMutable(topicId) {
  const topic = get('SELECT id, status FROM topics WHERE id = ?', topicId)
  if (!topic) return { ok: false, error: curriculumMutationError('Topic not found.') }
  if (topic.status === 'completed') return { ok: false, error: curriculumMutationError('Completed courses cannot be replaced.') }
  const started = get(
    `SELECT 1 FROM progress WHERE topic_id = ? AND (state <> 'not_started' OR coalesce(current_chunk, 0) > 0 OR coalesce(quiz_attempts, 0) > 0 OR artifact_passed = 1) LIMIT 1`,
    topicId,
  )
  const persisted = [
    ['messages', 'topic_id'],
    ['artifacts', 'progress_id'],
    ['quiz_attempts', 'topic_id'],
    ['exam_attempts', 'topic_id'],
  ].some(([table, column]) => {
    if (column === 'progress_id') return get(`SELECT 1 FROM ${table} a JOIN progress p ON p.id = a.progress_id WHERE p.topic_id = ? LIMIT 1`, topicId)
    return get(`SELECT 1 FROM ${table} WHERE ${column} = ? LIMIT 1`, topicId)
  })
  if (started || persisted) return { ok: false, error: curriculumMutationError() }
  return { ok: true }
}

/**
 * POST /api/topics/:id/profile
 * Save learner profile (level + time commitment).
 */
router.post('/topics/:id/profile', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const { level, selfReportedLevel, timeCommitment, placementAssessmentId } = req.body

    const topic = get(
      `SELECT id, level, time_per_week, curriculum_state,
              EXISTS (SELECT 1 FROM modules WHERE modules.topic_id = topics.id) AS has_modules
       FROM topics WHERE id = ?`,
      topicId,
    )
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const effectiveLevel = normalizeLevel(level)
    const reportedLevel = normalizeLevel(selfReportedLevel || level)
    if (!effectiveLevel || !reportedLevel) {
      return res.status(400).json({ error: `Invalid level. Must be one of: ${VALID_LEVELS.join(', ')}.` })
    }
    const canonicalTimeCommitment = normalizeTimeCommitment(timeCommitment)
    if (!canonicalTimeCommitment) {
      return res.status(400).json({ error: `Invalid time commitment. Must be one of: ${VALID_TIME_COMMITMENTS.join(', ')}.` })
    }

    let assessment = null
    if (LEVEL_RANK[reportedLevel] > LEVEL_RANK.Beginner) {
      const assessmentId = Number(placementAssessmentId)
      if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
        return res.status(400).json({ error: 'A completed placement assessment is required for this level.' })
      }
      assessment = get(
        `SELECT id, requested_level, status, recommended_level
         FROM placement_assessments
         WHERE id = ? AND topic_id = ?`,
        assessmentId, topicId
      )
      if (!assessment || assessment.status !== 'completed') {
        return res.status(400).json({ error: 'Complete the placement assessment before saving this level.' })
      }
      if (assessment.requested_level !== reportedLevel || assessment.recommended_level !== effectiveLevel) {
        return res.status(400).json({ error: 'The placement assessment does not match the selected profile.' })
      }
    } else if (effectiveLevel !== 'Beginner') {
      return res.status(400).json({ error: 'The verified level must be Beginner when no placement assessment is provided.' })
    }

    const profileChanged = topic.level !== effectiveLevel || topic.time_per_week !== canonicalTimeCommitment
    if (!topic.has_modules && (profileChanged || topic.curriculum_state === 'setup')) {
      run(
        `UPDATE topics
         SET level = ?, time_per_week = ?, curriculum_state = 'ready_to_generate',
             curriculum_draft = NULL, curriculum_error = NULL,
             curriculum_generation_started_at = NULL, curriculum_generation_token = NULL
         WHERE id = ?`,
        effectiveLevel,
        canonicalTimeCommitment,
        topicId,
      )
    } else {
      run('UPDATE topics SET level = ?, time_per_week = ? WHERE id = ?', effectiveLevel, canonicalTimeCommitment, topicId)
    }

    return res.json({
      ok: true,
      level: effectiveLevel,
      selfReportedLevel: reportedLevel,
      timeCommitment: canonicalTimeCommitment,
      placementAssessmentId: assessment?.id || null,
    })
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

    return res.json(setupQuestions(topic.title))
  } catch (err) {
    console.error('GET /api/topics/:id/setup-questions error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate setup questions.' })
  }
})

/**
 * POST /api/topics/:id/placement/start
 * Generate and persist a short placement assessment for Intermediate/Advanced learners.
 */
router.post('/topics/:id/placement/start', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const level = normalizeLevel(req.body?.level)
    const topic = get('SELECT id, title FROM topics WHERE id = ?', topicId)
    if (!topic) return res.status(404).json({ error: 'Topic not found.' })
    if (!level || level === 'Beginner') {
      return res.status(400).json({ error: 'Placement assessment is only required for Intermediate or Advanced.' })
    }

    const config = requireLlmConfig()
    const system = `You are designing a placement assessment for the topic "${topic.title}".
The learner claims ${level} proficiency. Generate exactly 6 concise questions: exactly five target questions that assess practical competence at the claimed level, plus exactly one stretch question.
Target questions must stay within ${level} expectations and must not assume next-level knowledge. For an Intermediate learner, the stretch question may assess Advanced competence. For an Advanced learner, the stretch question must assess deeper Advanced judgment without inventing an Expert level.
Return strict JSON with this shape:
{
  "questions": [
    { "id": "q1", "text": "...", "type": "multiple_choice", "difficulty_band": "target", "options": [{"value":"A","label":"..."},{"value":"B","label":"..."}], "correct_answer": "A" },
    { "id": "q6", "text": "...", "type": "objective", "difficulty_band": "stretch", "rubric": "What a strong answer must demonstrate" }
  ]
}
Include at least 2 multiple_choice and 2 objective questions. Mark exactly five questions difficulty_band target and one difficulty_band stretch. Multiple-choice options must have 2-5 choices and one correct_answer value. Objective questions must have a concrete rubric. Test transferable understanding and practical judgment, not trivia. Do not include markdown.`
    const result = await generateText({
      ...llmRequestOptions(config),
      system,
      messages: [{ role: 'user', content: 'Generate placement assessment questions.' }],
    })
    const questions = normalizePlacementQuestions(JSON.parse(result.text || '{}'), level)

    const assessmentId = transaction(() => {
      run('UPDATE placement_assessments SET status = ? WHERE topic_id = ? AND status = ?', 'expired', topicId, 'pending')
      const inserted = run(
        'INSERT INTO placement_assessments (topic_id, requested_level, questions) VALUES (?, ?, ?)',
        topicId, level, JSON.stringify(questions)
      )
      return Number(inserted.lastInsertRowid)
    })()

    return res.json({ assessmentId, level, questions: placementPublicQuestions(questions) })
  } catch (err) {
    console.error('POST /api/topics/:id/placement/start error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to generate placement assessment.' })
  }
})

/**
 * POST /api/topics/:id/placement/submit
 * Evaluate a persisted placement assessment and return a verified level recommendation.
 */
router.post('/topics/:id/placement/submit', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const assessmentId = Number(req.body?.assessmentId)
    const answers = req.body?.answers
    if (!Number.isInteger(assessmentId) || assessmentId <= 0) {
      return res.status(400).json({ error: 'A valid placement assessment is required.' })
    }
    const assessment = get(
      `SELECT id, topic_id, requested_level, questions, answers, status, score, target_score, stretch_score, recommended_level, feedback, gaps
       FROM placement_assessments
       WHERE id = ? AND topic_id = ?`,
      assessmentId, topicId
    )
    if (!assessment) return res.status(404).json({ error: 'Placement assessment not found.' })
    if (assessment.status === 'completed') return res.json(placementResult(assessment))
    if (assessment.status !== 'pending') return res.status(409).json({ error: 'This placement assessment is no longer active.' })
    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      return res.status(400).json({ error: 'Answers must be provided for the placement assessment.' })
    }

    let questions
    try { questions = JSON.parse(assessment.questions) } catch { return res.status(500).json({ error: 'Placement assessment data is invalid.' }) }
    const questionById = new Map(questions.map((question) => [question.id, question]))
    const answerEntries = Object.entries(answers)
    if (answerEntries.length !== questions.length || answerEntries.some(([id, answer]) => !questionById.has(id) || typeof answer !== 'string' || !answer.trim() || answer.length > 2000)) {
      return res.status(400).json({ error: 'Please answer every placement question.' })
    }
    for (const [id, answer] of answerEntries) {
      const question = questionById.get(id)
      if (question.type === 'multiple_choice' && !question.options.some((option) => option.value === answer)) {
        return res.status(400).json({ error: 'One or more multiple-choice answers are invalid.' })
      }
    }

    const config = requireLlmConfig()
    const evaluationPrompt = `You are evaluating a placement assessment for "${assessment.requested_level}" proficiency in the topic.
Score the five target questions as target_score from 0 to 100, and the one stretch question as stretch_score from 0 to 100. Target-level competence is the placement gate; the stretch score is a capped depth signal and must not independently downgrade target-level mastery. Use the question rubrics and answer keys. Be strict but fair.
Return strict JSON only: {"target_score": number, "stretch_score": number, "feedback": ["..."], "gaps": ["..."]}.

Questions and answer keys:
${JSON.stringify(questions)}

Learner answers:
${JSON.stringify(answers)}`
    const result = await generateText({
      ...llmRequestOptions(config),
      system: evaluationPrompt,
      messages: [{ role: 'user', content: 'Evaluate this placement assessment.' }],
    })
    const parsed = JSON.parse(result.text || '{}')
    const placementScores = evaluatePlacementScores({
      requestedLevel: assessment.requested_level,
      targetScore: parsed.target_score,
      stretchScore: parsed.stretch_score,
    })
    const feedback = Array.isArray(parsed.feedback)
      ? parsed.feedback.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 500)).slice(0, 8)
      : []
    const gaps = Array.isArray(parsed.gaps)
      ? parsed.gaps.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 500)).slice(0, 8)
      : []
    const update = transaction(() => {
      run(
        `UPDATE placement_assessments
         SET answers = ?, status = 'completed', score = ?, target_score = ?, stretch_score = ?, recommended_level = ?, feedback = ?, gaps = ?, completed_at = CURRENT_TIMESTAMP
         WHERE id = ? AND status = 'pending'`,
        JSON.stringify(answers), placementScores.score, placementScores.targetScore, placementScores.stretchScore, placementScores.recommendedLevel, JSON.stringify(feedback), JSON.stringify(gaps), assessment.id
      )
    })()
    if (!update || update.changes !== 1) {
      const completed = get(
        'SELECT id, requested_level, status, score, target_score, stretch_score, recommended_level, feedback, gaps FROM placement_assessments WHERE id = ? AND topic_id = ?',
        assessment.id, topicId
      )
      if (completed?.status === 'completed') return res.json(placementResult(completed))
      return res.status(409).json({ error: 'This placement assessment was submitted concurrently. Please retry.' })
    }

    return res.json({
      assessmentId: assessment.id,
      requestedLevel: assessment.requested_level,
      score: placementScores.score,
      targetScore: placementScores.targetScore,
      stretchScore: placementScores.stretchScore,
      passed: placementScores.passed,
      recommendedLevel: placementScores.recommendedLevel,
      feedback,
      gaps,
    })
  } catch (err) {
    console.error('POST /api/topics/:id/placement/submit error:', err.message)
    if (err instanceof LlmClientError) {
      return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
    }
    return res.status(500).json({ error: 'Failed to evaluate placement assessment.' })
  }
})

/**
 * POST /api/topics/:id/curriculum/generate
 * Stream curriculum generation via SSE.
 */
router.post('/topics/:id/curriculum/generate', async (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get(
      'SELECT id, title, level, time_per_week, curriculum_state, curriculum_draft FROM topics WHERE id = ?',
      topicId,
    )
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const mutable = assertCurriculumMutable(topicId)
    if (!mutable.ok) return res.status(mutable.error.status).json({ error: mutable.error.message, code: mutable.error.code })

    if (!topic.level || !topic.time_per_week) {
      return res.status(400).json({ error: 'Learner profile not set. Please answer setup questions first.' })
    }

    return await streamGeneratedCurriculum(topicId, topic, req, res)
  } catch (err) {
    console.error('POST /api/topics/:id/curriculum/generate error:', err.message)
    if (!res.headersSent) {
      if (err instanceof CurriculumGenerationError || err instanceof CurriculumDraftError) {
        return res.status(err.status || 400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      if (err instanceof LlmClientError) {
        return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      return res.status(500).json({ error: 'Failed to generate curriculum.' })
    }
    writeCurriculumSSEError(res, err)
  }
})

/**
 * POST /api/topics/:id/curriculum/confirm
 * Persist the curriculum and unlock first lesson.
 */
router.post('/topics/:id/curriculum/confirm', (req, res) => {
  try {
    const topicId = Number(req.params.id)
    const topic = get('SELECT id, course_kind, course_stage, curriculum_draft FROM topics WHERE id = ?', topicId)
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const mutable = assertCurriculumMutable(topicId)
    if (!mutable.ok) return res.status(mutable.error.status).json({ error: mutable.error.message, code: mutable.error.code })

    const curriculum = req.body?.curriculum || parseCurriculumDraft(topic.curriculum_draft)
    if (!curriculum || typeof curriculum !== 'object') {
      return res.status(400).json({ error: 'Curriculum object is required.' })
    }

    const existingModules = get('SELECT COUNT(*) AS count FROM modules WHERE topic_id = ?', topicId)?.count || 0
    const existingTask = get("SELECT 1 FROM lessons l JOIN modules m ON l.module_id = m.id WHERE m.topic_id = ? AND COALESCE(l.task_spec, '') <> '' LIMIT 1", topicId)
    const boundedCourse = existingModules === 0 || Boolean(existingTask) || curriculum.course !== undefined
    const validation = validateCurriculumDraft(curriculum, { enforceBounds: boundedCourse, requireTasks: boundedCourse })
    if (!validation.valid) {
      return res.status(400).json({ error: validation.error })
    }

    const normalizedCurriculum = boundedCourse
      ? {
          ...validation.value,
          course: {
            ...(validation.value.course || {}),
            kind: topic.course_kind === 'advanced' ? 'advanced' : 'core',
            stage: Number.isInteger(topic.course_stage) && topic.course_stage >= 0 ? topic.course_stage : 0,
          },
        }
      : validation.value

    const firstLessonId = persistCurriculum(topicId, normalizedCurriculum)

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
    return res.json({ ok: true, firstLessonId: firstLessonId || firstLessons[0]?.id || null })
  } catch (err) {
    console.error('POST /api/topics/:id/curriculum/confirm error:', err.message)
    return res.status(500).json({ error: 'Failed to confirm curriculum.' })
  }
})

/**
 * GET /api/topics/:id/curriculum/recovery
 * Return durable onboarding state and any validated unconfirmed draft.
 */
router.get('/topics/:id/curriculum/recovery', (req, res) => {
  try {
    return res.json(getCurriculumRecovery(Number(req.params.id)))
  } catch (err) {
    console.error('GET /api/topics/:id/curriculum/recovery error:', err.message)
    if (err instanceof CurriculumGenerationError) {
      return res.status(err.status).json({ error: err.message, code: err.code })
    }
    return res.status(500).json({ error: 'Failed to load curriculum recovery state.' })
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
        `SELECT l.id, l.lesson_index, l.title, l.depth, l.estimated_time, l.outcomes, l.prerequisites, l.artifact_required, l.task_spec
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
        let taskSpec = null
        try {
          taskSpec = lesson.task_spec ? JSON.parse(lesson.task_spec) : null
        } catch {
          taskSpec = null
        }

        return {
          id: lesson.id,
          title: lesson.title,
          depth: lesson.depth,
          estimated_time: lesson.estimated_time,
          outcomes,
          prerequisites,
          artifact_required: !!lesson.artifact_required,
          task_spec: taskSpec,
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

    const topic = get(
      'SELECT id, title, level, time_per_week, curriculum_state, curriculum_draft FROM topics WHERE id = ?',
      topicId,
    )
    if (!topic) {
      return res.status(404).json({ error: 'Topic not found.' })
    }

    const mutable = assertCurriculumMutable(topicId)
    if (!mutable.ok) return res.status(mutable.error.status).json({ error: mutable.error.message, code: mutable.error.code })

    if (!tweakRequest || typeof tweakRequest !== 'string' || tweakRequest.trim().length === 0) {
      return res.status(400).json({ error: 'Tweak request is required.' })
    }

    const config = requireLlmConfig()

    // Get existing curriculum as context
    const existingModules = all('SELECT * FROM modules WHERE topic_id = ? ORDER BY module_index', topicId)
    const existingLessons = []
    for (const mod of existingModules) {
      const lessons = all('SELECT title, depth, estimated_time, outcomes, prerequisites, task_spec FROM lessons WHERE module_id = ? ORDER BY lesson_index', mod.id)
      existingLessons.push(...lessons.map((l) => ({
        moduleTitle: mod.title,
        ...l,
        outcomes: JSON.parse(l.outcomes || '[]'),
        prerequisites: JSON.parse(l.prerequisites || '[]'),
        task: l.task_spec ? JSON.parse(l.task_spec) : undefined,
      })))
    }

    const savedDraft = existingModules.length === 0 ? parseCurriculumDraft(topic.curriculum_draft) : null
    if (savedDraft?.modules) {
      for (const mod of savedDraft.modules) {
        for (const lesson of mod.lessons || []) {
          existingLessons.push({
            moduleTitle: mod.title,
            ...lesson,
          })
        }
      }
    }

    const taskBackedCourse = existingModules.length === 0 || existingLessons.some((lesson) => lesson.task)

    const system = `You are a curriculum designer. Modify an existing curriculum based on a user's natural-language request.
Return the full updated curriculum as plain JSON (no markdown fences) with the same structure as the original.
${taskBackedCourse ? 'This is a finite task-backed course. Preserve course metadata and include a validated practical task on every lesson.' : ''}
Structure:
{
  ${taskBackedCourse ? '"course": { "kind": "core", "stage": 0, "scope": "80/20 foundation" },' : ''}
  "modules": [
    {
      "title": "Module Name",
      "lessons": [
        {
          "title": "Lesson Name",
          "depth": "Beginner|Intermediate|Advanced",
          "estimated_time": 15,
          "outcomes": ["..."],
          "prerequisites": ["Lesson Name"]${taskBackedCourse ? ',\n          "task": { "title": "Build and verify a small local setup", "scenario": "A safe local scenario.", "goal": "Create and verify the requested behavior.", "constraints": ["Use test data only"], "deliverables": ["Commands or configuration", "Observed output"], "success_criteria": ["The behavior is observable", "The result is reproducible"], "estimated_time": 25, "primary_setup": { "kind": "local", "description": "Use a local installation or container.", "requires_account": false, "requires_payment": false, "requires_secret": false, "requires_external_target": false }, "free_fallback": { "kind": "no_software", "description": "Explain the expected local result with sample data.", "requires_account": false, "requires_payment": false, "requires_secret": false, "requires_external_target": false }, "hints": [], "safety_notes": ["Use only systems you own or an isolated local environment."] }' : ''}
        }
      ]
    }
  ]
}
Rules:
- Maintain ${taskBackedCourse ? '3-5 modules, 3-5 lessons per module' : '3-8 modules, 3-7 lessons per module'}.
- Every lesson must have depth, estimated_time, outcomes, and prerequisites.
- Prerequisites must reference actual lesson titles in the curriculum.
- No circular prerequisites. No self-references.
- Preserve as much of the existing structure as possible; only change what the user requested.
${taskBackedCourse ? '- Keep every task on a local, open-source, free-public, or no-software path and provide an account-free fallback.' : ''}`

    const userContent = `Topic: ${topic.title}\nLearner level: ${topic.level || 'Beginner'}\nTime commitment: ${topic.time_per_week || '30 min/day'}\n\nExisting curriculum:\n${JSON.stringify(existingLessons, null, 2)}\n\nUser request: ${tweakRequest.trim()}\n\nReturn the updated full curriculum.`

    const result = await generateText({
      ...llmRequestOptions(config),
      system,
      messages: [{ role: 'user', content: userContent }],
    })

    const updated = await collectCurriculumDraft(
      (async function* () { yield result.text || '' })(),
      { enforceBounds: taskBackedCourse, requireTasks: taskBackedCourse },
    )

    if (existingModules.length === 0) {
      run(
        `UPDATE topics
         SET curriculum_state = 'draft_ready', curriculum_draft = ?, curriculum_error = NULL,
             curriculum_generation_started_at = NULL, curriculum_generation_token = NULL
         WHERE id = ? AND curriculum_state <> 'confirmed'`,
        JSON.stringify(updated),
        topicId,
      )
    }

    return res.json({ ok: true, modules: updated.modules, course: updated.course })
  } catch (err) {
    console.error('POST /api/topics/:id/curriculum/tweak error:', err.message)
    if (err instanceof CurriculumDraftError) {
      return res.status(400).json({ error: `Tweak produced an invalid curriculum: ${err.message}`, code: err.code, retryable: err.retryable })
    }
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

    const mutable = assertCurriculumMutable(topicId)
    if (!mutable.ok) return res.status(mutable.error.status).json({ error: mutable.error.message, code: mutable.error.code })

    if (!topic.level || !topic.time_per_week) {
      return res.status(400).json({ error: 'Learner profile not set. Please answer setup questions first.' })
    }

    return await streamGeneratedCurriculum(topicId, topic, req, res)
  } catch (err) {
    console.error('POST /api/topics/:id/curriculum/regenerate error:', err.message)
    if (!res.headersSent) {
      if (err instanceof CurriculumGenerationError || err instanceof CurriculumDraftError) {
        return res.status(err.status || 400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      if (err instanceof LlmClientError) {
        return res.status(400).json({ error: err.message, code: err.code, retryable: err.retryable })
      }
      return res.status(500).json({ error: 'Failed to regenerate curriculum.' })
    }
    writeCurriculumSSEError(res, err)
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
      `SELECT l.title, l.outcomes, l.task_spec FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = ? AND m.topic_id = ?`,
      lessonId, topicId
    )
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }
    if (lesson.task_spec) return res.status(409).json({ error: 'Task-backed lessons cannot be tested out. Complete the task and quiz.', code: 'TASK_REQUIRED' })

    const config = requireLlmConfig()

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
      ...llmRequestOptions(config),
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
      `SELECT l.title, l.outcomes, l.task_spec FROM lessons l
       JOIN modules m ON l.module_id = m.id
       WHERE l.id = ? AND m.topic_id = ?`,
      lessonId, topicId
    )
    if (!lesson) {
      return res.status(404).json({ error: 'Lesson not found.' })
    }
    if (lesson.task_spec) return res.status(409).json({ error: 'Task-backed lessons cannot be tested out. Complete the task and quiz.', code: 'TASK_REQUIRED' })

    if (!Array.isArray(answers) || answers.length === 0) {
      return res.status(400).json({ error: 'Answers are required.' })
    }

    const config = requireLlmConfig()

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
      ...llmRequestOptions(config),
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
