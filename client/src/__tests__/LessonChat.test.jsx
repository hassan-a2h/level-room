import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import LessonChat from '../components/LessonChat'

vi.mock('../api.js', () => ({
  getLesson: vi.fn(),
  sendChatMessage: vi.fn(),
  continueLesson: vi.fn(),
  getQuiz: vi.fn(),
}))

import { getLesson, sendChatMessage, continueLesson } from '../api.js'

function createMockSSEStream(chunks) {
  const encoder = new TextEncoder()
  const data = chunks.map((c) => `data: ${JSON.stringify(c)}\n\n`).join('') + 'data: "[DONE]"\n\n'
  let offset = 0
  return {
    getReader: () => ({
      read: () => {
        if (offset >= data.length) {
          return Promise.resolve({ done: true })
        }
        const chunk = data.slice(offset, offset + 64)
        offset += 64
        return Promise.resolve({ done: false, value: encoder.encode(chunk) })
      },
      cancel: vi.fn(),
    }),
  }
}

function createRawSSEStream(raw) {
  const encoder = new TextEncoder()
  let sent = false
  return {
    getReader: () => ({
      read: () => {
        if (sent) return Promise.resolve({ done: true })
        sent = true
        return Promise.resolve({ done: false, value: encoder.encode(raw) })
      },
      cancel: vi.fn(),
    }),
  }
}

describe('LessonChat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows lesson header with metadata', async () => {
    getLesson.mockResolvedValue({
      lesson: {
        id: 1,
        title: 'JSX',
        depth: 'Beginner',
        estimated_time: 10,
        outcomes: ['Understand JSX syntax'],
        module_title: 'Basics',
      },
      progress: { state: 'not_started', current_chunk: 0, total_chunks: 3 },
      messages: [],
      interactionMode: 'code',
      locked: false,
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('JSX')).toBeInTheDocument()
    })
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toBeInTheDocument()
    expect(screen.getByText(/Beginner/i)).toBeInTheDocument()
    expect(screen.getByText(/10 min/i)).toBeInTheDocument()
  })

  it('shows a clear start action for a new lesson instead of an empty chat', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'not_started', current_chunk: 0, total_chunks: 3 },
      messages: [],
      interactionMode: 'code',
      locked: false,
    })
    sendChatMessage.mockResolvedValue({
      body: createMockSSEStream(['Welcome to JSX.']),
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /begin lesson/i })).toBeInTheDocument()
    })
    expect(screen.getByText(/ready to begin/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /begin lesson/i }))
    await waitFor(() => {
      expect(sendChatMessage).toHaveBeenCalledWith(1, 1, expect.stringContaining('Begin this lesson'))
      expect(screen.getByText('Welcome to JSX.')).toBeInTheDocument()
    })
  })

  it('shows locked state when prerequisites are unmet', async () => {
    getLesson.mockResolvedValue({
      locked: true,
      prerequisites: [{ lessonId: 1, title: 'Components' }],
      unmetPrerequisites: [{ lessonId: 1, title: 'Components' }],
      lesson: { id: 2, title: 'Hooks', depth: 'Intermediate', module_title: 'Basics' },
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/2']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/locked/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/Components/i)).toBeInTheDocument()
  })

  it('sends a message and shows it in chat history', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'practicing', current_chunk: 1, total_chunks: 3 },
      messages: [],
      interactionMode: 'code',
      locked: false,
    })

    sendChatMessage.mockResolvedValue({
      body: createMockSSEStream(['Welcome ', 'to ', 'JSX!']),
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: 'What is JSX?' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    await waitFor(() => {
      expect(screen.getByText('What is JSX?')).toBeInTheDocument()
    })
    expect(screen.getByRole('log', { name: 'Lesson chat' })).toHaveTextContent('You: What is JSX?')
  })

  it('shows Continue button after tutor chunk', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'practicing', current_chunk: 1, total_chunks: 3 },
      messages: [
        { id: 1, role: 'assistant', content: 'JSX is a syntax extension for JavaScript.' },
      ],
      interactionMode: 'code',
      locked: false,
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/JSX is a syntax extension/i)).toBeInTheDocument()
    })

    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument()
  })

  it('blocks empty messages', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'practicing', current_chunk: 1, total_chunks: 3 },
      messages: [],
      interactionMode: 'code',
      locked: false,
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(input, { target: { value: '   ' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    // No new user message should appear
    expect(screen.queryByText(/What is/i)).not.toBeInTheDocument()
  })

  it('shows chat history on load when messages exist', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'practicing', current_chunk: 2, total_chunks: 3 },
      messages: [
        { id: 1, role: 'assistant', content: 'Welcome to JSX!' },
        { id: 2, role: 'user', content: 'What does JSX stand for?' },
        { id: 3, role: 'assistant', content: 'JavaScript XML.' },
      ],
      interactionMode: 'code',
      locked: false,
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Welcome to JSX!')).toBeInTheDocument()
    })
    expect(screen.getByText('What does JSX stand for?')).toBeInTheDocument()
    expect(screen.getByText('JavaScript XML.')).toBeInTheDocument()
  })

  it('shows Check Your Understanding prompt on final chunk', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'practicing', current_chunk: 3, total_chunks: 3 },
      messages: [
        { id: 1, role: 'assistant', content: 'Now you know the basics of JSX!' },
      ],
      interactionMode: 'code',
      locked: false,
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/check your understanding/i)).toBeInTheDocument()
    })
  })

  it('enters quiz mode when Start Quiz is clicked', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'practicing', current_chunk: 3, total_chunks: 3 },
      messages: [
        { id: 1, role: 'assistant', content: 'Now you know the basics of JSX!' },
      ],
      interactionMode: 'code',
      locked: false,
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/check your understanding/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /start quiz/i }))

    await waitFor(() => {
      expect(screen.getByText(/check your understanding/i)).toBeInTheDocument()
    })
  })

  it('enters quiz mode automatically if lesson state is quiz_pending', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'quiz_pending', current_chunk: 3, total_chunks: 3 },
      messages: [
        { id: 1, role: 'assistant', content: 'Now you know the basics of JSX!' },
      ],
      interactionMode: 'code',
      locked: false,
    })

    const { getQuiz } = await import('../api.js')
    getQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ],
      answers: {},
      evaluation: null,
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('What is JSX?')).toBeInTheDocument()
    })
  })

  it('limits message input to 2000 characters', async () => {
    getLesson.mockResolvedValue({
      lesson: { id: 1, title: 'JSX', depth: 'Beginner', estimated_time: 10, module_title: 'Basics' },
      progress: { state: 'practicing', current_chunk: 1, total_chunks: 3 },
      messages: [],
      interactionMode: 'code',
      locked: false,
    })

    render(
      <MemoryRouter initialEntries={['/topic/1/lesson/1']}>
        <Routes>
          <Route path="/topic/:topicId/lesson/:lessonId" element={<LessonChat />} />
        </Routes>
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type a message/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/type a message/i)
    const longText = 'x'.repeat(2001)
    fireEvent.change(input, { target: { value: longText } })
    expect(input.value).toHaveLength(2000)
  })
})
