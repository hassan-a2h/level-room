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

  it('renders mixed questions accessibly and submits the attempt id', async () => {
    getQuiz.mockResolvedValue({
      attemptId: 42,
      formatVersion: 2,
      questions: [
        { id: 'mc1', format: 'multiple_choice', category: 'Recall', prompt: 'Which command lists files?', options: [{ id: 'a', text: 'ls' }, { id: 'b', text: 'pwd' }], weight: 1 },
        { id: 'mc2', format: 'multiple_choice', category: 'Apply', prompt: 'Which command prints the directory?', options: [{ id: 'a', text: 'pwd' }, { id: 'b', text: 'cd' }], weight: 1 },
        { id: 'wr1', format: 'written', category: 'Explain', prompt: 'Explain why.', max_words: 80, weight: 2 },
        { id: 'wr2', format: 'written', category: 'Transfer', prompt: 'How would you verify?', max_words: 80, weight: 2 },
      ],
      answers: {},
      evaluation: null,
    })
    submitQuiz.mockResolvedValue({ overallScore: 100, passed: true, feedback: [], gaps: [] })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => expect(screen.getByText('Which command lists files?')).toBeInTheDocument())
    expect(screen.getAllByRole('radio')).toHaveLength(4)
    expect(screen.getAllByText(/under 80 words/i)).toHaveLength(2)
    const radios = screen.getAllByRole('radio')
    fireEvent.click(radios[0])
    fireEvent.click(radios[2])
    const textareas = screen.getAllByPlaceholderText(/type your answer/i)
    fireEvent.change(textareas[0], { target: { value: 'Explain clearly.' } })
    fireEvent.change(textareas[1], { target: { value: 'Verify locally.' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => expect(screen.getByText(/you passed/i)).toBeInTheDocument())
    expect(submitQuiz).toHaveBeenCalledWith(1, 1, { mc1: 'a', mc2: 'a', wr1: 'Explain clearly.', wr2: 'Verify locally.' }, '2024-06-01', 42)
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
      answers: { removedQuestion: 'An old answer from a previous quiz version.' },
      evaluation: null,
    })

    render(<QuizPanel topicId={1} lessonId={1} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    const textarea = screen.getByPlaceholderText(/type your answer/i)
    expect(screen.getByRole('progressbar', { name: 'Quiz questions answered' })).toHaveAttribute('aria-valuenow', '0')
    expect(screen.getByText('Not answered')).toHaveAttribute('data-status', 'neutral')
    fireEvent.change(textarea, { target: { value: 'JSX is JavaScript XML.' } })

    expect(textarea.value).toBe('JSX is JavaScript XML.')
    expect(screen.getByRole('progressbar', { name: 'Quiz questions answered' })).toHaveAttribute('aria-valuenow', '1')
    expect(screen.getByText('Answered')).toHaveAttribute('data-status', 'progress')
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
    expect(screen.getByRole('textbox', { name: /what is jsx/i })).toBeInTheDocument()

    const textarea = screen.getByPlaceholderText(/type your answer/i)
    fireEvent.change(textarea, { target: { value: 'JSX is JavaScript XML.' } })

    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => {
      expect(screen.getByText(/you passed/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/85%/)).toBeInTheDocument()
    expect(screen.getByText('Correct')).toHaveAttribute('data-status', 'success')
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
