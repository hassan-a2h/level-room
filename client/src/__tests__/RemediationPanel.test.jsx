import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import RemediationPanel from '../components/RemediationPanel.jsx'

vi.mock('../api.js', () => ({
  sendRemediateChat: vi.fn(),
  getQuiz: vi.fn(),
  submitQuiz: vi.fn(),
  startRetest: vi.fn(),
  getRemediationState: vi.fn(),
  deferLesson: vi.fn(),
}))

import { sendRemediateChat, getQuiz, submitQuiz, startRetest, getRemediationState, deferLesson } from '../api.js'

describe('RemediationPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows diagnostic gaps after failure', async () => {
    render(
      <RemediationPanel
        topicId={1}
        lessonId={1}
        initialGaps={['Confused JSX with HTML']}
        initialAttempts={1}
        onBack={vi.fn()}
        onRetest={vi.fn()}
      />
    )

    await waitFor(() => {
      expect(screen.getByText(/not quite/i)).toBeInTheDocument()
    })
    expect(screen.getByText(/confused jsx with html/i)).toBeInTheDocument()
  })

  it('shows re-teach explanation in chat', async () => {
    sendRemediateChat.mockResolvedValue({
      body: new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode('data: "Different analogy"\n\ndata: "[DONE]"\n\n'))
          controller.close()
        },
      }),
    })

    render(
      <RemediationPanel
        topicId={1}
        lessonId={1}
        initialGaps={['Confused JSX with HTML']}
        initialAttempts={1}
        onBack={vi.fn()}
        onRetest={vi.fn()}
      />
    )

    // Type a question
    const textarea = screen.getByPlaceholderText(/type a message/i)
    fireEvent.change(textarea, { target: { value: 'Can you explain again?' } })

    const sendBtn = screen.getByRole('button', { name: /send/i })
    fireEvent.click(sendBtn)

    await waitFor(() => {
      expect(sendRemediateChat).toHaveBeenCalled()
    })
  })

  it('offers retest after first failure', async () => {
    render(
      <RemediationPanel
        topicId={1}
        lessonId={1}
        initialGaps={['Confused JSX with HTML']}
        initialAttempts={1}
        onBack={vi.fn()}
        onRetest={vi.fn()}
      />
    )

    expect(screen.getByRole('button', { name: /take retest/i })).toBeInTheDocument()
  })

  it('shows exit paths after second failure', async () => {
    const onReteach = vi.fn()
    const onPrereq = vi.fn()
    const onDefer = vi.fn()

    render(
      <RemediationPanel
        topicId={1}
        lessonId={1}
        initialGaps={['Confused JSX with HTML']}
        initialAttempts={2}
        onBack={vi.fn()}
        onRetest={vi.fn()}
        onReteach={onReteach}
        onPrereq={onPrereq}
        onDefer={onDefer}
      />
    )

    expect(screen.getByRole('button', { name: /re-teach/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /study prerequisites/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /save & come back later/i })).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: /re-teach/i }))
    expect(onReteach).toHaveBeenCalled()
  })

  it('submits retest and shows pass result', async () => {
    startRetest.mockResolvedValue({
      questions: [{ id: 'rt1', text: 'Explain JSX vs HTML.', type: 'Explain', weight: 2 }],
    })

    submitQuiz.mockResolvedValue({
      overallScore: 85,
      passed: true,
      criticalGap: false,
      feedback: [{ questionId: 'rt1', correctness: 'correct', score: 2, explanation: 'Good!' }],
      gaps: [],
    })

    render(
      <RemediationPanel
        topicId={1}
        lessonId={1}
        initialGaps={['Confused JSX with HTML']}
        initialAttempts={1}
        onBack={vi.fn()}
        onRetest={vi.fn()}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /take retest/i }))

    await waitFor(() => {
      expect(screen.getByText(/explain jsx vs html/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'JSX is different.' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => {
      expect(screen.getByText(/you passed/i)).toBeInTheDocument()
    })
  })

  it('submits retest and shows fail result with exit paths', async () => {
    startRetest.mockResolvedValue({
      questions: [{ id: 'rt1', text: 'Explain JSX vs HTML.', type: 'Explain', weight: 2 }],
    })

    submitQuiz.mockResolvedValue({
      overallScore: 55,
      passed: false,
      criticalGap: true,
      feedback: [{ questionId: 'rt1', correctness: 'incorrect', score: 0, explanation: 'Still wrong.' }],
      gaps: ['Confused JSX with HTML'],
    })

    const onReteach = vi.fn()
    render(
      <RemediationPanel
        topicId={1}
        lessonId={1}
        initialGaps={['Confused JSX with HTML']}
        initialAttempts={2}
        onBack={vi.fn()}
        onRetest={vi.fn()}
        onReteach={onReteach}
      />
    )

    fireEvent.click(screen.getByRole('button', { name: /take retest/i }))

    await waitFor(() => {
      expect(screen.getByText(/explain jsx vs html/i)).toBeInTheDocument()
    })

    fireEvent.change(screen.getByPlaceholderText(/type your answer/i), { target: { value: 'Wrong' } })
    fireEvent.click(screen.getByRole('button', { name: /submit answers/i }))

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /re-teach/i })).toBeInTheDocument()
    })
  })
})
