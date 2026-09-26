const OUTCOME_FIELDS = new Set(['id', 'title', 'kind', 'role', 'evidence'])
const EVIDENCE_TYPES = new Set(['activity', 'checkpoint', 'artifact'])
const OUTCOME_ID_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/

function error(code, path, message) {
  return { valid: false, code, path, error: message }
}

function isRecord(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeTitle(title) {
  return title.normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^\p{L}\p{N}]+/gu, ' ').trim().replace(/\s+/g, ' ')
}

export function validateOutcome(value, path = 'outcome') {
  if (!isRecord(value)) return error('OUTCOME_INVALID', path, 'Outcome must be an object.')

  for (const field of Object.keys(value)) {
    if (!OUTCOME_FIELDS.has(field)) return error('OUTCOME_INVALID', `${path}.${field}`, `Outcome field "${field}" is not supported.`)
  }

  if (typeof value.id !== 'string' || value.id.length < 3 || value.id.length > 80 || !OUTCOME_ID_PATTERN.test(value.id)) {
    return error('OUTCOME_INVALID', `${path}.id`, 'Outcome id must be 3-80 lowercase kebab-case characters.')
  }
  if (typeof value.title !== 'string' || value.title.trim().length < 5 || value.title.trim().length > 160 || /[<>\r\n\u0000-\u001f]/.test(value.title)) {
    return error('OUTCOME_INVALID', `${path}.title`, 'Outcome title must be plain text between 5 and 160 characters.')
  }
  if (!['knowledge', 'skill'].includes(value.kind)) return error('OUTCOME_INVALID', `${path}.kind`, 'Outcome kind must be knowledge or skill.')
  if (!['core', 'breadth'].includes(value.role)) return error('OUTCOME_INVALID', `${path}.role`, 'Outcome role must be core or breadth.')
  if (!Array.isArray(value.evidence) || value.evidence.length === 0 || value.evidence.some((item) => !EVIDENCE_TYPES.has(item))) {
    return error('OUTCOME_INVALID', `${path}.evidence`, 'Outcome evidence must be a nonempty subset of activity, checkpoint, and artifact.')
  }
  if (new Set(value.evidence).size !== value.evidence.length) return error('OUTCOME_INVALID', `${path}.evidence`, 'Outcome evidence values must be unique.')

  return {
    valid: true,
    value: {
      id: value.id,
      title: value.title.trim(),
      kind: value.kind,
      role: value.role,
      evidence: [...value.evidence],
    },
  }
}

