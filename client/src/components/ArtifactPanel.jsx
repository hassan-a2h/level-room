import { useState, useCallback, useEffect } from 'react'
import { submitArtifact, getArtifact, getLocalDate } from '../api.js'
import StatusBadge from './ui/StatusBadge.jsx'

const RUBRIC_DIMENSIONS = ['Correctness', 'Completeness', 'Clarity', 'Edge Cases']

const SCORE_LABELS = {
  2: 'Strong',
  1: 'Needs Work',
  0: 'Missing',
}

function safeArtifactError(error, fallback) {
  const message = typeof error?.message === 'string' ? error.message.trim() : ''
  if (!message || /sqlite|\bsql\b|database|foreign key|constraint|\btable\b|\bcolumn\b|stack trace|exception/i.test(message)) {
    return fallback
  }
  return message
}

function RubricPreview() {
  return (
    <section className="ui-panel mb-4 p-4" aria-labelledby="artifact-rubric-title">
      <h3 id="artifact-rubric-title" className="text-sm font-semibold ui-text mb-2">Evaluation Rubric</h3>
      <p className="mb-3 text-xs ui-text-secondary" aria-label="Rubric score levels">
        Score levels: <strong>0 — Missing</strong> · <strong>1 — Needs Work</strong> · <strong>2 — Strong</strong>
      </p>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RUBRIC_DIMENSIONS.map((dim) => (
          <div key={dim} className="ui-surface ui-surface-flat rounded-lg p-3">
            <div className="mb-1 text-xs font-medium ui-text-secondary">{dim}</div>
            <div className="text-[11px] ui-text-muted">
              {dim === 'Correctness' && 'Does it work / is it factually correct?'}
              {dim === 'Completeness' && 'Are all required parts included?'}
              {dim === 'Clarity' && 'Is it easy to understand and well structured?'}
              {dim === 'Edge Cases' && 'Does it handle boundary conditions?'}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] ui-text-muted" aria-hidden="true">
              <span className="inline-block w-2 h-2 rounded-sm bg-red-200" />0
              <span className="inline-block w-2 h-2 rounded-sm bg-yellow-200 ml-1" />1
              <span className="inline-block w-2 h-2 rounded-sm bg-green-200 ml-1" />2
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-[11px] ui-text-muted">
        Passing requires no zeros and ≥70% of total points (≥6 / 8).
      </p>
    </section>
  )
}

function ScoreBadge({ score }) {
  const label = SCORE_LABELS[score] || 'Unknown'
  const status = ({ 2: 'success', 1: 'warning', 0: 'danger' })[score] || 'neutral'
  return <StatusBadge status={status}>{score}/2 — {label}</StatusBadge>
}

function EvaluationResult({ evaluation, onRevise, artifactContent, taskEvidence }) {
  const isPass = evaluation.passed
  const heading = taskEvidence ? (isPass ? 'Build complete' : 'Ready to revise') : (isPass ? 'Artifact Approved' : 'Needs Revision')
  const nextStepFor = (score, feedback) => {
    if (score >= 2) return 'Keep this approach in your next Build.'
    if (score === 1) return feedback ? `Strengthen this by addressing: ${feedback}` : 'Add one specific detail to make this stronger.'
    return feedback ? `Start here: ${feedback}` : 'Add a concrete example that demonstrates this skill.'
  }
  return (
    <div className="build-evaluation max-w-3xl mx-auto px-4 py-6">
      <section className={`ui-alert ${isPass ? 'ui-alert-success' : 'ui-alert-warning'} mb-6`} aria-live="polite">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-3xl ui-text">
            {taskEvidence ? (isPass ? '✓' : '↻') : (isPass ? '✅' : '❌')}
          </div>
          <div>
            <h2 className="text-lg font-bold ui-text">
              {heading}
            </h2>
            <p className="text-sm ui-text-secondary">
              Overall: <span className="font-semibold">{evaluation.overallScore}%</span>
              <span> (the checkpoint passes with no missing dimensions and a score of at least 70%)</span>
            </p>
          </div>
        </div>
      </section>

      {taskEvidence && (
        <section className="ui-panel build-submitted-evidence mb-5 p-4" aria-labelledby="submitted-evidence-title">
          <h3 id="submitted-evidence-title" className="text-sm font-semibold ui-text mb-2">Your submitted evidence</h3>
          <dl className="grid gap-3 sm:grid-cols-2">
            {Object.entries(taskEvidence).map(([field, value]) => (
              <div key={field}>
                <dt className="text-xs font-medium ui-text-muted capitalize">{field === 'actions' ? 'Actions taken' : field === 'result' ? 'Observed result' : field}</dt>
                <dd className="mt-1 whitespace-pre-wrap text-sm ui-text-secondary">{value}</dd>
              </div>
            ))}
          </dl>
        </section>
      )}
      {!taskEvidence && artifactContent && (
        <section className="ui-panel build-submitted-evidence mb-5 p-4" aria-label="Your submitted work">
          <h3 className="text-sm font-semibold ui-text mb-2">Your submitted work</h3>
          <pre className="max-h-48 overflow-auto whitespace-pre-wrap text-sm ui-text-secondary">{artifactContent}</pre>
        </section>
      )}

      <div className="space-y-3 mb-6">
        {RUBRIC_DIMENSIONS.map((dim) => {
          const score = evaluation.scores?.[dim] ?? 0
          const fb = evaluation.feedback?.[dim] || ''
          return (
            <section key={dim} className="ui-panel p-4">
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold ui-text">{dim}</span>
                <ScoreBadge score={score} />
              </div>
              <p className="mt-2 text-sm ui-text-secondary"><strong>Evidence:</strong> {fb || 'This dimension was included in the evaluation.'}</p>
              <p className="mt-2 text-sm ui-text-secondary"><strong>Next step:</strong> {nextStepFor(score, fb)}</p>
            </section>
          )
        })}
      </div>

      {!isPass && (
        <div className="flex items-center justify-center gap-3">
          <button
            onClick={onRevise}
            className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
          >
            Revise & Resubmit
          </button>
        </div>
      )}

      {isPass && (
        <div className="flex items-center justify-center">
            <p className="text-sm ui-text-secondary font-medium">
            {taskEvidence ? 'Your Build checkpoint is complete. Continue your Trail.' : 'Great work! Your artifact has been approved.'}
          </p>
        </div>
      )}
    </div>
  )
}

export default function ArtifactPanel({ topicId, lessonId, lesson, onBack }) {
  const [content, setContent] = useState('')
  const [evidence, setEvidence] = useState({ setup: '', actions: '', result: '', reflection: '' })
  const [showHints, setShowHints] = useState(false)
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [prevContent, setPrevContent] = useState('')
  const [prevEvidence, setPrevEvidence] = useState(null)

  // Load existing artifact on mount
  useEffect(() => {
    async function loadArtifact() {
      try {
        const data = await getArtifact(topicId, lessonId)
        if (data.evaluation) {
          setEvaluation({
            overallScore: data.evaluation.overallScore ?? 0,
            passed: data.passed ?? false,
            scores: data.evaluation.scores || {},
            feedback: data.evaluation.feedback || {},
          })
        }
        if (data.content) {
          setContent(data.content)
          setPrevContent(data.content)
        }
      } catch {
        // No prior artifact
      }
    }
    loadArtifact()
  }, [topicId, lessonId])

  const handleFileChange = useCallback((e) => {
    const file = e.target.files[0]
    if (!file) return

    const MAX_FILE_SIZE_MB = 5
    if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
      setError(`File too large (max ${MAX_FILE_SIZE_MB}MB). Please upload a smaller file.`)
      return
    }

    setFileName(file.name)
    setError('')

    const reader = new FileReader()
    reader.onload = (ev) => {
      const text = ev.target.result
      if (typeof text === 'string') {
        setContent(text)
      } else {
        // Binary file — just store a reference
        setContent(`Uploaded: ${file.name}`)
      }
    }
    reader.readAsText(file)
  }, [])

  const handleSubmit = useCallback(async () => {
    const taskSpec = lesson?.task_spec
    const trimmed = content.trim()
    if (taskSpec) {
      if (Object.values(evidence).some((value) => !value.trim())) {
        setError('Complete all four evidence fields before submitting.')
        return
      }
    } else if (!trimmed) {
        setError('Please enter or upload your solution before submitting.')
        return
    }

    setLoading(true)
    setError('')
    try {
      const result = await submitArtifact(topicId, lessonId, taskSpec ? '' : trimmed, getLocalDate(), taskSpec ? evidence : undefined)
      if (result.evaluation) {
        setEvaluation(result.evaluation)
        setPrevContent(taskSpec ? JSON.stringify(evidence) : trimmed)
        setPrevEvidence(taskSpec ? { ...evidence } : null)
      }
    } catch (err) {
      setError(safeArtifactError(err, taskSpec
        ? 'Could not evaluate this Build. Your evidence is still here. Try again.'
        : 'Could not submit that artifact. Your work is still here. Try again.'))
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId, content, evidence, lesson])

  const handleRevise = useCallback(() => {
    setEvaluation(null)
    setError('')
    setContent(prevContent)
  }, [prevContent])

  const artifactType = lesson?.artifact_type || 'code'
  const taskSpec = lesson?.task_spec
  const isDesign = artifactType === 'design'
  const placeholder = isDesign
    ? 'Describe your design or upload a file...'
    : artifactType === 'math'
    ? 'Type your math solution here...'
    : 'Paste your code or text solution here...'

  if (evaluation) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EvaluationResult evaluation={evaluation} onRevise={handleRevise} artifactContent={prevContent} taskEvidence={prevEvidence} />
        {evaluation.passed && (
          <div className="flex justify-center pb-6">
            <button
              onClick={onBack}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              {prevEvidence ? 'Continue Trail' : 'Back to Lesson'}
            </button>
          </div>
        )}
      </div>
    )
  }

  const evidenceComplete = taskSpec && Object.values(evidence).every((value) => value.trim())

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold ui-text">{taskSpec ? 'Build' : 'Submit Artifact'}</h2>
          {artifactType && (
            <StatusBadge status="progress">
              {taskSpec ? 'Build' : artifactType}
            </StatusBadge>
          )}
        </div>

        {taskSpec ? (
          <section className="ui-panel build-brief mb-4 p-4" aria-labelledby="task-title">
            <h3 id="task-title" className="text-base font-semibold ui-text">{taskSpec.title}</h3>
            {Number.isFinite(lesson?.estimated_time) && lesson.estimated_time > 0 && <p className="mt-1 text-xs ui-text-muted">Estimated time: {lesson.estimated_time} minutes</p>}
            <p className="mt-2 text-sm ui-text-secondary">{taskSpec.scenario}</p>
            <p className="mt-2 text-sm ui-text"><strong>Goal:</strong> {taskSpec.goal}</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-3 text-xs ui-text-secondary">
              <div><strong>Constraints</strong><ul className="mt-1 list-disc pl-4">{taskSpec.constraints?.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><strong>Deliverables</strong><ul className="mt-1 list-disc pl-4">{taskSpec.deliverables?.map((item) => <li key={item}>{item}</li>)}</ul></div>
              <div><strong>Success criteria</strong><ul className="mt-1 list-disc pl-4">{taskSpec.success_criteria?.map((item) => <li key={item}>{item}</li>)}</ul></div>
            </div>
            <div className="mt-3 rounded-lg ui-surface ui-surface-flat p-3 text-xs ui-text-secondary">
              <strong>Safe setup:</strong> {taskSpec.primary_setup?.description} ({taskSpec.primary_setup?.kind})
              <br />
              <strong>Fallback:</strong> {taskSpec.free_fallback?.description}
            </div>
            {taskSpec.safety_notes?.length > 0 && <p className="mt-3 text-xs ui-text-muted"><strong>Safety:</strong> {taskSpec.safety_notes.join(' ')}</p>}
            {taskSpec.hints?.length > 0 && (
              <div className="mt-3">
                <button type="button" className="text-xs ui-text-secondary underline" onClick={() => setShowHints((current) => !current)}>
                  {showHints ? 'Hide hints' : 'Show hints'}
                </button>
                {showHints && <ul className="mt-1 list-disc pl-4 text-xs ui-text-secondary">{taskSpec.hints.map((hint) => <li key={hint}>{hint}</li>)}</ul>}
              </div>
            )}
          </section>
        ) : null}

        <RubricPreview />

        {error && (
          <div className="ui-alert ui-alert-danger mb-4" role="alert">
            {error}
          </div>
        )}

        <div className="build-evidence-fields space-y-3 mb-4">
          {taskSpec ? (
            [
              ['setup', 'Setup'],
              ['actions', 'Actions taken'],
              ['result', 'Observed result'],
              ['reflection', 'Reflection'],
            ].map(([field, label]) => (
              <label key={field} className="block ui-field-label">
                {label}
                <textarea
                  aria-label={label}
                  value={evidence[field]}
                  onChange={(e) => { setEvidence((current) => ({ ...current, [field]: e.target.value })); setError('') }}
                  rows={3}
                  disabled={loading}
                  className="ui-field mt-1 w-full resize-none disabled:cursor-not-allowed"
                />
              </label>
            ))
          ) : (
            <>
              <label htmlFor="artifact-submission" className="ui-field-label">Your artifact submission</label>
              <textarea
                id="artifact-submission"
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setError('')
                }}
                placeholder={placeholder}
                rows={isDesign ? 4 : 10}
                disabled={loading}
                className="ui-field w-full resize-none font-mono disabled:cursor-not-allowed"
              />
            </>
          )}

          {isDesign && (
            <div className="flex items-center gap-3">
              <label className="cursor-pointer rounded-lg border border-gray-300 px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors">
                <input
                  type="file"
                  accept="image/*,.pdf,.svg,.png,.jpg,.jpeg,.gif"
                  onChange={handleFileChange}
                  disabled={loading}
                  className="hidden"
                />
                📎 Upload File
              </label>
              {fileName && (
                <span className="text-sm text-gray-600">{fileName}</span>
              )}
              <span className="text-xs text-gray-400">Max 5MB</span>
            </div>
          )}
        </div>

        <div className="flex items-center justify-center gap-3">
          <button
            onClick={handleSubmit}
            disabled={loading || (taskSpec ? !evidenceComplete : !content.trim())}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Evaluating…' : taskSpec ? 'Submit Build' : 'Submit Artifact'}
          </button>
          <button
            onClick={onBack}
            disabled={loading}
            className="rounded-lg border border-gray-300 px-5 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 focus:ring-offset-2 transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  )
}
