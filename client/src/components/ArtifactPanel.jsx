import { useState, useCallback, useEffect } from 'react'
import { submitArtifact, getArtifact, getLocalDate } from '../api.js'

const RUBRIC_DIMENSIONS = ['Correctness', 'Completeness', 'Clarity', 'Edge Cases']

const SCORE_COLORS = {
  2: 'bg-green-100 text-green-800',
  1: 'bg-yellow-100 text-yellow-800',
  0: 'bg-red-100 text-red-800',
}

const SCORE_LABELS = {
  2: 'Strong',
  1: 'Needs Work',
  0: 'Missing',
}

function RubricPreview() {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-4 mb-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Evaluation Rubric</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {RUBRIC_DIMENSIONS.map((dim) => (
          <div key={dim} className="rounded-lg bg-gray-50 p-3">
            <div className="text-xs font-medium text-gray-700 mb-1">{dim}</div>
            <div className="text-[11px] text-gray-500">
              {dim === 'Correctness' && 'Does it work / is it factually correct?'}
              {dim === 'Completeness' && 'Are all required parts included?'}
              {dim === 'Clarity' && 'Is it easy to understand and well structured?'}
              {dim === 'Edge Cases' && 'Does it handle boundary conditions?'}
            </div>
            <div className="mt-1.5 flex items-center gap-1 text-[10px] text-gray-400">
              <span className="inline-block w-2 h-2 rounded-sm bg-red-200" />0
              <span className="inline-block w-2 h-2 rounded-sm bg-yellow-200 ml-1" />1
              <span className="inline-block w-2 h-2 rounded-sm bg-green-200 ml-1" />2
            </div>
          </div>
        ))}
      </div>
      <p className="text-[11px] text-gray-500 mt-3">
        Passing requires no zeros and ≥70% of total points (≥6 / 8).
      </p>
    </div>
  )
}

function ScoreBadge({ score }) {
  const colorClass = SCORE_COLORS[score] || SCORE_COLORS[0]
  const label = SCORE_LABELS[score] || 'Unknown'
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${colorClass}`}>
      {score}/2 — {label}
    </span>
  )
}

function EvaluationResult({ evaluation, onRevise, artifactContent }) {
  const isPass = evaluation.passed
  return (
    <div className="max-w-3xl mx-auto px-4 py-6">
      <div className={`rounded-xl border p-6 mb-6 ${isPass ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
        <div className="flex items-center gap-3 mb-2">
          <div className={`text-3xl ${isPass ? 'text-green-600' : 'text-red-600'}`}>
            {isPass ? '✅' : '❌'}
          </div>
          <div>
            <h2 className={`text-lg font-bold ${isPass ? 'text-green-900' : 'text-red-900'}`}>
              {isPass ? 'Artifact Approved' : 'Needs Revision'}
            </h2>
            <p className={`text-sm ${isPass ? 'text-green-700' : 'text-red-700'}`}>
              Overall: <span className="font-semibold">{evaluation.overallScore}%</span>
              {' '}(passing requires no zeros and ≥70%)
            </p>
          </div>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        {RUBRIC_DIMENSIONS.map((dim) => {
          const score = evaluation.scores?.[dim] ?? 0
          const fb = evaluation.feedback?.[dim] || ''
          return (
            <div key={dim} className={`rounded-xl border p-4 ${score === 0 ? 'border-red-200 bg-red-50' : score === 1 ? 'border-yellow-200 bg-yellow-50' : 'border-green-200 bg-green-50'}`}>
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-gray-900">{dim}</span>
                <ScoreBadge score={score} />
              </div>
              {fb && <p className="text-sm text-gray-700">{fb}</p>}
            </div>
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
          <p className="text-sm text-green-700 font-medium">
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
            <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
              {artifactType}
            </span>
          )}
        </div>

        <RubricPreview />

        {error && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700 mb-4" role="alert">
            {error}
          </div>
        )}

        <div className="space-y-3 mb-4">
          <textarea
            value={content}
            onChange={(e) => {
              setContent(e.target.value)
              setError('')
            }}
            placeholder={placeholder}
            rows={isDesign ? 4 : 10}
            disabled={loading}
            className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none disabled:bg-gray-50 disabled:cursor-not-allowed font-mono"
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
