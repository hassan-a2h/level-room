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
  confirmCurriculum: vi.fn(),
  tweakCurriculum: vi.fn(),
}))

import {
  createTopic,
  getSetupQuestions,
  saveProfile,
  confirmCurriculum,
  tweakCurriculum,
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
    expect(screen.getByPlaceholderText(/enter a topic/i)).toBeInTheDocument()
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
