import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import CurriculumConfirmation from '../pages/CurriculumConfirmation'
import OnboardingFlow from '../pages/OnboardingFlow'

vi.mock('../api.js', () => ({
  getSettings: vi.fn(() => Promise.resolve({ apiKeySet: true })),
  createTopic: vi.fn(),
  getSetupQuestions: vi.fn(),
  saveProfile: vi.fn(),
  generateCurriculum: vi.fn(),
  regenerateCurriculum: vi.fn(),
  confirmCurriculum: vi.fn(),
  tweakCurriculum: vi.fn(),
  startPlacementAssessment: vi.fn(),
  submitPlacementAssessment: vi.fn(),
}))

import {
  getSettings,
  createTopic,
  getSetupQuestions,
  saveProfile,
  generateCurriculum,
  regenerateCurriculum,
  confirmCurriculum,
  tweakCurriculum,
  startPlacementAssessment,
  submitPlacementAssessment,
} from '../api.js'

describe('OnboardingFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders topic input first', async () => {
    render(
      <MemoryRouter>
        <OnboardingFlow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText(/what do you want to learn/i)).toBeInTheDocument()
    })
    expect(screen.getByRole('heading', { level: 1, name: /what do you want to learn/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Topic' })).toBeInTheDocument()
    expect(screen.getByPlaceholderText(/enter a topic/i)).toBeInTheDocument()
    expect(screen.getByRole('navigation', { name: 'Learning path setup' })).toBeInTheDocument()
    expect(screen.getByText('Step 1 of 4')).toBeInTheDocument()
    expect(screen.getByRole('listitem', { name: 'Topic' })).toHaveAttribute('aria-current', 'step')
  })

  it('treats provider readiness as sufficient even when there is no API key', async () => {
    getSettings.mockResolvedValue({ ready: true, apiKeySet: false })
    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)

    await waitFor(() => expect(getSettings).toHaveBeenCalled())
    expect(screen.queryByText(/you need an api key/i)).not.toBeInTheDocument()
  })

  it('shows validation error for empty topic', async () => {
    render(
      <MemoryRouter>
        <OnboardingFlow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/enter a topic/i)).toBeInTheDocument()
    })

    const submitBtn = screen.getByRole('button', { name: /start learning/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      const alerts = screen.getAllByText(/please enter a topic/i)
      expect(alerts.length).toBeGreaterThanOrEqual(1)
    })
  })

  it('transitions to setup questions after topic creation', async () => {
    createTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getSetupQuestions.mockResolvedValue({
      questions: [
        { text: 'What is your current level?', options: ['Beginner', 'Intermediate', 'Advanced'] },
        { text: 'How much time per day?', options: ['15 min', '30 min', '1 hour'] },
      ],
    })

    render(
      <MemoryRouter>
        <OnboardingFlow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/enter a topic/i)).toBeInTheDocument()
    })

    const input = screen.getByPlaceholderText(/enter a topic/i)
    fireEvent.change(input, { target: { value: 'React' } })

    const submitBtn = screen.getByRole('button', { name: /start learning/i })
    fireEvent.click(submitBtn)

    await waitFor(() => {
      expect(screen.getByText(/what is your current level/i)).toBeInTheDocument()
    })
  })

  it('offers a retry when setup questions cannot be loaded', async () => {
    createTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getSetupQuestions
      .mockRejectedValueOnce(new Error('Codex could not complete the request.'))
      .mockResolvedValueOnce({
        questions: [{ text: 'What is your current level?', options: ['Beginner', 'Advanced'] }],
      })

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByPlaceholderText(/enter a topic/i), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/codex could not complete/i)
    fireEvent.click(screen.getByRole('button', { name: /retry questions/i }))
    expect(await screen.findByText(/what is your current level/i)).toBeInTheDocument()
    expect(getSetupQuestions).toHaveBeenCalledTimes(2)
  })

  it('advances to generating state after answering setup questions', async () => {
    createTopic.mockResolvedValue({ topic: { id: 1, title: 'React' } })
    getSetupQuestions.mockResolvedValue({
      questions: [
        { text: 'What is your current level?', options: ['Beginner', 'Intermediate', 'Advanced'] },
        { text: 'How much time per day?', options: ['15 min', '30 min', '1 hour'] },
      ],
    })
    saveProfile.mockResolvedValue({ ok: true })

    render(
      <MemoryRouter>
        <OnboardingFlow />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByPlaceholderText(/enter a topic/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/enter a topic/i), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }))

    await waitFor(() => {
      expect(screen.getByText(/what is your current level/i)).toBeInTheDocument()
    })

    // Select level and time commitment
    fireEvent.click(screen.getByText('Beginner'))
    fireEvent.click(screen.getByText('30 min'))
    expect(screen.getByRole('button', { name: /beginner/i })).toHaveAttribute('aria-pressed', 'true')

    const continueBtn = screen.getByRole('button', { name: /continue/i })
    fireEvent.click(continueBtn)

    await waitFor(() => {
      expect(saveProfile).toHaveBeenCalledWith(1, expect.objectContaining({ level: 'Beginner' }))
    })

    // Should transition to generating state
    await waitFor(() => {
      expect(screen.getByText(/designing your learning path/i)).toBeInTheDocument()
    })
  })

  it('checks a claimed non-beginner level before saving the profile', async () => {
    createTopic.mockResolvedValue({ topic: { id: 2, title: 'React' } })
    getSetupQuestions.mockResolvedValue({
      questions: [
        { text: 'What is your current level?', options: ['Beginner', 'Intermediate', 'Advanced'] },
        { text: 'How much time per day?', options: ['15 min', '30 min', '1 hour'] },
      ],
    })
    startPlacementAssessment.mockResolvedValue({
      assessmentId: 9,
      level: 'Intermediate',
      questions: [
        { id: 'q1', text: 'Choose the sound approach.', type: 'multiple_choice', options: [{ value: 'A', label: 'A' }, { value: 'B', label: 'B' }] },
        { id: 'q2', text: 'Explain your debugging process.', type: 'objective' },
      ],
    })
    submitPlacementAssessment.mockResolvedValue({
      assessmentId: 9,
      requestedLevel: 'Intermediate',
      score: 52,
      passed: false,
      recommendedLevel: 'Beginner',
      feedback: ['Build stronger foundations first.'],
      gaps: ['State management'],
    })
    saveProfile.mockResolvedValue({ ok: true })

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByPlaceholderText(/enter a topic/i), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }))
    fireEvent.click(await screen.findByText('Intermediate'))
    fireEvent.click(screen.getByText('30 min'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/verify your intermediate level/i)).toBeInTheDocument()
    expect(saveProfile).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'A' }))
    fireEvent.change(screen.getByRole('textbox', { name: /explain your debugging process/i }), { target: { value: 'I reproduce it, isolate the cause, and test the smallest fix.' } })
    fireEvent.click(screen.getByRole('button', { name: /check my level/i }))

    expect(await screen.findByText(/better starting point/i)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /continue with beginner/i }))
    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(2, {
      level: 'Beginner',
      selfReportedLevel: 'Intermediate',
      timeCommitment: '30 min/day',
      placementAssessmentId: 9,
    }))
  })

  it('offers a retry when the placement assessment cannot be generated', async () => {
    createTopic.mockResolvedValue({ topic: { id: 3, title: 'React' } })
    getSetupQuestions.mockResolvedValue({
      questions: [
        { text: 'What is your current level?', options: ['Beginner', 'Intermediate', 'Advanced'] },
        { text: 'How much time per day?', options: ['30 min'] },
      ],
    })
    startPlacementAssessment
      .mockRejectedValueOnce(new Error('Provider unavailable.'))
      .mockResolvedValueOnce({
        assessmentId: 10,
        level: 'Advanced',
        questions: [{ id: 'q1', text: 'Explain the approach.', type: 'objective' }],
      })

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByPlaceholderText(/enter a topic/i), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }))
    fireEvent.click(await screen.findByText('Advanced'))
    fireEvent.click(screen.getByText('30 min'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByRole('alert')).toHaveTextContent(/provider unavailable/i)
    fireEvent.click(screen.getByRole('button', { name: /retry placement check/i }))
    expect(await screen.findByText(/verify your advanced level/i)).toBeInTheDocument()
    expect(startPlacementAssessment).toHaveBeenCalledTimes(2)
  })

  it('shows the placement screen while question generation is still in flight', async () => {
    let resolveStart
    createTopic.mockResolvedValue({ topic: { id: 4, title: 'React' } })
    getSetupQuestions.mockResolvedValue({
      questions: [
        { text: 'What is your current level?', options: ['Beginner', 'Intermediate', 'Advanced'] },
        { text: 'How much time per day?', options: ['30 min'] },
      ],
    })
    startPlacementAssessment.mockImplementation(() => new Promise((resolve) => { resolveStart = resolve }))

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByPlaceholderText(/enter a topic/i), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }))
    fireEvent.click(await screen.findByText('Intermediate'))
    fireEvent.click(screen.getByText('30 min'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText(/verify your intermediate level/i)).toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent(/preparing your level check/i)
    resolveStart({
      assessmentId: 11,
      level: 'Intermediate',
      questions: [{ id: 'q1', text: 'Explain the concept.', type: 'objective' }],
    })
    expect(await screen.findByText(/explain the concept/i)).toBeInTheDocument()
  })

  it('regenerates once, displays stream errors, and keeps the last valid roadmap', async () => {
    const initialCurriculum = { modules: [{ title: 'First path', lessons: [] }] }
    const replacementCurriculum = { modules: [{ title: 'Updated path', lessons: [] }] }
    getSettings.mockResolvedValue({ ready: true })
    createTopic.mockResolvedValue({ topic: { id: 12, title: 'DevOps' } })
    getSetupQuestions.mockResolvedValue({ questions: [
      { text: 'What is your current level?', options: ['Beginner', 'Intermediate'] },
      { text: 'How much time per day?', options: ['30 min', '1 hour'] },
    ] })
    saveProfile.mockResolvedValue({ ok: true })
    generateCurriculum.mockResolvedValue(curriculumResponse(initialCurriculum))
    regenerateCurriculum
      .mockResolvedValueOnce(curriculumResponse(replacementCurriculum))
      .mockResolvedValueOnce(curriculumResponseError('Provider connection was lost.'))

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByPlaceholderText(/enter a topic/i), { target: { value: 'DevOps' } })
    fireEvent.click(screen.getByRole('button', { name: /start learning/i }))
    fireEvent.click(await screen.findByText('Beginner'))
    fireEvent.click(screen.getByText('30 min'))
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))

    expect(await screen.findByText('First path')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
    expect(await screen.findByText('Updated path')).toBeInTheDocument()
    expect(regenerateCurriculum).toHaveBeenCalledTimes(1)
    expect(generateCurriculum).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: /regenerate/i }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Provider connection was lost.')
    expect(screen.getByText('Updated path')).toBeInTheDocument()
    expect(regenerateCurriculum).toHaveBeenCalledTimes(2)
    expect(generateCurriculum).toHaveBeenCalledTimes(1)
  })
})

