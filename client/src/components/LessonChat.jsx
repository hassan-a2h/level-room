import { useState, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { getLesson, sendChatMessage, continueLesson, getQuiz } from '../api.js'
import QuizPanel from './QuizPanel.jsx'
import ArtifactPanel from './ArtifactPanel.jsx'
import { SkeletonLesson } from '../components/Skeleton.jsx'
import AppHeader from './AppHeader.jsx'
import MarkdownContent from './MarkdownContent.jsx'

const MAX_MESSAGE_LENGTH = 2000

function LessonHeader({ lesson, progress, interactionMode, onSubmitArtifact }) {
  const modeLabels = {
    code: 'Code',
    scenario: 'Scenario',
    socratic: 'Socratic',
  }

  const quizPassed = progress?.quiz_score !== null && progress?.quiz_score >= 80
  const artifactDone = !!progress?.artifact_passed

  return (
    <div className="border-b border-gray-200 bg-white px-4 py-3 shrink-0">
      <div className="flex items-center gap-3 flex-wrap">
        {lesson.depth && (
          <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">
            {lesson.depth}
          </span>
        )}
        {lesson.estimated_time && (
          <span className="text-xs text-gray-500">~{lesson.estimated_time} min</span>
        )}
        <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs font-medium text-gray-700">
          {modeLabels[interactionMode] || 'Socratic'}
        </span>
        {progress?.state === 'practicing' && (
          <span className="text-xs text-amber-600 font-medium">
            In progress
          </span>
        )}
        {progress?.state === 'quiz_pending' && (
          <span className="text-xs text-indigo-600 font-medium">
            Quiz pending
          </span>
        )}
        {progress?.state === 'remediating' && (
          <span className="text-xs text-red-600 font-medium">
            Remediating
          </span>
        )}
        {progress?.state === 'passed' && (
          <span className="text-xs text-green-600 font-medium">
            Passed
          </span>
        )}
        {lesson?.artifact_required && (
          <>
            <span className="text-xs text-gray-300">|</span>
            {artifactDone ? (
              <span className="text-xs text-green-600 font-medium">Artifact: Passed</span>
            ) : (
              <span className="text-xs text-amber-600 font-medium">Artifact: Pending</span>
            )}
          </>
        )}
        {quizPassed !== undefined && (
          <>
            <span className="text-xs text-gray-300">|</span>
            {quizPassed ? (
              <span className="text-xs text-green-600 font-medium">Quiz: Passed</span>
            ) : (
              <span className="text-xs text-amber-600 font-medium">Quiz: Pending</span>
            )}
          </>
        )}
        {lesson?.artifact_required && !artifactDone && onSubmitArtifact && (
          <button
            onClick={onSubmitArtifact}
            className="rounded-md bg-indigo-600 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-1 focus:ring-indigo-500 transition-colors"
          >
            Submit Artifact
          </button>
        )}
      </div>
    </div>
  )
}

function LockedView({ lesson, prerequisites, onBack }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] px-4">
      <div className="text-5xl mb-4">🔒</div>
      <h2 className="text-xl font-bold text-gray-900 mb-2">{lesson.title} is locked</h2>
      <p className="text-gray-600 mb-4 text-center max-w-md">
        Complete the following prerequisites first:
      </p>
      <ul className="space-y-2 mb-6">
        {prerequisites.map((pr) => (
          <li key={pr.lessonId} className="flex items-center gap-2 text-sm text-gray-700 bg-gray-50 rounded-lg px-3 py-2">
            <span className="text-gray-400">•</span>
            <span>{pr.title}</span>
          </li>
        ))}
      </ul>
      <button
        onClick={onBack}
        className="rounded-lg bg-indigo-600 px-5 py-2.5 text-white font-medium hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 transition-colors"
      >
        Back to Dashboard
      </button>
    </div>
  )
}

function ChatMessage({ message, isStreaming }) {
  const isUser = message.role === 'user'
  const isContinue = message.content === '[Continue]'

  if (isContinue) return null

  return (
    <div className={`flex ${isUser ? 'justify-end' : 'justify-start'} mb-3`}>
      <div
        className={`max-w-[85%] sm:max-w-[75%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser
            ? 'ui-message ui-message-user rounded-br-md'
            : 'ui-message ui-message-tutor rounded-bl-md'
        }`}
      >
        <span className="sr-only">{isUser ? 'You: ' : 'Tutor: '}</span>
        {isUser ? message.content : <MarkdownContent content={message.content} />}
        {isStreaming && (
          <span className="inline-block ml-1 w-1.5 h-4 bg-current opacity-50 animate-pulse" />
        )}
      </div>
    </div>
  )
}

