import { Component } from 'react'
import Button from './ui/Button.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, error: null }
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error }
  }

  componentDidCatch(error, errorInfo) {
    // Log to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
  }

  handleGoHome = () => {
    this.setState({ hasError: false, error: null })
    window.location.href = '/'
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="ui-page min-h-screen flex items-center justify-center px-4 py-8">
          <div className="ui-panel p-8 max-w-md w-full text-center">
            <div className="text-5xl mb-4" aria-hidden="true">⚠️</div>
            <div role="alert" className="ui-alert ui-alert-danger mb-6 text-left">
              <h1 className="text-xl font-bold ui-text mb-2">Something went wrong</h1>
              <p className="text-sm ui-text-secondary">
                We encountered an unexpected issue. Your progress is safely saved in the local database. Try reloading the page or going back to the dashboard.
              </p>
            </div>
            {this.state.error && (
              <details className="mb-6 text-left">
                <summary className="text-xs ui-text-muted cursor-pointer">
                  Technical details
                </summary>
                <pre className="ui-alert ui-alert-danger mt-2 text-xs overflow-auto max-h-32">
                  {this.state.error.toString()}
                </pre>
              </details>
            )}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                onClick={this.handleReload}
                className="w-full sm:w-auto"
              >
                Reload Page
              </Button>
              <Button
                variant="secondary"
                onClick={this.handleGoHome}
                className="w-full sm:w-auto"
              >
                Go to Dashboard
              </Button>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
