import { describe, expect, it } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import AppHeader from '../components/AppHeader.jsx'

describe('AppHeader', () => {
  it('marks the current destination and shows an available review count', () => {
    render(<MemoryRouter initialEntries={['/reviews']}><AppHeader dueCount={3} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Reviews, 3 due' })).toHaveAttribute('aria-current', 'page')
    expect(screen.getByRole('link', { name: 'Settings' })).toHaveAttribute('href', '/settings')
  })

  it('omits a review badge when a count is unavailable', () => {
    render(<MemoryRouter><AppHeader /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.queryByText(/due/)).not.toBeInTheDocument()
  })

  it('omits the review badge when there is nothing due', () => {
    render(<MemoryRouter><AppHeader dueCount={0} /></MemoryRouter>)
    expect(screen.getByRole('link', { name: 'Reviews' })).toBeInTheDocument()
    expect(screen.queryByText('0')).not.toBeInTheDocument()
  })

  it('opens and closes the compact navigation accessibly', () => {
    render(<MemoryRouter><AppHeader /></MemoryRouter>)
    const toggle = screen.getByRole('button', { name: 'Open navigation' })
    fireEvent.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByRole('navigation', { name: 'Primary navigation' })).toBeVisible()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(toggle).toHaveAttribute('aria-expanded', 'false')
  })

  it('renders a focused route header with a clear return link', () => {
    render(<MemoryRouter><AppHeader variant="focus" title="Linux permissions" returnTo="/" returnLabel="Dashboard" /></MemoryRouter>)
    expect(screen.getByRole('heading', { name: 'Linux permissions' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Back to Dashboard' })).toHaveAttribute('href', '/')
  })
})
