import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import QuizPanel from '../components/QuizPanel.jsx'

vi.mock('../api.js', () => ({
  startQuiz: vi.fn(),
  getQuiz: vi.fn(),
  submitQuiz: vi.fn(),
  getLocalDate: vi.fn(() => '2024-06-01'),
}))

import { startQuiz, getQuiz, submitQuiz } from '../api.js'

describe('QuizPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows start quiz prompt when no quiz loaded', async () => {
    getQuiz.mockRejectedValue(new Error('No quiz'))

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/check your understanding/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /start quiz/i })).toBeInTheDocument()
  })

  it('loads existing quiz from server on mount', async () => {
    getQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ],
      answers: {},
      evaluation: null,
    })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('What is JSX?')).toBeInTheDocument()
    })
  })

  it('loads existing evaluation result on mount', async () => {
    getQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ],
      answers: { q1: 'JSX is JavaScript XML.' },
      evaluation: {
        overallScore: 85,
        passed: true,
        criticalGap: false,
        feedback: [
          { questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Correct.' },
        ],
        gaps: [],
      },
    })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/you passed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/85%/)).toBeInTheDocument()
  })

  it('generates quiz on start click', async () => {
    getQuiz.mockRejectedValue(new Error('No quiz'))
    startQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
        { id: 'q2', text: 'Explain hooks.', type: 'Explain', weight: 2 },
      ],
    })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start quiz/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /start quiz/i }))

    await waitFor(() => {
      expect(screen.getByText('What is JSX?')).toBeInTheDocument()
    })
    expect(screen.getByText('Explain hooks.')).toBeInTheDocument()
  })

  it('allows typing answers in textareas', async () => {
    getQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ],
      answers: {},
      evaluation: null,
    })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/type your answer/i)
    fireEvent.change(textarea, { target: { value: 'JSX is JavaScript XML.' } })

    expect(textarea.value).toBe('JSX is JavaScript XML.')
  })

  it('disables submit when no answers filled', async () => {
    getQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ],
      answers: {},
      evaluation: null,
    })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /submit answers/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => {
      expect(screen.getByText(/please answer at least one question/i)).toBeInTheDocument()
    })
  })

  it('submits answers and shows pass result', async () => {
    getQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ],
      answers: {},
      evaluation: null,
    })

    submitQuiz.mockResolvedValue({
      overallScore: 85,
      passed: true,
      criticalGap: false,
      feedback: [
        { questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Correct.' },
      ],
      gaps: [],
    })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/type your answer/i)
    fireEvent.change(textarea, { target: { value: 'JSX is JavaScript XML.' } })

    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => {
      expect(screen.getByText(/you passed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/85%/)).toBeInTheDocument()
  })

  it('submits answers and shows remediation panel on fail', async () => {
    getQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ],
      answers: {},
      evaluation: null,
    })

    submitQuiz.mockResolvedValue({
      overallScore: 60,
      passed: false,
      criticalGap: true,
      feedback: [
        { questionId: 'q1', correctness: 'incorrect', score: 0, explanation: 'Wrong answer.' },
      ],
      gaps: ['Did not understand JSX syntax'],
    })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/type your answer/i)
    fireEvent.change(textarea, { target: { value: 'Wrong' } })

    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => {
      expect(screen.getByText(/not quite/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/did not understand jsx syntax/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /take retest/i })).toBeInTheDocument()
  })

  it('shows back to dashboard button on pass', async () => {
    getQuiz.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is JSX?', type: 'Recall', weight: 1 },
      ],
      answers: {},
      evaluation: null,
    })

    submitQuiz.mockResolvedValue({
      overallScore: 85,
      passed: true,
      criticalGap: false,
      feedback: [
        { questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Correct.' },
      ],
      gaps: [],
    })

    const onBack = vi.fn()
    render(<QuizPanel topicId={1} lessonId={1} onBack={onBack} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'JSX' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /back to dashboard/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /back to dashboard/i }))
    expect(onBack).toHaveBeenCalled()
  })
})
