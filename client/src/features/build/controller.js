import { useCallback, useEffect, useMemo, useState } from 'react'
import { getArtifact, getLocalDate, submitArtifact } from '../../api.js'
import { toPublicError } from '../../lib/publicError.js'

export const MAX_BUILD_IMPORT_BYTES = 256 * 1024
const ALLOWED_EXTENSIONS = new Set(['.txt', '.md', '.json', '.csv'])

export function createBuildState(values = {}) {
  return {
    phase: 'brief',
    taskSpec: null,
    artifactType: '',
    evidence: { setup: '', actions: '', result: '', reflection: '' },
    currentEvidenceStep: 'setup',
    content: '',
    fileName: null,
    rubric: [],
    evaluation: null,
    error: null,
    showHints: false,
    busy: { loading: false, submitting: false },
    ...values,
    evidence: { setup: '', actions: '', result: '', reflection: '', ...(values.evidence || {}) },
    busy: { loading: false, submitting: false, ...(values.busy || {}) },
  }
}

export function buildBuildViewModel(input = {}) {
  const state = createBuildState(input)
  return {
    phase: state.phase,
    taskSpec: state.taskSpec || null,
    artifactType: state.artifactType || '',
    evidence: state.evidence,
    currentEvidenceStep: state.currentEvidenceStep || 'setup',
    content: state.content || '',
    fileName: state.fileName || null,
    rubric: Array.isArray(state.rubric) ? state.rubric : [],
    evaluation: state.evaluation || null,
    ui: { showHints: Boolean(state.showHints), ...(state.ui || {}) },
    error: typeof state.error === 'string' ? state.error : state.error ? toPublicError(state.error) : null,
    busy: state.busy,
  }
}

export async function validateBuildImport(file) {
  if (!file || typeof file.name !== 'string' || !Number.isSafeInteger(file.size) || file.size < 0) {
    throw new Error('Choose a valid text file to import.')
  }
  const extension = file.name.toLowerCase().match(/\.[^.]+$/)?.[0] || ''
  if (!ALLOWED_EXTENSIONS.has(extension)) throw new Error('Choose a .txt, .md, .json, or .csv file.')
  if (file.size > MAX_BUILD_IMPORT_BYTES) throw new Error('File too large. Build imports must be 256 KiB or smaller.')
  if (typeof file.arrayBuffer !== 'function') throw new Error('This file could not be read as valid UTF-8 text.')

  let bytes
  try {
    bytes = new Uint8Array(await file.arrayBuffer())
  } catch {
    throw new Error('This file could not be read. Choose it again and try once more.')
  }
  if (bytes.byteLength > MAX_BUILD_IMPORT_BYTES) throw new Error('File too large. Build imports must be 256 KiB or smaller.')

  try {
    return { fileName: file.name, content: new TextDecoder('utf-8', { fatal: true }).decode(bytes) }
  } catch {
    throw new Error('Choose a file encoded as valid UTF-8 text.')
  }
}

export function useBuildController({
  topicId,
  lessonId,
  lesson,
  onPassed,
  getArtifactFn = getArtifact,
  submitArtifactFn = submitArtifact,
  getLocalDateFn = getLocalDate,
} = {}) {
  const [content, setContentValue] = useState('')
  const [evidence, setEvidence] = useState(createBuildState().evidence)
  const [showHints, setShowHints] = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState(null)
  const [fileName, setFileName] = useState(null)
  const [previousContent, setPreviousContent] = useState('')
  const [previousEvidence, setPreviousEvidence] = useState(null)
  const taskSpec = lesson?.task_spec || null

  useEffect(() => {
    let active = true
    getArtifactFn(topicId, lessonId).then((data) => {
      if (!active) return
      if (data.evaluation) {
        setEvaluation({
          overallScore: data.evaluation.overallScore ?? 0,
          passed: data.passed ?? false,
          scores: data.evaluation.scores || {},
          feedback: data.evaluation.feedback || {},
        })
      }
      if (data.content) {
        setContentValue(data.content)
        setPreviousContent(data.content)
      }
    }).catch(() => {})
    return () => { active = false }
  }, [getArtifactFn, lessonId, topicId])

  const setContent = useCallback((value) => {
    setContentValue(value)
    setError(null)
  }, [])

  const setEvidenceField = useCallback((field, value) => {
    if (!['setup', 'actions', 'result', 'reflection'].includes(field)) return
    setEvidence((current) => ({ ...current, [field]: value }))
    setError(null)
  }, [])

  const importFile = useCallback(async (file) => {
    if (!file) return
    try {
      const imported = await validateBuildImport(file)
      setFileName(imported.fileName)
      setContentValue(imported.content)
      setError(null)
    } catch (importError) {
      setError(importError.message)
    }
  }, [])

  const submit = useCallback(async () => {
    const trimmed = content.trim()
    if (taskSpec && Object.values(evidence).some((value) => !value.trim())) {
      setError('Complete all four evidence fields before submitting.')
      return
    }
    if (!taskSpec && !trimmed) {
      setError('Please enter or import your solution before submitting.')
      return
    }
    setSubmitting(true)
    setError(null)
    try {
      const result = await submitArtifactFn(topicId, lessonId, taskSpec ? '' : trimmed, getLocalDateFn(), taskSpec ? evidence : undefined)
      if (result.evaluation) {
        setEvaluation(result.evaluation)
        setPreviousContent(taskSpec ? JSON.stringify(evidence) : trimmed)
        setPreviousEvidence(taskSpec ? { ...evidence } : null)
        if (!evaluation?.passed && result.evaluation.passed && !result.alreadyCompleted) onPassed?.(result)
      }
    } catch (submitError) {
      setError(toPublicError(submitError, taskSpec
        ? 'Could not evaluate this Build. Your evidence is still here. Try again.'
        : 'Could not submit that Build. Your work is still here. Try again.').message)
    } finally {
      setSubmitting(false)
    }
  }, [content, evidence, evaluation?.passed, getLocalDateFn, lessonId, onPassed, submitArtifactFn, taskSpec, topicId])

  const revise = useCallback(() => {
    setEvaluation(null)
    setError(null)
    if (!taskSpec) setContentValue(previousContent)
  }, [previousContent, taskSpec])

  const model = useMemo(() => buildBuildViewModel({
    phase: evaluation ? 'results' : taskSpec ? 'evidence' : 'submission',
    taskSpec,
    artifactType: lesson?.artifact_type || 'code',
    evidence,
    content,
    fileName,
    rubric: ['Correctness', 'Completeness', 'Clarity', 'Edge Cases'],
    evaluation,
    showHints,
    error,
    busy: { loading: false, submitting },
  }), [content, error, evidence, evaluation, fileName, lesson?.artifact_type, showHints, submitting, taskSpec])

  return {
    model,
    previousContent,
    previousEvidence,
    setContent,
    setEvidenceField,
    toggleHints: () => setShowHints((value) => !value),
    importFile,
    submit,
    revise,
  }
}
