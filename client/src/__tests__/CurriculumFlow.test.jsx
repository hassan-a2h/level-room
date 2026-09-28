import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import OnboardingFlow from '../pages/OnboardingFlow.jsx'
import { ThemeProvider } from '../theme/ThemeProvider.jsx'

vi.mock('../api.js', () => ({
  getSettings: vi.fn(() => Promise.resolve({ ready: true })),
  createTopic: vi.fn(),
  getSetupQuestions: vi.fn(),
  saveProfile: vi.fn(),
  generateCurriculum: vi.fn(),
  regenerateCurriculum: vi.fn(),
  confirmCurriculum: vi.fn(),
  getCurriculumRecovery: vi.fn(),
  tweakCurriculum: vi.fn(),
  startPlacementAssessment: vi.fn(),
  submitPlacementAssessment: vi.fn(),
  waitForCurriculumGeneration: vi.fn(),
}))

import {
  getSettings,
  createTopic,
  getSetupQuestions,
  saveProfile,
  generateCurriculum,
  regenerateCurriculum,
  confirmCurriculum,
  getCurriculumRecovery,
  tweakCurriculum,
  startPlacementAssessment,
  submitPlacementAssessment,
  waitForCurriculumGeneration,
} from '../api.js'

function setupQuestions({ levels = ['Beginner', 'Intermediate', 'Advanced'], times = ['15 min/day', '30 min/day', '1 hour/day'] } = {}) {
  return { questions: [
    { id: 'level', text: 'Level?', options: levels },
    { id: 'timeCommitment', text: 'Time?', options: times },
  ] }
}

function makeCurriculum(chapterTitle = 'Basics') {
  const outcomes = [
    { id: 'react-components-know', title: 'Explain component boundaries', kind: 'knowledge', role: 'core', evidence: ['activity', 'checkpoint'] },
    { id: 'react-components-build', title: 'Build a reusable component', kind: 'skill', role: 'core', evidence: ['activity', 'artifact'] },
    { id: 'react-ecosystem-breadth', title: 'Recognize the wider React ecosystem', kind: 'knowledge', role: 'breadth', evidence: ['activity'] },
  ]
  return {
    modules: [{
      title: chapterTitle,
      skill_outcomes: outcomes,
      lessons: [
        { id: 1, title: 'Intro', estimated_time: 10, outcomes: [outcomes[0]], prerequisites: [] },
        { id: 2, title: 'Components', estimated_time: 15, artifact_required: true, task_spec: { title: 'Build a profile card' }, outcomes: outcomes.slice(1), prerequisites: [{ lessonId: 1, title: 'Intro' }] },
      ],
    }],
  }
}

function curriculumResponse(curriculum) {
  const encoded = new TextEncoder().encode(`data: ${JSON.stringify(JSON.stringify(curriculum))}\n\ndata: ${JSON.stringify('[DONE]')}\n\n`)
  let read = false
  return {
    ok: true,
    body: { getReader: () => ({ async read() { if (read) return { done: true }; read = true; return { done: false, value: encoded } } }) },
  }
}

