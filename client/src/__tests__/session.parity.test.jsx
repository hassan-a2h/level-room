import React from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import SessionPlayer from '../components/session/SessionPlayer.jsx'
import { ThemeProvider, THEME_STORAGE_KEY, useTheme } from '../theme/ThemeProvider.jsx'

vi.mock('../api.js', () => ({
  completeActivityBlock: vi.fn(), submitActivityBlock: vi.fn(), getLesson: vi.fn(), getLocalDate: () => '2026-09-26', sendChatMessage: vi.fn(),
}))
vi.mock('../components/ArtifactPanel.jsx', () => ({ default: () => <div>Build form</div> }))

const blocks = [
  { id: 'choice', type: 'choice', title: 'Choose', prompt: 'Pick one', options: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }], required: true },
  { id: 'order', type: 'ordering', title: 'Order', prompt: 'Arrange these', items: [{ id: 'first', label: 'First' }, { id: 'second', label: 'Second' }], required: true },
  { id: 'answer', type: 'short_answer', title: 'Answer', prompt: 'Explain', responseHint: 'In your words', minChars: 1, maxChars: 200, required: true },
  { id: 'reflection', type: 'reflection', title: 'Reflect', prompt: 'Takeaway', maxChars: 200, required: true },
  { id: 'example', type: 'worked_example', title: 'Example', problem: 'Problem', steps: [{ id: 's1', title: 'First step', content: 'Work' }, { id: 's2', title: 'Second step', content: 'More work' }], takeaway: 'Takeaway', required: true },
]
const props = {
  topicId: '2', lessonId: '8', session: { title: 'Practice', estimated_time: 10 }, progress: { state: 'practicing' },
  activityDocument: { blocks }, activityState: { currentBlockId: 'choice', blocks: {} },
  activityProgress: { completed: 0, total: 5, percent: 0, currentBlockId: 'choice' },
}
function ThemeSwitch() {
  const { selectTheme } = useTheme()
  return <button type="button" onClick={() => selectTheme('mission-workshop')}>Swap theme</button>
}
const renderPlayer = (extra = {}) => {
  window.localStorage.setItem(THEME_STORAGE_KEY, 'curiosity-engine')
  return render(<ThemeProvider><ThemeSwitch /><MemoryRouter><SessionPlayer {...props} {...extra} /></MemoryRouter></ThemeProvider>)
}

describe('Session parity', () => {
  it('keeps the session to one activity and opens the guide only on request', () => {
    renderPlayer()
    return screen.findByRole('region', { name: 'Session activity' }).then(() => {
    expect(screen.getByRole('region', { name: 'Session activity' })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'One' })).toBeInTheDocument()
    expect(screen.queryByRole('dialog', { name: 'Ask your guide' })).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Ask your guide' }))
    expect(screen.getByRole('dialog', { name: 'Ask your guide' })).toBeInTheDocument()
    })
  })

  it('preserves the choice and guide draft/open state across theme swaps', async () => {
    renderPlayer()
    await screen.findByRole('radio', { name: 'Two' })
    fireEvent.click(screen.getByRole('radio', { name: 'Two' }))
    fireEvent.click(screen.getByRole('button', { name: 'Ask your guide' }))
    fireEvent.change(screen.getByRole('textbox', { name: 'Message your guide' }), { target: { value: 'Could I see one more example?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Swap theme' }))
    await screen.findByRole('dialog', { name: 'Ask your guide' })
    expect(screen.getByRole('radio', { name: 'Two' })).toBeChecked()
    expect(screen.getByRole('textbox', { name: 'Message your guide' })).toHaveValue('Could I see one more example?')
  })

  it.each([
    ['ordering', { id: 'order', type: 'ordering', title: 'Order', prompt: 'Arrange', items: [{ id: 'a', label: 'First' }, { id: 'b', label: 'Second' }], required: true }, 'Move First down', 'SecondFirst'],
    ['written answer', { id: 'answer', type: 'short_answer', title: 'Answer', prompt: 'Explain', responseHint: 'In your words', minChars: 1, maxChars: 100, required: true }, ['textbox', 'Explain'], 'A useful explanation'],
    ['reflection', { id: 'reflection', type: 'reflection', title: 'Reflect', prompt: 'Takeaway', maxChars: 100, required: true }, ['textbox', 'Takeaway'], 'I learned something useful'],
    ['worked example reveal', { id: 'example', type: 'worked_example', title: 'Example', problem: 'Problem', steps: [{ id: 's1', title: 'First step', content: 'Work' }, { id: 's2', title: 'Second step', content: 'More work' }], takeaway: 'Takeaway', required: true }, 'Reveal next step', 'First step'],
  ])('preserves %s input across a theme swap', async (_name, block, action, expected) => {
    renderPlayer({ activityDocument: { blocks: [block] }, activityState: { currentBlockId: block.id, blocks: {} }, activityProgress: { completed: 0, total: 1, currentBlockId: block.id } })
    await screen.findByText(block.title)
    if (block.type === 'ordering' || block.type === 'worked_example') fireEvent.click(screen.getByRole('button', { name: action }))
    else fireEvent.change(screen.getByRole(action[0], { name: action[1] }), { target: { value: expected } })
    if (block.type === 'worked_example') expect(await screen.findByRole('heading', { name: expected })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Swap theme' }))
    await waitFor(() => expect(document.querySelector('.learning-surface--workshop')).toBeInTheDocument())
    if (block.type === 'ordering') expect(screen.getAllByRole('listitem').filter((item) => item.closest('[aria-label="Items to put in order"]')).map((item) => item.querySelector('.session-order-label').textContent).join('')).toBe(expected)
    else if (block.type === 'worked_example') expect(screen.getByRole('heading', { name: expected })).toBeInTheDocument()
    else expect(screen.getByRole(action[0], { name: action[1] })).toHaveValue(expected)
  })
})
