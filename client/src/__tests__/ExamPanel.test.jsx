import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import ExamPanel from '../components/ExamPanel.jsx'

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => vi.fn() }
})

vi.mock('../api.js', () => ({
  getExam: vi.fn(),
  startExam: vi.fn(),
  saveExamProgress: vi.fn(() => Promise.resolve({})),
  submitExam: vi.fn(),
  retakeExam: vi.fn(),
  startPartialRetest: vi.fn(),
  submitPartialRetest: vi.fn(),
}))

import {
  getExam,
  startExam,
  submitExam,
  retakeExam,
  startPartialRetest,
} from '../api.js'

describe('ExamPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows start exam prompt when no exam loaded', async () => {
    getExam.mockRejectedValue(new Error('No exam started'))

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/module exam/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('button', { name: /start exam/i })).toBeInTheDocument()
  })

  it('loads existing exam with answers on mount', async () => {
    getExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'What is React?', type: 'conceptual', weight: 1, lessonId: 1 },
      ],
      answers: { q1: 'A library' },
      status: 'pending',
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[{ id: 1, title: 'JSX' }]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('What is React?')).toBeInTheDocument()
    })
    const textarea = screen.getByPlaceholderText(/type your answer/i)
    expect(textarea.value).toBe('A library')
  })

  it('generates exam on start click', async () => {
    getExam.mockRejectedValue(new Error('No exam started'))
    startExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: 1 },
        { id: 'q2', text: 'Q2', type: 'application', weight: 2, lessonId: 1 },
      ],
      status: 'pending',
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /start exam/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /start exam/i }))

    await waitFor(() => {
      expect(screen.getByText('Q1')).toBeInTheDocument()
    })
    // Q2 is on a different page (one question at a time); navigate to it
    fireEvent.click(screen.getByRole('button', { name: /go to question 2/i }))
    await waitFor(() => {
      expect(screen.getByText('Q2')).toBeInTheDocument()
    })
  })

  it('allows typing answers and shows progress', async () => {
    getExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: 1 },
        { id: 'q2', text: 'Q2', type: 'application', weight: 2, lessonId: 1 },
      ],
      answers: {},
      status: 'pending',
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[{ id: 1, title: 'JSX' }]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'Answer' } })
    expect(screen.getByText(/1\/2 answered/i)).toBeInTheDocument()
  })

  it('blocks submission with unanswered questions', async () => {
    getExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: 1 },
      ],
      answers: {},
      status: 'pending',
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText(/submit exam/i)).toBeInTheDocument()
    })

    fireEvent.click(screen.getByText(/submit exam/i))

    await waitFor(() => {
      expect(screen.getByText(/please answer all/i)).toBeInTheDocument()
    })
  })

  it('submits answers and shows pass result with celebration', async () => {
    getExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: 1 },
      ],
      answers: {},
      status: 'pending',
    })

    submitExam.mockResolvedValue({
      overallScore: 85,
      passed: true,
      criticalGap: false,
      perLessonScores: { '1': { score: 85 } },
      weakLessons: [],
      feedback: [
        { questionId: 'q1', correctness: 'correct', score: 1, explanation: 'Good.' },
      ],
      gaps: [],
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[{ id: 1, title: 'JSX' }]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'Answer' } })
    fireEvent.click(screen.getByText(/submit exam/i))

    await waitFor(() => {
      expect(screen.getByText(/you passed/i)).toBeInTheDocument()
    })
    // 85% appears twice (overall + per-lesson), so use getAllByText
    expect(screen.getAllByText(/85%/)).toHaveLength(2)
    expect(screen.getByText(/module complete/i)).toBeInTheDocument()
  })

  it('submits answers and shows fail result with weak lessons', async () => {
    getExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: 1 },
      ],
      answers: {},
      status: 'pending',
    })

    submitExam.mockResolvedValue({
      overallScore: 65,
      passed: false,
      criticalGap: true,
      perLessonScores: { '1': { score: 40 } },
      weakLessons: [1],
      feedback: [
        { questionId: 'q1', correctness: 'incorrect', score: 0, explanation: 'Wrong.' },
      ],
      gaps: ['Weak in components'],
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[{ id: 1, title: 'JSX' }]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'Wrong' } })
    fireEvent.click(screen.getByText(/submit exam/i))

    await waitFor(() => {
      expect(screen.getByText(/not quite/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/weak in components/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retake full exam/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /retest weak areas/i })).toBeInTheDocument()
  })

  it('navigates between questions using dots and prev/next buttons', async () => {
    getExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'First question', type: 'conceptual', weight: 1, lessonId: 1 },
        { id: 'q2', text: 'Second question', type: 'application', weight: 2, lessonId: 1 },
      ],
      answers: {},
      status: 'pending',
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByText('First question')).toBeInTheDocument()
    })

    // Click question 2 dot
    fireEvent.click(screen.getByRole('button', { name: /go to question 2/i }))
    await waitFor(() => {
      expect(screen.getByText('Second question')).toBeInTheDocument()
    })

    // Click previous
    fireEvent.click(screen.getByText(/previous/i))
    await waitFor(() => {
      expect(screen.getByText('First question')).toBeInTheDocument()
    })
  })

  it('offers retake after failed exam', async () => {
    getExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: 1 },
      ],
      answers: {},
      status: 'pending',
    })

    submitExam.mockResolvedValue({
      overallScore: 60,
      passed: false,
      criticalGap: false,
      perLessonScores: { '1': { score: 60 } },
      weakLessons: [],
      feedback: [],
      gaps: [],
    })

    retakeExam.mockResolvedValue({
      questions: [{ id: 'q1', text: 'New Q1', type: 'conceptual', weight: 1, lessonId: 1 }],
      status: 'pending',
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'A' } })
    fireEvent.click(screen.getByText(/submit exam/i))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retake full exam/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /retake full exam/i }))

    await waitFor(() => {
      expect(screen.getByText('New Q1')).toBeInTheDocument()
    })
  })

  it('offers partial retest after failed exam with weak lessons', async () => {
    getExam.mockResolvedValue({
      questions: [
        { id: 'q1', text: 'Q1', type: 'conceptual', weight: 1, lessonId: 1 },
      ],
      answers: {},
      status: 'pending',
    })

    submitExam.mockResolvedValue({
      overallScore: 65,
      passed: false,
      criticalGap: true,
      perLessonScores: { '1': { score: 40 } },
      weakLessons: [1],
      feedback: [],
      gaps: [],
    })

    startPartialRetest.mockResolvedValue({
      questions: [{ id: 'q1', text: 'Retest Q1', type: 'conceptual', weight: 1, lessonId: 1 }],
      status: 'pending',
      type: 'partial',
    })

    render(<ExamPanel topicId={1} moduleId={1} moduleLessons={[{ id: 1, title: 'JSX' }]} onBack={vi.fn()} />)

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/type your answer/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'A' } })
    fireEvent.click(screen.getByText(/submit exam/i))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /retest weak areas/i })).toBeInTheDocument()
    })

    fireEvent.click(screen.getByRole('button', { name: /retest weak areas/i }))

    await waitFor(() => {
      expect(screen.getByText('Retest Q1')).toBeInTheDocument()
    })
    expect(screen.getByText(/partial retest/i)).toBeInTheDocument()
  })
})