export function validateOutcomeManifest(curriculum, options = {}) {
  if (!isRecord(curriculum)) return error('OUTCOME_MANIFEST_INVALID', 'curriculum', 'Curriculum must be an object.')
  if (!Array.isArray(curriculum.modules) || curriculum.modules.length === 0) return error('OUTCOME_MANIFEST_INVALID', 'curriculum.modules', 'Curriculum must contain at least one Chapter.')

  const trackKind = options?.trackKind ?? 'initial'
  if (!['initial', 'continuation'].includes(trackKind)) return error('OUTCOME_TRACK_KIND_INVALID', 'options.trackKind', 'Track kind must be initial or continuation.')

  const lineageOutcomes = options?.lineageOutcomes ?? []
  if (!Array.isArray(lineageOutcomes)) return error('OUTCOME_LINEAGE_INVALID', 'options.lineageOutcomes', 'Lineage outcomes must be an array.')
  const lineageIds = new Set()
  const lineageTitles = new Set()
  if (trackKind === 'continuation') {
    for (const [index, prior] of lineageOutcomes.entries()) {
      if (!isRecord(prior) || typeof prior.id !== 'string' || typeof prior.title !== 'string' || !prior.title.trim()) {
        return error('OUTCOME_LINEAGE_INVALID', `options.lineageOutcomes[${index}]`, 'Lineage outcomes require an id and title.')
      }
      lineageIds.add(prior.id)
      lineageTitles.add(normalizeTitle(prior.title))
    }
  }

  const seenIds = new Set()
  const seenTitles = new Set()
  let outcomeCount = 0
  let coreCount = 0
  let breadthCount = 0

  for (const [moduleIndex, chapter] of curriculum.modules.entries()) {
    const chapterPath = `curriculum.modules[${moduleIndex}]`
    if (!isRecord(chapter)) return error('OUTCOME_MANIFEST_INVALID', chapterPath, 'Chapter must be an object.')
    if (!Array.isArray(chapter.skill_outcomes) || chapter.skill_outcomes.length === 0) return error('OUTCOME_MANIFEST_INVALID', `${chapterPath}.skill_outcomes`, 'Chapter must declare outcomes.')
    if (!Array.isArray(chapter.lessons) || chapter.lessons.length === 0) return error('OUTCOME_MANIFEST_INVALID', `${chapterPath}.lessons`, 'Chapter must contain Sessions.')

    const chapterOutcomes = new Map()
    let hasKnowledge = false
    let hasSkill = false
    let hasCore = false
    for (const [outcomeIndex, rawOutcome] of chapter.skill_outcomes.entries()) {
      const outcomePath = `${chapterPath}.skill_outcomes[${outcomeIndex}]`
      const checked = validateOutcome(rawOutcome, outcomePath)
      if (!checked.valid) return checked
      const outcome = checked.value
      if (chapterOutcomes.has(outcome.id) || seenIds.has(outcome.id)) return error('OUTCOME_ID_DUPLICATE', `${outcomePath}.id`, `Outcome id "${outcome.id}" is repeated in this Track.`)
      if (trackKind === 'continuation' && lineageIds.has(outcome.id)) return error('OUTCOME_LINEAGE_ID_DUPLICATE', `${outcomePath}.id`, `Outcome id "${outcome.id}" already appears in the Trail.`)

      const normalizedTitle = normalizeTitle(outcome.title)
      if (seenTitles.has(normalizedTitle)) return error('OUTCOME_TITLE_DUPLICATE', `${outcomePath}.title`, `Outcome title "${outcome.title}" is repeated in this Track.`)
      if (trackKind === 'continuation' && lineageTitles.has(normalizedTitle)) return error('OUTCOME_LINEAGE_TITLE_DUPLICATE', `${outcomePath}.title`, `Outcome title "${outcome.title}" already appears in the Trail.`)
      if (outcome.kind === 'skill' && !outcome.evidence.includes('activity')) return error('SKILL_ACTIVITY_EVIDENCE_REQUIRED', `${outcomePath}.evidence`, 'Every skill outcome must include activity evidence.')

      chapterOutcomes.set(outcome.id, outcome)
      seenIds.add(outcome.id)
      seenTitles.add(normalizedTitle)
      outcomeCount += 1
      if (outcome.role === 'core') {
        coreCount += 1
        hasCore = true
      } else {
        breadthCount += 1
      }
      if (outcome.kind === 'knowledge') hasKnowledge = true
      if (outcome.kind === 'skill') hasSkill = true
    }

    let artifactSessionCount = 0
    for (const [lessonIndex, lesson] of chapter.lessons.entries()) {
      const lessonPath = `${chapterPath}.lessons[${lessonIndex}]`
      if (!isRecord(lesson)) return error('OUTCOME_MANIFEST_INVALID', lessonPath, 'Session must be an object.')
      if (!Array.isArray(lesson.outcomes) || lesson.outcomes.length === 0) return error('OUTCOME_MANIFEST_INVALID', `${lessonPath}.outcomes`, 'Session must teach at least one declared outcome.')
      if (lesson.artifact_required === true) artifactSessionCount += 1

      const lessonIds = new Set()
      for (const [lessonOutcomeIndex, rawLessonOutcome] of lesson.outcomes.entries()) {
        const outcomePath = `${lessonPath}.outcomes[${lessonOutcomeIndex}]`
        const checked = validateOutcome(rawLessonOutcome, outcomePath)
        if (!checked.valid) return checked
        const declared = chapterOutcomes.get(checked.value.id)
        if (!declared) return error('OUTCOME_NOT_IN_CHAPTER', `${outcomePath}.id`, `Outcome "${checked.value.id}" is not declared by this Chapter.`)
        if (lessonIds.has(checked.value.id)) return error('OUTCOME_LESSON_DUPLICATE', `${outcomePath}.id`, 'A Session cannot repeat an outcome.')
        if (JSON.stringify(checked.value) !== JSON.stringify(declared)) return error('OUTCOME_LESSON_MISMATCH', outcomePath, 'Session outcomes must match their full Chapter declarations.')
        lessonIds.add(checked.value.id)
      }
    }

    if (!hasKnowledge || !hasSkill) return error('CHAPTER_OUTCOME_KIND_MISSING', `${chapterPath}.skill_outcomes`, 'Each Chapter must include knowledge and skill outcomes.')
    if (!hasCore) return error('CHAPTER_CORE_OUTCOME_MISSING', `${chapterPath}.skill_outcomes`, 'Each Chapter must include at least one core outcome.')
    if (artifactSessionCount === 0) return error('CHAPTER_BUILD_REQUIRED', `${chapterPath}.lessons`, 'Each Chapter must include a Session that requires a Build.')
  }

  if (trackKind === 'continuation') {
    if (breadthCount === 0) return error('CONTINUATION_BREADTH_REQUIRED', 'curriculum.modules', 'A continuation Track must include at least one breadth outcome.')
    if (outcomeCount >= 10 && (coreCount * 10 < outcomeCount * 7 || coreCount * 10 > outcomeCount * 9)) {
      return error('CONTINUATION_CORE_RATIO_INVALID', 'curriculum.modules', 'A continuation Track with at least ten outcomes must be 70-90 percent core.')
    }
  }

  return { valid: true, value: curriculum }
}

