import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import TutorSidecar from '../components/session/TutorSidecar.jsx'

vi.mock('../api.js', () => ({ sendChatMessage: vi.fn() }))
import { sendChatMessage } from '../api.js'

function response(text = 'Try tracing the unmatched row first.') {
  const chunks = [`data: ${JSON.stringify(text)}\n\n`, 'data: "[DONE]"\n\n']
  return { ok: true, body: { getReader: () => ({ read: async () => chunks.length ? { value: new TextEncoder().encode(chunks.shift()), done: false } : { done: true }, cancel: vi.fn() }) } }
}
const props = { topicId: '2', lessonId: '8', activityBlockId: 'choose-join', messages: [] }

describe('TutorSidecar', () => {
  beforeEach(() => { vi.clearAllMocks(); window.sessionStorage.clear(); window.localStorage.clear() })

  it('keeps the guide closed by default and opens it as a sheet on request', () => {
    render(<TutorSidecar {...props} />)
    expect(screen.getByRole('button', { name: /ask your guide/i })).toHaveClass('session-guide-trigger')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /ask your guide/i }))
    expect(screen.getByRole('dialog', { name: /ask your guide/i })).toBeInTheDocument()
  })

  it('inserts an editable hint prompt, caps messages, sends current block context, and streams a reply', async () => {
    sendChatMessage.mockResolvedValueOnce(response())
    render(<TutorSidecar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /ask your guide/i }))
    fireEvent.click(screen.getByRole('button', { name: /give me a hint/i }))
    const input = screen.getByRole('textbox', { name: /message your guide/i })
    expect(input).toHaveValue('Give me a hint')
    fireEvent.change(input, { target: { value: 'Could you give a more focused hint?' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledWith('2', '8', 'Could you give a more focused hint?', 'choose-join'))
    expect(await within(screen.getByRole('dialog')).findByText(/tracing the unmatched row/i)).toBeInTheDocument()
    fireEvent.change(screen.getByRole('textbox', { name: /message your guide/i }), { target: { value: 'x'.repeat(2100) } })
    expect(screen.getByRole('textbox', { name: /message your guide/i })).toHaveValue('x'.repeat(2000))
  })

  it('preserves draft after failure and offers Retry', async () => {
    sendChatMessage.mockRejectedValueOnce(new Error('Tutor unavailable.')).mockResolvedValueOnce(response())
    render(<TutorSidecar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /ask your guide/i }))
    const input = screen.getByRole('textbox', { name: /message your guide/i })
    fireEvent.change(input, { target: { value: 'Why was this wrong?' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))
    expect(await within(screen.getByRole('dialog')).findByText('Tutor unavailable.')).toBeInTheDocument()
    expect(input).toHaveValue('Why was this wrong?')
    fireEvent.click(screen.getByRole('button', { name: /retry/i }))
    await waitFor(() => expect(sendChatMessage).toHaveBeenCalledTimes(2))
  })

  it('hides database details when the guide API fails', async () => {
    sendChatMessage.mockRejectedValueOnce(new Error('SQLITE_ERROR: private tutor_messages detail'))
    render(<TutorSidecar {...props} />)
    fireEvent.click(screen.getByRole('button', { name: /ask your guide/i }))
    fireEvent.change(screen.getByRole('textbox', { name: /message your guide/i }), { target: { value: 'Can you explain this?' } })
    fireEvent.click(screen.getByRole('button', { name: /send/i }))

    expect(await within(screen.getByRole('dialog')).findByText('Your guide is temporarily unavailable. Please retry.')).toBeInTheDocument()
    expect(screen.queryByText(/sqlite|tutor_messages/i)).not.toBeInTheDocument()
  })

  it('closes with Escape and restores trigger focus', async () => {
    render(<TutorSidecar {...props} />)
    const trigger = screen.getByRole('button', { name: /ask your guide/i })
    fireEvent.click(trigger)
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /close guide/i }))
    await waitFor(() => expect(trigger).toHaveFocus())
    fireEvent.click(trigger)
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(trigger).toHaveFocus()
  })

  it('keeps the learner draft when the mobile sheet is closed and reopened', () => {
    render(<TutorSidecar {...props} />)
    const trigger = screen.getByRole('button', { name: /ask your guide/i })
    fireEvent.click(trigger)
    const input = screen.getByRole('textbox', { name: /message your guide/i })
    fireEvent.change(input, { target: { value: 'I am still thinking about this.' } })
    fireEvent.click(screen.getByRole('button', { name: /close guide/i }))
    fireEvent.click(trigger)
    expect(screen.getByRole('textbox', { name: /message your guide/i })).toHaveValue('I am still thinking about this.')
  })
})
