import { useState, useCallback, useEffect } from 'react'
import { submitArtifact, getArtifact, getLocalDate } from '../api.js'
import StatusBadge from './ui/StatusBadge.jsx'

const RUBRIC_DIMENSIONS = ['Correctness', 'Completeness', 'Clarity', 'Edge Cases']

const SCORE_LABELS = {
  2: 'Strong',
  1: 'Needs Work',
  0: 'Missing',
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

function EvaluationResult({ evaluation, onRevise, artifactContent }) {
  const isPass = evaluation.passed
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <section className={`ui-alert ${isPass ? 'ui-alert-success' : 'ui-alert-warning'} mb-6`} aria-live="polite">
        <div className="flex items-center gap-3 mb-2">
          <div className="text-3xl ui-text">
            {isPass ? '✅' : '❌'}
          </div>
          <div>
            <h2 className="text-lg font-bold ui-text">
              {isPass ? 'Artifact Approved' : 'Needs Revision'}
            </h2>
            <p className="text-sm ui-text-secondary">
              Overall: <span className="font-semibold">{evaluation.overallScore}%</span>
              <span> (passing requires no zeros and ≥70%)</span>
            </p>
          </div>
        </div>
      </section>

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
              {fb && <p className="text-sm ui-text-secondary">{fb}</p>}
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
            Great work! Your artifact has been approved.
          </p>
        </div>
      )}
    </div>
  )
}

export default function ArtifactPanel({ topicId, lessonId, lesson, onBack }) {
  const [content, setContent] = useState('')
  const [evaluation, setEvaluation] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [fileName, setFileName] = useState('')
  const [prevContent, setPrevContent] = useState('')

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
    const trimmed = content.trim()
    if (!trimmed) {
      setError('Please enter or upload your solution before submitting.')
      return
    }

    setLoading(true)
    setError('')
    try {
      const result = await submitArtifact(topicId, lessonId, trimmed, getLocalDate())
      if (result.evaluation) {
        setEvaluation(result.evaluation)
        setPrevContent(trimmed)
      }
    } catch (err) {
      setError(err.message || 'Failed to submit artifact.')
    } finally {
      setLoading(false)
    }
  }, [topicId, lessonId, content])

  const handleRevise = useCallback(() => {
    setEvaluation(null)
    setError('')
    setContent(prevContent)
  }, [prevContent])

  const artifactType = lesson?.artifact_type || 'code'
  const isDesign = artifactType === 'design'
  const placeholder = isDesign
    ? 'Describe your design or upload a file...'
    : artifactType === 'math'
    ? 'Type your math solution here...'
    : 'Paste your code or text solution here...'

  if (evaluation) {
    return (
      <div className="flex-1 overflow-y-auto">
        <EvaluationResult evaluation={evaluation} onRevise={handleRevise} artifactContent={prevContent} />
        {evaluation.passed && (
          <div className="flex justify-center pb-6">
            <button
              onClick={onBack}
              className="rounded-lg bg-indigo-600 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
            >
              Back to Lesson
            </button>
          </div>
        )}
      </div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto">
      <div className="max-w-3xl mx-auto px-4 py-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-gray-900">Submit Artifact</h2>
          {artifactType && (
            <StatusBadge status="progress">
              {artifactType}
            </StatusBadge>
          )}
        </div>

        <RubricPreview />

        {error && (
          <div className="ui-alert ui-alert-danger mb-4" role="alert">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-4">
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
            disabled={loading || !content.trim()}
            className="rounded-lg bg-indigo-600 px-6 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading ? 'Evaluating…' : 'Submit Artifact'}
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