describe('CurriculumConfirmation', () => {
  const mockCurriculum = {
    modules: [
      {
        title: 'Basics',
        lessons: [
          { title: 'Intro', depth: 'Beginner', estimated_time: 10, outcomes: ['Understand basics'], prerequisites: [] },
          { title: 'Components', depth: 'Intermediate', estimated_time: 15, outcomes: ['Build components'], prerequisites: [{ lessonId: 1, title: 'Intro' }] },
        ],
      },
    ],
  }

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders modules and lessons with metadata', async () => {
    render(
      <MemoryRouter>
        <CurriculumConfirmation curriculum={mockCurriculum} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Basics')).toBeInTheDocument()
    })
    expect(screen.getByText('Intro')).toBeInTheDocument()
    expect(screen.getByText('Components')).toBeInTheDocument()
    expect(screen.getByText(/Beginner/)).toBeInTheDocument()
    expect(screen.getByText(/~10 min/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /test out/i })).not.toBeInTheDocument()
  })

  it('expands outcomes and prerequisites on demand', () => {
    render(<CurriculumConfirmation curriculum={mockCurriculum} />)
    const expand = screen.getAllByRole('button', { name: 'Expand lesson details' })[0]
    fireEvent.click(expand)
    expect(expand).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText('Understand basics')).toBeInTheDocument()
    expect(screen.getByText(/Intro/)).toBeInTheDocument()
  })

  it('calls onConfirm when Accept is clicked', async () => {
    const onConfirm = vi.fn()
    render(
      <MemoryRouter>
        <CurriculumConfirmation curriculum={mockCurriculum} onConfirm={onConfirm} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Basics')).toBeInTheDocument()
    })

    const acceptBtn = screen.getByRole('button', { name: /accept/i })
    fireEvent.click(acceptBtn)

    await waitFor(() => {
      expect(onConfirm).toHaveBeenCalled()
    })
  })

  it('calls onTweak when tweak is submitted', async () => {
    const onTweak = vi.fn()
    render(
      <MemoryRouter>
        <CurriculumConfirmation curriculum={mockCurriculum} onTweak={onTweak} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Basics')).toBeInTheDocument()
    })

    const tweakBtn = screen.getByRole('button', { name: /tweak/i })
    fireEvent.click(tweakBtn)

    const tweakInput = screen.getByPlaceholderText(/request changes/i)
    fireEvent.change(tweakInput, { target: { value: 'Add a module on testing' } })

    const applyBtn = screen.getByRole('button', { name: /apply tweak/i })
    fireEvent.click(applyBtn)

    await waitFor(() => {
      expect(onTweak).toHaveBeenCalledWith('Add a module on testing')
    })
  })

  it('calls onRegenerate when Regenerate is clicked', async () => {
    const onRegenerate = vi.fn()
    render(
      <MemoryRouter>
        <CurriculumConfirmation curriculum={mockCurriculum} onRegenerate={onRegenerate} />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByText('Basics')).toBeInTheDocument()
    })

    const regenBtn = screen.getByRole('button', { name: /regenerate/i })
    fireEvent.click(regenBtn)

    await waitFor(() => {
      expect(onRegenerate).toHaveBeenCalled()
    })
  })
})

function curriculumResponse(curriculum) {
  const text = JSON.stringify(curriculum)
  const events = `data: ${JSON.stringify(text)}\n\ndata: ${JSON.stringify('[DONE]')}\n\n`
  return textStreamResponse(events)
}

function curriculumResponseError(message) {
  return textStreamResponse(`event: error\ndata: ${JSON.stringify({ message })}\n\n`)
}

function textStreamResponse(text) {
  const encoded = new TextEncoder().encode(text)
  let read = false
  return {
    ok: true,
    body: {
      getReader: () => ({
        async read() {
          if (read) return { done: true, value: undefined }
          read = true
          return { done: false, value: encoded }
        },
      }),
    },
  }
}
