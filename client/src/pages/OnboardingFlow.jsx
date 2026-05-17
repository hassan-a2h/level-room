import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  createTopic,
  getSetupQuestions,
  saveProfile,
  generateCurriculum,
  confirmCurriculum,
  getSettings,
} from '../api.js'
import CurriculumConfirmation from './CurriculumConfirmation.jsx'

function sanitizeTopic(name) {
  // Basic XSS sanitization: strip script tags and dangerous attributes
  return name
    .replace(/<script[^>]*>.*?<\/script>/gi, '')
    .replace(/<[^>]+>/g, '')
    .trim()
}

export default function OnboardingFlow() {
  const navigate = useNavigate()
  const [step, setStep] = useState('topic_input')
  const [topicName, setTopicName] = useState('')
  const [topicId, setTopicId] = useState(null)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [questions, setQuestions] = useState([])
  const [answers, setAnswers] = useState({})
  const [generating, setGenerating] = useState(false)
  const [curriculum, setCurriculum] = useState(null)
  const [llmConfigured, setLlmConfigured] = useState(true)
  const sseRef = useRef(null)

  // Check LLM configuration on mount
  useEffect(() => {
    async function check() {
      try {
        const settings = await getSettings()
        if (!settings.apiKeySet) {
          setLlmConfigured(false)
        }
      } catch {
        setLlmConfigured(false)
      }
    }
    check()
  }, [])

  const handleTopicSubmit = useCallback(
    async (e) => {
      e.preventDefault()
      setError('')
      const trimmed = sanitizeTopic(topicName)
      if (!trimmed || trimmed.length === 0) {
        setError('Please enter a topic.')
        return
      }
      if (trimmed.length > 100) {
        setError('Topic name is too long (max 100 characters).')
        return
      }
      setSubmitting(true)
      try {
        const result = await createTopic(trimmed)
        setTopicId(result.topic.id)
        setTopicName(trimmed)
        setStep('setup_questions')
      } catch (err) {
        setError(err.message || 'Failed to create topic.')
      } finally {
        setSubmitting(false)
      }
    },
    [topicName]
  )

  const loadQuestions = useCallback(async () => {
    if (!topicId) return
    try {
      const data = await getSetupQuestions(topicId)
      setQuestions(data.questions || [])
    } catch (err) {
      setError(err.message || 'Failed to load setup questions.')
    }
  }, [topicId])

  useEffect(() => {
    if (step === 'setup_questions' && topicId) {
      loadQuestions()
    }
  }, [step, topicId, loadQuestions])

  const handleAnswerChange = (questionIndex, value) => {
    setAnswers((prev) => ({ ...prev, [questionIndex]: value }))
  }

  const handleProfileSubmit = useCallback(async () => {
    setError('')
    if (questions.length > 0 && !answers[0]) {
      setError('Please answer all questions.')
      return
    }
    if (questions.length > 1 && !answers[1]) {
      setError('Please answer all questions.')
      return
    }

    // Map answers to level and time commitment
    const level = answers[0] || 'Beginner'
    const timeCommitment = answers[1] || '30 min/day'

    setSubmitting(true)
    try {
      await saveProfile(topicId, { level, timeCommitment })
      setStep('generating')
    } catch (err) {
      setError(err.message || 'Failed to save profile.')
    } finally {
      setSubmitting(false)
    }
  }, [topicId, questions, answers])

  const handleGenerate = useCallback(async () => {
    setGenerating(true)
    setError('')
    setCurriculum(null)
    try {
      const res = await generateCurriculum(topicId)
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
      }

      // Parse SSE events
      const lines = buffer.split('\n')
      let fullText = ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const parsed = JSON.parse(payload)
            if (typeof parsed === 'string') {
              fullText += parsed
            }
          } catch {
            // ignore malformed lines
          }
        }
      }

      // Clean markdown fences
      fullText = fullText.replace(/```json/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(fullText)
      setCurriculum(parsed)
      setStep('confirmation')
    } catch (err) {
      setError(err.message || 'Failed to generate curriculum. Please check your API key and try again.')
      setStep('setup_questions')
    } finally {
      setGenerating(false)
    }
  }, [topicId])

  useEffect(() => {
    if (step === 'generating') {
      handleGenerate()
    }
  }, [step, handleGenerate])

  const handleConfirm = useCallback(async () => {
    setSubmitting(true)
    setError('')
    try {
      await confirmCurriculum(topicId, curriculum)
      navigate('/')
    } catch (err) {
      setError(err.message || 'Failed to confirm curriculum.')
    } finally {
      setSubmitting(false)
    }
  }, [topicId, curriculum, navigate])

  const handleTweak = useCallback(
    async (request) => {
      setSubmitting(true)
      setError('')
      try {
        const res = await fetch(`http://localhost:3200/api/topics/${topicId}/curriculum/tweak`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ request }),
        })
        const body = await res.json().catch(() => ({}))
        if (!res.ok) {
          throw new Error(body.error || `HTTP ${res.status}`)
        }
        setCurriculum(body)
      } catch (err) {
        setError(err.message || 'Failed to tweak curriculum.')
      } finally {
        setSubmitting(false)
      }
    },
    [topicId]
  )

  const handleRegenerate = useCallback(async () => {
    setStep('generating')
    setCurriculum(null)
    setError('')
    try {
      const res = await fetch(`http://localhost:3200/api/topics/${topicId}/curriculum/regenerate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      })
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
      }

      const lines = buffer.split('\n')
      let fullText = ''
      for (const line of lines) {
        if (line.startsWith('data: ')) {
          const payload = line.slice(6)
          if (payload === '[DONE]') continue
          try {
            const parsed = JSON.parse(payload)
            if (typeof parsed === 'string') {
              fullText += parsed
            }
          } catch {
            // ignore
          }
        }
      }

      fullText = fullText.replace(/```json/g, '').replace(/```/g, '').trim()
      const parsed = JSON.parse(fullText)
      setCurriculum(parsed)
      setStep('confirmation')
    } catch (err) {
      setError(err.message || 'Failed to regenerate curriculum.')
      setStep('confirmation')
    }
  }, [topicId])

  const handleBack = () => {
    if (step === 'setup_questions') {
      setStep('topic_input')
    } else if (step === 'confirmation') {
      setStep('setup_questions')
    }
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
          <h1 className="text-xl font-bold text-gray-900">Mastery Roadmap</h1>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-8">
        {/* LLM not configured banner */}
        {!llmConfigured && (
          <div className="mb-6 rounded-lg bg-yellow-50 border border-yellow-200 p-4 text-sm text-yellow-800" role="alert">
            You need an API key to generate lessons.
            <button
              onClick={() => navigate('/settings')}
              className="ml-2 underline font-medium"
            >
              Go to Settings → LLM to add one
            </button>
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg bg-red-50 border border-red-200 p-4 text-sm text-red-700" role="alert">
            {error}
            {step === 'generating' && (
              <div className="mt-2">
                <button
                  onClick={() => setStep('setup_questions')}
                  className="text-sm underline font-medium"
                >
                  Back to questions
                </button>
              </div>
            )}
          </div>
        )}

        {/* Step 1: Topic Input */}
        {step === 'topic_input' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <h2 className="text-3xl font-bold text-gray-900 mb-2">What do you want to learn?</h2>
            <p className="text-gray-600 mb-8 text-center max-w-md">
              Enter any topic — React, Calculus, Negotiation, Japanese — and we will build a personalized learning path.
            </p>
            <form onSubmit={handleTopicSubmit} className="w-full max-w-md">
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={topicName}
                  onChange={(e) => setTopicName(e.target.value)}
                  placeholder="Enter a topic (e.g., React, Calculus)"
                  maxLength={100}
                  className="w-full rounded-lg border border-gray-300 px-4 py-3 text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-200 focus:outline-none"
                  disabled={submitting}
                  autoFocus
                />
                {error && step === 'topic_input' && (
                  <p className="text-sm text-red-600" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={submitting}
                  className="mt-2 w-full rounded-lg bg-indigo-600 px-4 py-3 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Creating...' : 'Start Learning'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Step 2: Setup Questions */}
        {step === 'setup_questions' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <h2 className="text-2xl font-bold text-gray-900 mb-2 max-w-full truncate">Quick setup for {topicName}</h2>
            <p className="text-gray-600 mb-6 text-center max-w-md">
              Answer 1–2 quick questions so we can tailor your learning path.
            </p>

            <div className="w-full max-w-md space-y-6">
              {questions.map((q, i) => (
                <div key={i} className="bg-white rounded-lg border border-gray-200 p-4">
                  <p className="font-medium text-gray-900 mb-3">{q.text}</p>
                  <div className="flex flex-wrap gap-2">
                    {q.options.map((opt) => (
                      <button
                        key={opt}
                        onClick={() => handleAnswerChange(i, opt)}
                        className={`rounded-md border px-3 py-2 text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                          answers[i] === opt
                            ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                            : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        {opt}
                      </button>
                    ))}
                  </div>
                </div>
              ))}

              {questions.length === 0 && (
                <div className="text-gray-500 text-center">Loading questions...</div>
              )}

              <div className="flex items-center gap-3">
                <button
                  onClick={handleBack}
                  className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  Back
                </button>
                <button
                  onClick={handleProfileSubmit}
                  disabled={submitting || questions.length === 0}
                  className="flex-1 rounded-lg bg-indigo-600 px-4 py-2 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  {submitting ? 'Saving...' : 'Continue'}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Generating */}
        {step === 'generating' && (
          <div className="flex flex-col items-center justify-center min-h-[50vh]">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">Designing your learning path...</h2>
            <p className="text-gray-600 text-center max-w-md">
              Our AI tutor is building a personalized curriculum with modules, lessons, and skill checks.
              This takes about 30–60 seconds.
            </p>
          </div>
        )}

        {/* Step 4: Confirmation */}
        {step === 'confirmation' && curriculum && (
          <CurriculumConfirmation
            topicId={topicId}
            curriculum={curriculum}
            onConfirm={handleConfirm}
            onTweak={handleTweak}
            onRegenerate={handleRegenerate}
            onBack={handleBack}
            submitting={submitting}
            error={error}
          />
        )}
      </main>
    </div>
  )
}