function TypingIndicator() {
  return (
    <div className="flex justify-start mb-3">
      <div className="ui-message ui-message-tutor rounded-2xl rounded-bl-md px-4 py-2.5" role="status" aria-label="Tutor is responding">
        <div className="flex items-center gap-1">
          <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-70" style={{ animationDelay: '0ms' }} />
          <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-70" style={{ animationDelay: '150ms' }} />
          <span className="w-1.5 h-1.5 bg-current rounded-full animate-bounce opacity-70" style={{ animationDelay: '300ms' }} />
        </div>
      </div>
    </div>
  )
}

function ContinueButton({ onClick, disabled }) {
  return (
    <div className="flex justify-start mb-3">
      <button
        onClick={onClick}
        disabled={disabled}
        className="rounded-xl bg-indigo-50 border border-indigo-200 px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        Continue →
      </button>
    </div>
  )
}

function CheckUnderstandingPrompt({ onStartQuiz }) {
  return (
    <div className="flex flex-col items-start mb-4 p-4 bg-green-50 border border-green-200 rounded-xl">
      <p className="text-sm text-green-800 mb-3 font-medium">
        Ready to check your understanding?
      </p>
      <button
        onClick={onStartQuiz}
        className="rounded-lg bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-green-500 focus:ring-offset-2 transition-colors"
      >
        Start Quiz
      </button>
    </div>
  )
}

function EmptyLessonState({ lesson, onBegin }) {
  return (
    <div className="ui-chat-empty flex flex-col items-center justify-center text-center py-12 px-4">
      <div className="text-4xl mb-3" aria-hidden="true">🌱</div>
      <h2 className="text-lg font-semibold ui-text mb-2">Ready to begin {lesson.title}?</h2>
      <p className="ui-text-secondary text-sm max-w-md mb-5">
        Start with a guided overview, or ask the tutor a question about this lesson.
      </p>
      <button
        type="button"
        onClick={onBegin}
        className="ui-button ui-button-primary"
        aria-label="Begin lesson"
      >
        Begin lesson
      </button>
    </div>
  )
}

async function readSSEText(body, onText, onReader) {
  if (!body || typeof body.getReader !== 'function') {
    throw new Error('The tutor response was unavailable. Please retry.')
  }

  const reader = body.getReader()
  onReader?.(reader)
  const decoder = new TextDecoder()
  let buffer = ''
  let fullText = ''

  const processLine = (line) => {
    if (!line.startsWith('data: ')) return
    const raw = line.slice(6)
    let parsed
    try {
      parsed = JSON.parse(raw)
    } catch {
      return
    }
    if (parsed === '[DONE]') return
    if (parsed && typeof parsed === 'object') {
      throw new Error(typeof parsed.message === 'string' ? parsed.message : 'The tutor response could not be completed. Please retry.')
    }
    if (typeof parsed !== 'string') return
    fullText += parsed
    onText(fullText)
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() || ''
    lines.forEach(processLine)
  }
  buffer += decoder.decode()
  if (buffer) processLine(buffer)
  return fullText
}

