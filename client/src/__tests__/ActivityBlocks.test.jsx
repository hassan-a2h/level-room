import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import ActivityRenderer from '../components/session/ActivityRenderer.jsx'

const base = { id: 'test-block', required: true, estimatedMinutes: 2, outcomeIds: ['sql-joins'], title: 'Choose the next step' }
const common = { persistedBlockState: {}, onComplete: vi.fn(), onSubmit: vi.fn() }

describe('Session activity blocks', () => {
  it('renders safe Markdown for read blocks and continues', () => {
    const onComplete = vi.fn()
    render(<ActivityRenderer {...common} onComplete={onComplete} block={{ ...base, type: 'read', content: 'A **left join** keeps unmatched rows. <script>alert(1)</script>' }} />)
    expect(screen.getByText('left join')).toBeInTheDocument()
    expect(document.querySelector('script')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    expect(onComplete).toHaveBeenCalledWith({ action: 'continue' })
  })

  it('reveals worked-example steps one at a time in their saved order', () => {
    const onComplete = vi.fn()
    render(<ActivityRenderer {...common} onComplete={onComplete} block={{ ...base, type: 'worked_example', problem: 'Join two tables', steps: [
      { id: 'first', title: 'First', content: 'Pick the left table.' }, { id: 'second', title: 'Second', content: 'Add the join condition.' },
    ], takeaway: 'Check unmatched rows.' }} />)
    expect(screen.queryByText('Pick the left table.')).not.toBeInTheDocument()
    expect(screen.queryByText('Add the join condition.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reveal next step/i }))
    expect(screen.getByText('Pick the left table.')).toBeInTheDocument()
    expect(screen.queryByText('Add the join condition.')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /reveal next step/i }))
    expect(screen.getByText('Add the join condition.')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))
    expect(onComplete).toHaveBeenCalledWith({ action: 'continue' })
  })

  it('uses a labeled radio group, preserves a failed choice, and focuses polite feedback', () => {
    render(<ActivityRenderer {...common} persistedBlockState={{ status: 'needs_retry', attempts: 1, response: 'inner', feedback: 'The unmatched rows are missing.' }} block={{ ...base, type: 'choice', prompt: 'Which join keeps every left row?', options: [{ id: 'inner', label: 'INNER JOIN' }, { id: 'left', label: 'LEFT JOIN' }] }} />)
    expect(screen.getByRole('radiogroup', { name: /which join keeps every left row/i })).toBeInTheDocument()
    expect(screen.getByRole('radio', { name: 'INNER JOIN' })).toBeChecked()
    expect(screen.getByRole('region', { name: /activity feedback/i })).toHaveAttribute('aria-live', 'polite')
    fireEvent.click(screen.getByRole('radio', { name: 'LEFT JOIN' }))
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(common.onSubmit).toHaveBeenCalledWith('left')
  })

  it('supports controlled choices for session theme adapters', () => {
    const onDraftChange = vi.fn()
    const block = { ...base, type: 'choice', prompt: 'Pick one', options: [{ id: 'one', label: 'One' }, { id: 'two', label: 'Two' }] }
    const view = render(<ActivityRenderer {...common} block={block} draft="" onDraftChange={onDraftChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Two' }))
    expect(onDraftChange).toHaveBeenCalledWith('two')
    view.rerender(<ActivityRenderer {...common} block={block} draft="two" onDraftChange={onDraftChange} />)
    expect(screen.getByRole('radio', { name: 'Two' })).toBeChecked()
  })

  it('supports keyboard ordering with Move up and Move down and preserves failed order', () => {
    const onSubmit = vi.fn()
    render(<ActivityRenderer {...common} onSubmit={onSubmit} persistedBlockState={{ status: 'needs_retry', response: ['condition', 'left'] }} block={{ ...base, type: 'ordering', prompt: 'Build the join in order', items: [{ id: 'left', label: 'Choose the left table' }, { id: 'condition', label: 'Add the condition' }] }} />)
    const leftItem = screen.getByText('Add the condition').closest('li')
    fireEvent.click(within(leftItem).getByRole('button', { name: /move.*down/i }))
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onSubmit).toHaveBeenCalledWith(['left', 'condition'])
  })

  it('shows short-answer response guidance, live count, bounds, and allows retry', () => {
    const onSubmit = vi.fn()
    render(<ActivityRenderer {...common} onSubmit={onSubmit} persistedBlockState={{ status: 'needs_retry', response: 'A left join keeps the left rows.' }} block={{ ...base, type: 'short_answer', prompt: 'Explain what stays in the result.', responseHint: 'Name the preserved side and unmatched rows.', minChars: 12, maxChars: 80 }} />)
    const input = screen.getByRole('textbox', { name: /explain what stays/i })
    expect(screen.getByText('Name the preserved side and unmatched rows.')).toBeInTheDocument()
    expect(screen.getByText(/32 \/ 80 characters/i)).toBeInTheDocument()
    expect(input).toHaveAttribute('maxLength', '80')
    fireEvent.change(input, { target: { value: 'A left join keeps left rows.' } })
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(onSubmit).toHaveBeenCalledWith('A left join keeps left rows.')
  })

  it('saves reflections without correctness language', () => {
    const onComplete = vi.fn()
    render(<ActivityRenderer {...common} onComplete={onComplete} block={{ ...base, type: 'reflection', prompt: 'What will you remember?', placeholder: 'A useful takeaway…', maxChars: 100 }} />)
    fireEvent.change(screen.getByRole('textbox', { name: /what will you remember/i }), { target: { value: 'Check the preserved side.' } })
    fireEvent.click(screen.getByRole('button', { name: /save takeaway/i }))
    expect(onComplete).toHaveBeenCalledWith({ action: 'continue', response: 'Check the preserved side.' })
    expect(screen.queryByText(/correct|incorrect/i)).not.toBeInTheDocument()
  })

  it('renders unknown block types as recoverable and never completes them', () => {
    const onComplete = vi.fn()
    render(<ActivityRenderer {...common} onComplete={onComplete} block={{ ...base, type: 'video' }} />)
    expect(screen.getByRole('alert')).toHaveTextContent(/unsupported activity/i)
    expect(screen.queryByRole('button', { name: /continue/i })).not.toBeInTheDocument()
    expect(onComplete).not.toHaveBeenCalled()
  })
})
