import React from 'react'
import { Button } from 'react-bootstrap'

/**
 * Catches render errors so a single failure cannot blank the whole TuneBook UI.
 */
export default class AppErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { hasError: false, message: '' }
    this.handleReload = this.handleReload.bind(this)
  }

  static getDerivedStateFromError(error) {
    return {
      hasError: true,
      message: (error && error.message) ? String(error.message) : 'Something went wrong.',
    }
  }

  componentDidCatch(error, info) {
    if (typeof this.props.onError === 'function') {
      this.props.onError(error, info)
    }
  }

  handleReload() {
    if (typeof window !== 'undefined' && window.location) {
      window.location.reload()
    }
  }

  render() {
    if (!this.state.hasError) {
      return this.props.children
    }
    return (
      <div
        className="app-error-boundary p-4 text-center"
        data-testid="app-error-boundary"
        role="alert"
      >
        <h2 className="h4 mb-2">Something went wrong</h2>
        <p className="text-muted mb-3">
          {this.state.message || 'The page hit an unexpected error.'}
        </p>
        <Button variant="primary" onClick={this.handleReload}>
          Reload
        </Button>
      </div>
    )
  }
}
