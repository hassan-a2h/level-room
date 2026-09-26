import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import ExamPanel from '../components/ExamPanel.jsx'

const navigation = vi.hoisted(() => ({ navigate: vi.fn() }))

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom')
  return { ...actual, useNavigate: () => navigation.navigate }
})

vi.mock('../api.js', () => ({
  getExam: vi.fn(),
  startExam: vi.fn(),
  saveExamProgress: vi.fn(() => Promise.resolve({ ok: true })),
  submitExam: vi.fn(),
  retakeExam: vi.fn(),
  startPartialRetest: vi.fn(),
  submitPartialRetest: vi.fn(),
  getLocalDate: vi.fn(() => '2026-09-26'),
}))

import { getExam, startExam, saveExamProgress, submitExam, retakeExam, startPartialRetest, submitPartialRetest } from '../api.js'

const outcomes = [
  { id: 'joins-core', title: 'Choose and explain the right join', kind: 'knowledge', role: 'core', evidence: ['checkpoint'] },
  { id: 'joins-breadth', title: 'Explain missing values', kind: 'knowledge', role: 'breadth', evidence: ['checkpoint'] },
]
const lessons = [
  { id: 11, title: 'Join tables', state: 'passed', outcomes: [outcomes[0]] },
  { id: 12, title: 'Missing values', state: 'passed', outcomes: [outcomes[1]] },
]
const choiceQuestion = { id: 'join-choice', text: 'Which join keeps each left row?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-core'], options: [{ id: 'left', label: 'LEFT JOIN' }, { id: 'inner', label: 'INNER JOIN' }] }
const writtenQuestion = { id: 'join-written', text: 'Why does a left join retain unmatched rows?', type: 'written', weight: 2, required: true, outcomeIds: ['joins-core'] }
const breadthQuestion = { id: 'null-choice', text: 'What can NULL tell you?', type: 'choice', weight: 1, required: true, outcomeIds: ['joins-breadth'], options: [{ id: 'missing', label: 'A value is missing or unknown' }, { id: 'zero', label: 'It always equals zero' }] }
const questions = [choiceQuestion, writtenQuestion, breadthQuestion]

function missingAttemptError() {
  return Object.assign(new Error('No Chapter checkpoint is in progress.'), { code: 'CHECKPOINT_NOT_FOUND', status: 404 })
}

function pendingAttempt(overrides = {}) {
  return { id: 41, questions, answers: {}, type: 'full', status: 'pending', outcomes, moduleTitle: 'Joins', ...overrides }
}

function renderPanel(props = {}) {
  return render(<ExamPanel topicId={2} moduleId={3} moduleTitle="Joins" chapterOutcomes={outcomes} moduleLessons={lessons} onBack={vi.fn()} {...props} />)
}