export default function LessonChat() {
  const { topicId: topicIdParam, lessonId: lessonIdParam } = useParams()
  const navigate = useNavigate()
  const topicId = Number(topicIdParam)
  const lessonId = Number(lessonIdParam)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [lesson, setLesson] = useState(null)
  const [progress, setProgress] = useState(null)
  const [messages, setMessages] = useState([])
  const [interactionMode, setInteractionMode] = useState('socratic')
  const [locked, setLocked] = useState(false)
  const [prerequisites, setPrerequisites] = useState([])
  const [input, setInput] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const [streamText, setStreamText] = useState('')
  const [quizMode, setQuizMode] = useState(false)
  const [artifactMode, setArtifactMode] = useState(false)
  const chatEndRef = useRef(null)
  const abortRef = useRef(null)

  const scrollToBottom = useCallback(() => {
    if (chatEndRef.current && typeof chatEndRef.current.scrollIntoView === 'function') {
      chatEndRef.current.scrollIntoView({ behavior: 'smooth' })
    }
  }, [])

  const loadLesson = useCallback(async () => {
    setLoading(true)
    setError('')
    setQuizMode(false)
    try {
      const data = await getLesson(topicId, lessonId)
      if (data.locked) {
        setLocked(true)
        setPrerequisites(data.prerequisites || [])
        setLesson(data.lesson)
        setLoading(false)
        return
      }
      setLesson(data.lesson)
      setProgress(data.progress)
      setMessages(data.messages || [])
      setInteractionMode(data.interactionMode || 'socratic')
      setLocked(false)

      // If lesson is already in quiz_pending, passed, or remediating, check for existing quiz
      if (['quiz_pending', 'passed', 'remediating'].includes(data.progress?.state)) {
        try {
          const quizData = await getQuiz(topicId, lessonId)
          if (quizData.questions && quizData.questions.length > 0) {
            setQuizMode(true)
          }
        } catch {
          // No quiz yet
        }
      }
    } catch (err) {
      setError(err.message || 'Failed to load lesson.')
    }
    setLoading(false)
  }, [topicId, lessonId])

  useEffect(() => {
    loadLesson()
  }, [loadLesson])

  useEffect(() => {
    scrollToBottom()
  }, [messages, streamText, scrollToBottom])

  const handleSend = useCallback(async (message = input) => {
    const requestedMessage = typeof message === 'string' ? message : input
    const trimmed = requestedMessage.trim()
    if (!trimmed || trimmed.length > MAX_MESSAGE_LENGTH) return
    if (isStreaming) return

    setInput('')
    setError('')
    setMessages((prev) => [...prev, { role: 'user', content: trimmed, id: Date.now() }])
    setIsStreaming(true)
    setStreamText('')

    try {
      const res = await sendChatMessage(topicId, lessonId, trimmed)
      const fullText = await readSSEText(res.body, setStreamText, (reader) => {
        abortRef.current = reader
      })

      if (fullText.trim()) {
        setMessages((prev) => [...prev, { role: 'assistant', content: fullText.trim(), id: Date.now() }])
      }
      setStreamText('')
      setProgress((prev) => (prev ? { ...prev, current_chunk: (prev.current_chunk || 0) + 1 } : prev))
    } catch (err) {
      setError(err.message || 'Failed to send message.')
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [input, isStreaming, topicId, lessonId])

  const handleBeginLesson = useCallback(() => {
    handleSend('Begin this lesson with a concise overview, then give me the first practical task.')
  }, [handleSend])

  const handleContinue = useCallback(async () => {
    if (isStreaming) return
    setIsStreaming(true)
    setStreamText('')
    setError('')

    try {
      const res = await continueLesson(topicId, lessonId)
      const fullText = await readSSEText(res.body, setStreamText, (reader) => {
        abortRef.current = reader
      })

      if (fullText.trim()) {
        setMessages((prev) => [...prev, { role: 'assistant', content: fullText.trim(), id: Date.now() }])
      }
      setStreamText('')
      setProgress((prev) => (prev ? { ...prev, current_chunk: (prev.current_chunk || 0) + 1 } : prev))
    } catch (err) {
      setError(err.message || 'Failed to continue lesson.')
    } finally {
      setIsStreaming(false)
      abortRef.current = null
    }
  }, [isStreaming, topicId, lessonId])

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        handleSend()
      }
    },
    [handleSend]
  )

  const handleInputChange = useCallback((e) => {
    const val = e.target.value
    if (val.length > MAX_MESSAGE_LENGTH) {
      setInput(val.slice(0, MAX_MESSAGE_LENGTH))
    } else {
      setInput(val)
    }
  }, [])

  const isFinalChunk = progress && progress.current_chunk >= progress.total_chunks
  const lastMessageIsAssistant = messages.length > 0 && messages[messages.length - 1].role === 'assistant'
  const showContinue = !isStreaming && !isFinalChunk && lastMessageIsAssistant && progress?.state === 'practicing'
  const showQuizPrompt = !isStreaming && isFinalChunk && lastMessageIsAssistant && progress?.state === 'practicing'
  const apiKeyError = error.toLowerCase().includes('api key')
  const lessonDetail = [lesson?.module_title, progress?.total_chunks ? `Part ${progress.current_chunk || 0} of ${progress.total_chunks}` : null]
    .filter(Boolean)
    .join(' · ')

  const handleStartQuiz = useCallback(() => {
    setQuizMode(true)
  }, [])

  const handleStartArtifact = useCallback(() => {
    setArtifactMode(true)
  }, [])

  const handleArtifactBack = useCallback(() => {
    setArtifactMode(false)
    // Refresh lesson state
    loadLesson()
  }, [loadLesson])

  if (loading) {
    return <SkeletonLesson />
  }

  if (locked && lesson) {
    return (
      <div className="ui-page min-h-screen">
        <AppHeader variant="focus" title={lesson.title} detail={lesson.module_title} returnTo="/" returnLabel="Dashboard" />
        <main className="max-w-3xl mx-auto">
          <LockedView lesson={lesson} prerequisites={prerequisites} onBack={() => navigate('/')} />
        </main>
      </div>
    )
  }

  return (
    <div className="ui-page min-h-screen flex flex-col">
      <AppHeader variant="focus" title={lesson?.title || 'Lesson'} detail={lessonDetail} returnTo="/" returnLabel="Dashboard" />

      {/* Lesson metadata */}
      {lesson && (
        <LessonHeader lesson={lesson} progress={progress} interactionMode={interactionMode} onSubmitArtifact={lesson?.artifact_required ? handleStartArtifact : undefined} />
      )}

      {/* No LLM key configured warning */}
      {apiKeyError && (
        <div className="max-w-3xl mx-auto px-4 mt-3 w-full">
          <div className="ui-alert ui-alert-warning flex flex-wrap items-center gap-2" role="alert">
            <span>{error}</span>
            <button
              onClick={() => navigate('/settings')}
              className="ml-2 underline font-medium"
            >
              Go to Settings → LLM
            </button>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && !apiKeyError && (
        <div className="max-w-3xl mx-auto px-4 mt-3 w-full">
          <div className="ui-alert ui-alert-danger flex items-center justify-between gap-3" role="alert">
            <span>{error}</span>
            <button
              onClick={() => setError('')}
              className="text-xs ml-2 underline ui-text-link"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}

      {quizMode ? (
        <QuizPanel topicId={topicId} lessonId={lessonId} onBack={() => navigate('/')} />
      ) : artifactMode ? (
        <ArtifactPanel topicId={topicId} lessonId={lessonId} lesson={lesson} onBack={handleArtifactBack} />
      ) : (
        <>
          {/* Chat area */}
          <div className="flex-1 overflow-y-auto px-4 py-4" role="log" aria-live="polite" aria-label="Lesson chat">
            <div className="max-w-3xl mx-auto">
              {messages.length === 0 && !isStreaming && lesson && ['not_started', 'practicing'].includes(progress?.state) && (
                <EmptyLessonState lesson={lesson} onBegin={handleBeginLesson} />
              )}
              {messages.map((msg, idx) => (
                <ChatMessage
                  key={msg.id || idx}
                  message={msg}
                  isStreaming={false}
                />
              ))}
              {isStreaming && streamText && (
                <ChatMessage
                  message={{ role: 'assistant', content: streamText }}
                  isStreaming={true}
                />
              )}
              {isStreaming && !streamText && <TypingIndicator />}
              {showContinue && (
                <ContinueButton onClick={handleContinue} disabled={isStreaming} />
              )}
              {showQuizPrompt && (
                <CheckUnderstandingPrompt onStartQuiz={handleStartQuiz} />
              )}
              <div ref={chatEndRef} />
            </div>
          </div>

          {/* Input area */}
          <div className="ui-composer border-t border-gray-200 bg-white px-4 py-3 shrink-0">
            <div className="max-w-3xl mx-auto flex items-end gap-2">
              <div className="flex-1 relative">
                <textarea
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Type a message..."
                  rows={1}
                  maxLength={MAX_MESSAGE_LENGTH}
                  disabled={isStreaming || locked}
                  className="w-full rounded-xl border border-gray-300 px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 resize-none disabled:bg-gray-100 disabled:cursor-not-allowed"
                  style={{ minHeight: '44px', maxHeight: '120px' }}
                />
                <div className="absolute right-2 bottom-2 text-[10px] text-gray-400 pointer-events-none">
                  {input.length}/{MAX_MESSAGE_LENGTH}
                </div>
              </div>
              <button
                onClick={handleSend}
                disabled={isStreaming || !input.trim() || locked}
                className="rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shrink-0"
                aria-label="Send message"
              >
                Send
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
