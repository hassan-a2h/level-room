import { useState, useCallback, useId } from 'react'

function LessonCard({ lesson }) {
  const [expanded, setExpanded] = useState(false)
  const detailsId = useId()

  return (
    <div className="ui-surface-flat rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setExpanded((v) => !v)}
            className="text-gray-500 hover:text-gray-700 focus:outline-none"
            aria-label={expanded ? 'Collapse lesson details' : 'Expand lesson details'}
            aria-expanded={expanded}
            aria-controls={detailsId}
          >
            {expanded ? '▼' : '▶'}
          </button>
          <span className="font-medium text-gray-900">{lesson.title}</span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-600">
            {lesson.depth}
          </span>
          <span className="text-xs text-gray-500">~{lesson.estimated_time} min</span>
          {lesson.artifact_required && (
            <span className="text-xs font-medium px-2 py-1 rounded-full bg-amber-50 text-amber-700" title="This lesson requires an artifact submission">
              📝 Artifact
            </span>
          )}
        </div>
      </div>

      {expanded && (
        <div id={detailsId} className="mt-3 pl-6 text-sm text-gray-700 space-y-2">
          <div>
            <span className="font-medium text-gray-900">Outcomes:</span>
            <ul className="list-disc list-inside mt-1 space-y-0.5">
              {lesson.outcomes?.map((o, i) => (
                <li key={i}>{o}</li>
              ))}
            </ul>
          </div>
          {lesson.prerequisites && lesson.prerequisites.length > 0 && (
            <div>
              <span className="font-medium text-gray-900">Prerequisites:</span>{' '}
              {lesson.prerequisites.map((pr) => pr.title || `Lesson ${pr.lessonId}`).join(', ')}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function CurriculumConfirmation({
  curriculum,
  onConfirm,
  onTweak,
  onRegenerate,
  onBack,
  submitting,
  error,
}) {
  const [tweakText, setTweakText] = useState('')
  const [showTweakInput, setShowTweakInput] = useState(false)

  const handleTweakSubmit = useCallback(() => {
    if (!tweakText.trim()) return
    onTweak(tweakText.trim())
    setTweakText('')
    setShowTweakInput(false)
  }, [tweakText, onTweak])

  const modules = curriculum?.modules || []

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold ui-text">Your Learning Path</h1>
        <button
          onClick={onBack}
          className="text-sm text-gray-500 hover:text-gray-700 underline"
        >
          Back
        </button>
      </div>

      {error && (
        <div className="ui-alert ui-alert-danger" role="alert">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {modules.map((mod, mi) => (
          <div key={mi} className="space-y-3">
            <h3 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
              <span className="ui-module-number inline-flex items-center justify-center w-7 h-7 rounded-full text-sm font-bold">
                {mi + 1}
              </span>
              {mod.title}
            </h3>
            <div className="space-y-2 pl-9">
              {mod.lessons.map((lesson) => (
                <LessonCard
                  key={lesson.id || lesson.title}
                  lesson={lesson}
                />
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Actions */}
      <div className="ui-curriculum-actions flex flex-col gap-3 pt-4 border-t border-gray-200">
        {!showTweakInput && (
          <div className="flex flex-wrap gap-3">
            <button
              onClick={onConfirm}
              disabled={submitting}
              className="rounded-lg bg-indigo-600 px-6 py-3 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {submitting ? 'Saving...' : 'Accept & Start'}
            </button>
            <button
              onClick={() => setShowTweakInput(true)}
              disabled={submitting}
              className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              Tweak
            </button>
            <button
              onClick={onRegenerate}
              disabled={submitting}
              className="rounded-lg border border-gray-300 px-6 py-3 text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50"
            >
              Regenerate
            </button>
          </div>
        )}

        {showTweakInput && (
          <div className="flex flex-col gap-2">
            <textarea
              value={tweakText}
              onChange={(e) => setTweakText(e.target.value)}
              placeholder="Request changes, e.g., 'Add a module on testing' or 'Make it more beginner-friendly'"
              rows={3}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
            />
            <div className="flex gap-2">
              <button
                onClick={handleTweakSubmit}
                disabled={submitting || !tweakText.trim()}
                className="rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {submitting ? 'Applying...' : 'Apply Tweak'}
              </button>
              <button
                onClick={() => setShowTweakInput(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-gray-700 font-medium hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              >
                Cancel
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
