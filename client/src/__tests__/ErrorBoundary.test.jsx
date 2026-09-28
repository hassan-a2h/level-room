import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary.jsx'

function BombComponent({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error(typeof shouldThrow === 'string' ? shouldThrow : 'Test explosion')
  }
  return <div data-testid="safe">Safe content</div>
}

describe('ErrorBoundary', () => {
  // Suppress console.error for expected errors
  const originalConsoleError = console.error
  beforeEach(() => {
    console.error = vi.fn()
  })
  afterEach(() => {
    console.error = originalConsoleError
  })

  it('renders children when no error occurs', () => {
    render(
      <ErrorBoundary>
        <BombComponent shouldThrow={false} />
      </ErrorBoundary>
    )
    expect(screen.getByTestId('safe')).toBeInTheDocument()
  })

  it('shows friendly error UI when a child throws', () => {
    render(
      <ErrorBoundary>
        <BombComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByText(/something went wrong/i)).toBeInTheDocument()
    expect(screen.getByText(/try reloading.*return to your trail/i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /continue trail/i })).toHaveAttribute('href', '/')
  })

  it('does not expose database or technical exception details in the UI', () => {
    render(
      <ErrorBoundary>
        <BombComponent shouldThrow="SQLITE_ERROR: constraint failed in user_progress" />
      </ErrorBoundary>
    )
    expect(screen.queryByText(/technical details/i)).not.toBeInTheDocument()
    expect(screen.queryByText(/SQLITE_ERROR|constraint failed|user_progress/i)).not.toBeInTheDocument()
  })

  it('offers a safe route back to the Trail', () => {
    const { container } = render(
      <ErrorBoundary>
        <BombComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    expect(screen.getByRole('link', { name: /continue trail/i })).toHaveAttribute('href', '/')
  })

  it('routes boundary failures to Support without passing internal details', () => {
    render(<ErrorBoundary><BombComponent shouldThrow="SQLITE_ERROR: private table details" /></ErrorBoundary>)
    const supportLink = screen.getByRole('link', { name: /get support/i })
    expect(supportLink).toHaveAttribute('href', expect.stringContaining('/support?'))
    expect(supportLink.getAttribute('href')).not.toMatch(/SQLITE_ERROR|private table details/)
  })
})