describe('OnboardingFlow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    getSettings.mockResolvedValue({ ready: true })
  })

  it('starts at Destination and names the four onboarding steps', async () => {
    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)

    expect(await screen.findByRole('heading', { name: /what do you want to be able to do/i })).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Your learning destination' })).toBeInTheDocument()
    const navigation = screen.getByRole('navigation', { name: 'Learning path setup' })
    expect(navigation).toHaveTextContent('Destination')
    expect(navigation).toHaveTextContent('Starting point')
    expect(navigation).toHaveTextContent('Learning rhythm')
    expect(navigation).toHaveTextContent('Track preview')
    expect(screen.getByRole('listitem', { name: 'Destination' })).toHaveAttribute('aria-current', 'step')
  })

  it('preserves destination, placement answers, and rhythm across pack changes', async () => {
    createTopic.mockResolvedValue({ topic: { id: 28, title: 'React' } })
    getSetupQuestions.mockResolvedValue(setupQuestions({ levels: ['Beginner', 'Intermediate'], times: ['30 min/day', '1 hour/day'] }))
    startPlacementAssessment.mockResolvedValue({ assessmentId: 5, questions: [{ id: 'q1', text: 'What do components describe?', type: 'multiple_choice', options: [{ value: 'ui', label: 'A user interface' }, { value: 'db', label: 'A database' }] }] })
    saveProfile.mockResolvedValue({ ok: true })
    generateCurriculum.mockImplementation(() => new Promise(() => {}))

    render(<ThemeProvider><MemoryRouter><OnboardingFlow /></MemoryRouter></ThemeProvider>)
    const switchTheme = (theme) => {
      fireEvent.click(screen.getByRole('button', { name: 'Open theme switcher' }))
      fireEvent.change(screen.getByRole('combobox', { name: 'Theme' }), { target: { value: theme } })
    }
    const destination = await screen.findByRole('textbox', { name: 'Your learning destination' })
    fireEvent.change(destination, { target: { value: 'React' } })
    switchTheme('curiosity-engine')
    expect(await screen.findByRole('textbox', { name: 'Your learning destination' })).toHaveValue('React')
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Intermediate' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Take a placement check' }))
    fireEvent.click(await screen.findByRole('button', { name: 'A database' }))
    switchTheme('mission-workshop')
    expect(await screen.findByRole('button', { name: 'A database' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'A user interface' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip this check' }))
    fireEvent.click(await screen.findByRole('button', { name: '1 hour/day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: /balanced pace/i }))
    switchTheme('living-atlas')
    expect(await screen.findByRole('button', { name: /balanced pace/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Build my Track' }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(28, expect.objectContaining({
      level: 'Intermediate', selfReportedLevel: 'Intermediate', timeCommitment: '1 hour/day',
    })))
  })

  it('persists a self-reported level and time after the learner skips placement', async () => {
    createTopic.mockResolvedValue({ topic: { id: 21, title: 'React' } })
    getSetupQuestions.mockResolvedValue(setupQuestions())
    saveProfile.mockResolvedValue({ ok: true })
    generateCurriculum.mockImplementation(() => new Promise(() => {}))

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your learning destination' }), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Intermediate' }))
    expect(screen.getByRole('button', { name: 'Intermediate' })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip placement check' }))

    expect(await screen.findByRole('heading', { name: 'Set your learning rhythm' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '1 hour/day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: /steady pace/i }))
    expect(screen.getByRole('button', { name: /steady pace/i })).toHaveAttribute('aria-pressed', 'true')
    fireEvent.click(screen.getByRole('button', { name: 'Build my Track' }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(21, expect.objectContaining({
      level: 'Intermediate',
      selfReportedLevel: 'Intermediate',
      timeCommitment: '1 hour/day',
    })))
    expect(await screen.findByRole('heading', { name: /designing your track/i })).toBeInTheDocument()
  })

  it('waits for a durable generation job before showing the Track preview', async () => {
    const generation = { id: 'job-21', state: 'queued', attempt: 0, maxAttempts: 3 }
    createTopic.mockResolvedValue({ topic: { id: 21, title: 'React' } })
    getSetupQuestions.mockResolvedValue(setupQuestions())
    saveProfile.mockResolvedValue({ ok: true })
    generateCurriculum.mockResolvedValue({ generation })
    waitForCurriculumGeneration.mockResolvedValue(makeCurriculum('Generated Chapter'))

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your learning destination' }), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Beginner' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Skip placement check' }))
    fireEvent.click(await screen.findByRole('button', { name: '30 min/day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Build my Track' }))

    expect(await screen.findByRole('heading', { name: /Generated Chapter/ })).toBeInTheDocument()
    expect(waitForCurriculumGeneration).toHaveBeenCalledWith(21, generation, expect.any(Function), expect.objectContaining({ signal: expect.anything() }))
  })

  it('takes the existing placement check only when selected and saves its result', async () => {
    createTopic.mockResolvedValue({ topic: { id: 22, title: 'React' } })
    getSetupQuestions.mockResolvedValue(setupQuestions({ levels: ['Beginner', 'Intermediate'], times: ['30 min/day'] }))
    startPlacementAssessment.mockResolvedValue({ assessmentId: 4, questions: [{ id: 'q1', text: 'Explain components.' }] })
    submitPlacementAssessment.mockResolvedValue({ assessmentId: 4, requestedLevel: 'Intermediate', recommendedLevel: 'Beginner', gaps: [], feedback: [] })
    saveProfile.mockResolvedValue({ ok: true })
    generateCurriculum.mockImplementation(() => new Promise(() => {}))

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your learning destination' }), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Intermediate' }))

    expect(startPlacementAssessment).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Take a placement check' }))
    expect(await screen.findByRole('textbox', { name: 'Explain components.' })).toBeInTheDocument()
    expect(startPlacementAssessment).toHaveBeenCalledWith(22, 'Intermediate')
    fireEvent.change(screen.getByRole('textbox', { name: 'Explain components.' }), { target: { value: 'Components describe a view.' } })
    fireEvent.click(screen.getByRole('button', { name: 'Check my starting point' }))
    fireEvent.click(await screen.findByRole('button', { name: 'Continue with Beginner' }))
    expect(await screen.findByRole('heading', { name: 'Set your learning rhythm' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '30 min/day' }))
    fireEvent.click(screen.getByRole('button', { name: 'Continue' }))
    fireEvent.click(screen.getByRole('button', { name: 'Build my Track' }))

    await waitFor(() => expect(saveProfile).toHaveBeenCalledWith(22, expect.objectContaining({
      level: 'Beginner',
      selfReportedLevel: 'Intermediate',
      placementAssessmentId: 4,
      timeCommitment: '30 min/day',
    })))
  })

  it('retries setup choices and hides raw database errors', async () => {
    createTopic.mockResolvedValue({ topic: { id: 23, title: 'React' } })
    getSetupQuestions.mockRejectedValueOnce(new Error('SQLITE_ERROR: no such table: topics')).mockResolvedValueOnce(setupQuestions())

    render(<MemoryRouter><OnboardingFlow /></MemoryRouter>)
    fireEvent.change(await screen.findByRole('textbox', { name: 'Your learning destination' }), { target: { value: 'React' } })
    fireEvent.click(screen.getByRole('button', { name: 'Set my destination' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('We could not load your starting choices.')
    expect(screen.queryByText(/sqlite|table: topics/i)).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Retry choices' }))
    expect(await screen.findByRole('heading', { name: 'Choose your starting point' })).toBeInTheDocument()
    expect(getSetupQuestions).toHaveBeenCalledTimes(2)
  })

  it('recovers a failed generation and opens a saved structured Track preview', async () => {
    getCurriculumRecovery.mockResolvedValue({
      topic: { id: 24, title: 'React', level: 'Beginner', timeCommitment: '30 min/day' },
      curriculumState: 'failed',
      curriculumError: 'The provider connection was lost.',
      curriculum: null,
      resumeAvailable: true,
    })
    generateCurriculum.mockResolvedValue(curriculumResponse(makeCurriculum('Recovered Chapter')))

    render(<MemoryRouter initialEntries={['/onboarding?topicId=24']}><OnboardingFlow /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: 'Your Track is ready to resume' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('The provider connection was lost.')
    expect(generateCurriculum).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Resume Track generation' }))

    expect(await screen.findByRole('heading', { name: /Recovered Chapter/ })).toBeInTheDocument()
    expect(generateCurriculum).toHaveBeenCalledWith(24)
    expect(screen.getByRole('button', { name: 'Add to my Trail' })).toBeInTheDocument()
  })

  it('keeps the onboarding layout stable while restoring a generation job', () => {
    getCurriculumRecovery.mockImplementation(() => new Promise(() => {}))
    render(<MemoryRouter initialEntries={['/onboarding?topicId=26']}><OnboardingFlow /></MemoryRouter>)

    expect(screen.getByRole('status', { name: 'Loading onboarding' })).toBeInTheDocument()
    expect(screen.queryByRole('heading', { name: /what do you want to be able to do/i })).not.toBeInTheDocument()
  })

  it('loads an already-saved Track preview without regenerating it', async () => {
    getCurriculumRecovery.mockResolvedValue({
      topic: { id: 25, title: 'React', level: 'Intermediate', timeCommitment: '1 hour/day' },
      curriculumState: 'draft_ready',
      curriculumError: null,
      curriculum: makeCurriculum('Saved Chapter'),
      resumeAvailable: true,
    })

    render(<MemoryRouter initialEntries={['/onboarding?topicId=25']}><OnboardingFlow /></MemoryRouter>)
    expect(await screen.findByRole('heading', { name: /Saved Chapter/ })).toBeInTheDocument()
    expect(generateCurriculum).not.toHaveBeenCalled()
  })
})