export function publicOutcome(outcome) {
  if (!isRecord(outcome)) return null
  return {
    id: outcome.id,
    title: outcome.title,
    kind: outcome.kind,
    role: outcome.role,
    evidence: Array.isArray(outcome.evidence) ? [...outcome.evidence] : [],
  }
}

export function outcomeTitles(outcomes) {
  if (!Array.isArray(outcomes)) return []
  return outcomes.filter((outcome) => isRecord(outcome) && typeof outcome.title === 'string').map((outcome) => outcome.title)
}

export function collectOutcomeCoverage(curriculum) {
  const outcomes = new Map()
  const byEvidence = { activity: [], checkpoint: [], artifact: [] }
  for (const chapter of Array.isArray(curriculum?.modules) ? curriculum.modules : []) {
    if (!isRecord(chapter)) continue
    const chapterOutcomes = Array.isArray(chapter.skill_outcomes) ? chapter.skill_outcomes : []
    for (const rawOutcome of chapterOutcomes) {
      const checked = validateOutcome(rawOutcome)
      if (!checked.valid || outcomes.has(checked.value.id)) continue
      const outcome = checked.value
      outcomes.set(outcome.id, { ...outcome, lessonTitles: [], artifactLessonTitles: [] })
      for (const evidence of outcome.evidence) byEvidence[evidence].push(outcome.id)
    }
    for (const lesson of Array.isArray(chapter.lessons) ? chapter.lessons : []) {
      if (!isRecord(lesson)) continue
      const lessonTitle = typeof lesson.title === 'string' ? lesson.title : ''
      for (const lessonOutcome of Array.isArray(lesson.outcomes) ? lesson.outcomes : []) {
        const item = outcomes.get(lessonOutcome?.id)
        if (!item || !lessonTitle) continue
        if (!item.lessonTitles.includes(lessonTitle)) item.lessonTitles.push(lessonTitle)
        if (lesson.artifact_required === true && !item.artifactLessonTitles.includes(lessonTitle)) item.artifactLessonTitles.push(lessonTitle)
      }
    }
  }
  return { outcomes: [...outcomes.values()], byEvidence }
}
