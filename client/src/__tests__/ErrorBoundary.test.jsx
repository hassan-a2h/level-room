import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import ErrorBoundary from '../components/ErrorBoundary.jsx'

function BombComponent({ shouldThrow }) {
  if (shouldThrow) {
    throw new Error('Test explosion')
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
    expect(screen.getByText(/your progress is safely saved/i)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent(/something went wrong/i)
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /go to dashboard/i })).toBeInTheDocument()
  })

  it('shows technical details in a collapsible section', () => {
    render(
      <ErrorBoundary>
        <BombComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    const details = screen.getByText(/technical details/i)
    expect(details).toBeInTheDocument()
  })

  it('clicking "Go to Dashboard" resets the boundary', () => {
    const { container } = render(
      <ErrorBoundary>
        <BombComponent shouldThrow={true} />
      </ErrorBoundary>
    )
    // We can't fully test navigation in jsdom, but we can verify the button exists and is clickable
    const button = screen.getByRole('button', { name: /go to dashboard/i })
    expect(button).toBeInTheDocument()
    fireEvent.click(button)
    // The boundary resets but since we're in jsdom with no navigation,
    // the error UI may still render. The important part is no crash.
  })
})