describe('Chapter checkpoint experience', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    saveExamProgress.mockResolvedValue({ ok: true })
    navigation.navigate.mockReset()
  })

  it('shows the readiness intro and launches a single-question learning flow', async () => {
    getExam.mockRejectedValue(missingAttemptError())
    startExam.mockResolvedValue(pendingAttempt())
    renderPanel()

    expect(await screen.findByRole('heading', { name: 'Show what you can do' })).toBeInTheDocument()
    expect(screen.getByText('~8 min')).toBeInTheDocument()
    expect(screen.getByText(/80% overall/i)).toBeInTheDocument()
    expect(screen.getByText(/60%\+/i)).toBeInTheDocument()
    expect(screen.getByText(/answers save as you go/i)).toBeInTheDocument()
    expect(screen.getByText('Choose and explain the right join')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /begin checkpoint/i }))

    expect(await screen.findByText(choiceQuestion.text)).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: /left join/i })).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: /checkpoint questions answered/i })).toHaveAttribute('aria-valuenow', '0')
  })

  it('keeps the checkpoint locked until Sessions are complete and offers a return path', async () => {
    getExam.mockRejectedValue(Object.assign(new Error('Finish one more Session.'), { code: 'CHECKPOINT_NOT_READY', lessonsRemaining: 1 }))
    renderPanel({ moduleLessons: [{ id: 99, title: 'Practice joins', state: 'not_started', outcomes: [outcomes[0]] }] })

    expect(await screen.findByText(/finish 1 more session first/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /begin checkpoint/i })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /continue learning/i }))
    expect(navigation.navigate).toHaveBeenCalledWith('/topic/2/lesson/99')
  })

  it('restores a pending answer and autosaves changes', async () => {
    getExam.mockResolvedValue(pendingAttempt({ questions: [choiceQuestion], answers: { 'join-choice': 'left' } }))
    renderPanel()
    const left = await screen.findByRole('radio', { name: /left join/i })
    expect(left).toBeChecked()
    fireEvent.click(screen.getByRole('radio', { name: /inner join/i }))
    expect(screen.getByText(/1 of 1 answered/i)).toBeInTheDocument()
    await waitFor(() => expect(saveExamProgress).toHaveBeenCalledWith(2, 3, { 'join-choice': 'inner' }), { timeout: 2000 })
  })

  it('uses question navigation while keeping only the selected question active', async () => {
    getExam.mockResolvedValue(pendingAttempt())
    renderPanel()

    expect(await screen.findByText(choiceQuestion.text)).toBeInTheDocument()
    expect(screen.getAllByRole('article')).toHaveLength(1)
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, unanswered' }))
    expect(screen.getByText(writtenQuestion.text)).toBeInTheDocument()
    fireEvent.change(screen.getByPlaceholderText(/write your thinking/i), { target: { value: 'The left side remains.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Question 1, unanswered' }))
    expect(screen.getByRole('radio', { name: /left join/i })).not.toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, answered' }))
    expect(screen.getByPlaceholderText(/write your thinking/i)).toHaveValue('The left side remains.')
    expect(screen.getByText(/1 of 3 answered/i)).toBeInTheDocument()
  })

  it('keeps every answer available after a submission network failure', async () => {
    getExam.mockResolvedValue(pendingAttempt())
    submitExam.mockRejectedValueOnce(Object.assign(new Error('Connection dropped. Your answers are still here.'), { retryable: true }))
    renderPanel()

    fireEvent.click(await screen.findByRole('radio', { name: /left join/i }))
    fireEvent.click(screen.getByRole('button', { name: /next question/i }))
    fireEvent.change(screen.getByPlaceholderText(/write your thinking/i), { target: { value: 'The left row remains.' } })
    fireEvent.click(screen.getByRole('button', { name: /next question/i }))
    fireEvent.click(screen.getByRole('radio', { name: /missing or unknown/i }))
    fireEvent.click(screen.getByRole('button', { name: /finish checkpoint/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/connection dropped/i)
    expect(screen.getByRole('radio', { name: /missing or unknown/i })).toBeChecked()
    fireEvent.click(screen.getByRole('button', { name: 'Question 2, answered' }))
    expect(screen.getByPlaceholderText(/write your thinking/i)).toHaveValue('The left row remains.')
    fireEvent.click(screen.getByRole('button', { name: 'Question 3, answered' }))
    expect(screen.getByRole('button', { name: /finish checkpoint/i })).toBeInTheDocument()
  })

  it('takes the learner to the first unanswered question and focuses its answer control', async () => {
    getExam.mockResolvedValue(pendingAttempt({ questions: [choiceQuestion, writtenQuestion] }))
    renderPanel()
    fireEvent.click(await screen.findByRole('button', { name: /next question/i }))
    fireEvent.change(screen.getByPlaceholderText(/write your thinking/i), { target: { value: 'The left side remains.' } })
    fireEvent.click(screen.getByRole('button', { name: /finish checkpoint/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/unanswered question/i)
    const missing = screen.getByRole('radio', { name: /left join/i })
    await waitFor(() => expect(missing).toHaveFocus())
    expect(submitExam).not.toHaveBeenCalled()
  })

  it('shows outcome-aware pass feedback and only celebrates an earned pass', async () => {
    getExam.mockResolvedValue(pendingAttempt({ questions: [writtenQuestion] }))
    submitExam.mockResolvedValue({
      overallScore: 92,
      passed: true,
      criticalGap: false,
      failedOutcomeIds: [],
      perOutcomeEvidence: { 'joins-core': { score: 92 }, 'joins-breadth': { score: 100 } },
      feedback: [{ questionId: 'join-written', score: 92, explanation: 'You explained the retained rows.' }],
      nextModuleUnlocked: false,
    })
    renderPanel()
    fireEvent.change(await screen.findByPlaceholderText(/write your thinking/i), { target: { value: 'Unmatched left rows stay and right fields are NULL.' } })
    fireEvent.click(screen.getByRole('button', { name: /finish checkpoint/i }))

    expect(await screen.findByRole('heading', { name: /chapter checkpoint cleared/i })).toBeInTheDocument()
    expect(screen.getAllByText('92%')).toHaveLength(2)
    expect(screen.getByText(/you explained the retained rows/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /continue your trail/i })).toBeInTheDocument()
    expect(submitExam).toHaveBeenCalledWith(2, 3, { 'join-written': 'Unmatched left rows stay and right fields are NULL.' }, '2026-09-26')
  })

  it('shows missed outcomes, offers review then targeted retest, and keeps full retake secondary', async () => {
    getExam.mockResolvedValue(pendingAttempt({ questions: [choiceQuestion] }))
    submitExam.mockResolvedValue({
      overallScore: 45,
      passed: false,
      criticalGap: true,
      failedOutcomeIds: ['joins-core'],
      perOutcomeEvidence: { 'joins-core': { score: 45 }, 'joins-breadth': { score: 100 } },
      feedback: [],
    })
    startPartialRetest.mockResolvedValue(pendingAttempt({ id: 42, questions: [choiceQuestion], answers: {}, type: 'partial' }))
    submitPartialRetest.mockResolvedValue({ overallScore: 100, passed: true, failedOutcomeIds: [], perOutcomeEvidence: { 'joins-core': { score: 100 }, 'joins-breadth': { score: 100 } }, feedback: [], partialPass: true, modulePassed: true })
    renderPanel()

    fireEvent.click(await screen.findByRole('radio', { name: /inner join/i }))
    fireEvent.click(screen.getByRole('button', { name: /finish checkpoint/i }))
    expect(await screen.findByRole('heading', { name: /strengthen a few ideas/i })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /review join tables/i }))
    expect(navigation.navigate).toHaveBeenCalledWith('/topic/2/lesson/11')

    fireEvent.click(screen.getByRole('button', { name: /practice missed outcomes/i }))
    expect(await screen.findByText(choiceQuestion.text)).toBeInTheDocument()
    expect(startPartialRetest).toHaveBeenCalledWith(2, 3, ['joins-core'])
    fireEvent.click(screen.getByRole('radio', { name: /left join/i }))
    fireEvent.click(screen.getByRole('button', { name: /finish checkpoint/i }))
    expect(await screen.findByRole('heading', { name: /chapter checkpoint cleared/i })).toBeInTheDocument()
    expect(submitPartialRetest).toHaveBeenCalledWith(2, 3, 42, { 'join-choice': 'left' }, '2026-09-26')
  })

  it('distinguishes core and supporting misses and never celebrates a failed checkpoint', async () => {
    getExam.mockResolvedValue(pendingAttempt({ questions: [choiceQuestion, breadthQuestion] }))
    submitExam.mockResolvedValue({
      overallScore: 55,
      passed: false,
      failedOutcomeIds: ['joins-core', 'joins-breadth'],
      perOutcomeEvidence: { 'joins-core': { score: 50 }, 'joins-breadth': { score: 40 } },
      feedback: [],
    })
    renderPanel()

    fireEvent.click(await screen.findByRole('radio', { name: /inner join/i }))
    fireEvent.click(screen.getByRole('button', { name: /next question/i }))
    fireEvent.click(screen.getByRole('radio', { name: /equals zero/i }))
    fireEvent.click(screen.getByRole('button', { name: /finish checkpoint/i }))

    expect(await screen.findByRole('heading', { name: /strengthen a few ideas/i })).toBeInTheDocument()
    expect(document.querySelector('.checkpoint-results.is-review .checkpoint-celebration-mark')).toBeNull()
    expect(screen.getByText(/core skill/i)).toBeInTheDocument()
    expect(screen.getByText(/supporting idea/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review join tables/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /review missing values/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /take full checkpoint again/i })).toHaveClass('ui-button-secondary')
  })

  it('offers a full checkpoint retake after a miss', async () => {
    getExam.mockResolvedValue(pendingAttempt({ questions: [choiceQuestion] }))
    submitExam.mockResolvedValue({ overallScore: 45, passed: false, failedOutcomeIds: ['joins-core'], perOutcomeEvidence: { 'joins-core': { score: 45 }, 'joins-breadth': { score: 100 } }, feedback: [] })
    retakeExam.mockResolvedValue(pendingAttempt({ id: 43, questions: [breadthQuestion] }))
    renderPanel()

    fireEvent.click(await screen.findByRole('radio', { name: /inner join/i }))
    fireEvent.click(screen.getByRole('button', { name: /finish checkpoint/i }))
    fireEvent.click(await screen.findByRole('button', { name: /take full checkpoint again/i }))
    expect(await screen.findByText(breadthQuestion.text)).toBeInTheDocument()
    expect(retakeExam).toHaveBeenCalledWith(2, 3)
  })
})
