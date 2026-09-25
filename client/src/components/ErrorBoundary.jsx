import { Component } from 'react'
import Button from './ui/Button.jsx'

class ErrorBoundary extends Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false }
  }

  static getDerivedStateFromError() {
    return { hasError: true }
  }

  componentDidCatch(error, errorInfo) {
    // Log to console for debugging
    console.error('ErrorBoundary caught an error:', error, errorInfo)
  }

  handleReload = () => {
    window.location.reload()
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
                We hit a snag. Try reloading, or return to your Trail and continue when you’re ready.
              </p>
            </div>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button
                onClick={this.handleReload}
                className="w-full sm:w-auto"
              >
                Reload Page
              </Button>
              <a href="/" className="ui-button ui-button-secondary w-full sm:w-auto">Continue Trail</a>
            </div>
          </div>
        </div>
      )
    }

    return this.props.children
  }
}

export default ErrorBoundary
