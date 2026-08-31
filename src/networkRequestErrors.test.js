import {
  isUnhandledNetworkFailure,
  networkFailureToastMessage,
  dismissWebpackDevServerOverlay,
  installUnhandledNetworkErrorHandlers,
  resetUnhandledNetworkErrorHandlersForTests,
} from './networkRequestErrors'

describe('networkRequestErrors', function() {
  beforeEach(function() {
    resetUnhandledNetworkErrorHandlersForTests()
  })

  test('isUnhandledNetworkFailure recognizes axios and MusicBrainz failures', function() {
    expect(isUnhandledNetworkFailure({ name: 'AbortError' })).toBe(false)
    expect(isUnhandledNetworkFailure({ code: 'MUSICBRAINZ_BUSY' })).toBe(true)
    expect(isUnhandledNetworkFailure({
      message: 'Request failed with status code 503',
    })).toBe(true)
    expect(isUnhandledNetworkFailure({ isAxiosError: true })).toBe(true)
    expect(isUnhandledNetworkFailure({ response: { status: 502 } })).toBe(true)
    expect(isUnhandledNetworkFailure(new Error('something else'))).toBe(false)
  })

  test('networkFailureToastMessage prefers friendly messages', function() {
    expect(networkFailureToastMessage({
      message: 'MusicBrainz is busy — wait a moment and try again.',
    })).toBe('MusicBrainz is busy — wait a moment and try again.')
    expect(networkFailureToastMessage({
      message: 'Request failed with status code 503',
    })).toBe('A network request failed. Try again.')
  })

  test('dismissWebpackDevServerOverlay removes the runtime overlay iframe', function() {
    const iframe = document.createElement('iframe')
    iframe.id = 'webpack-dev-server-client-overlay'
    document.body.appendChild(iframe)
    dismissWebpackDevServerOverlay()
    expect(document.getElementById('webpack-dev-server-client-overlay')).toBe(null)
  })

  test('installUnhandledNetworkErrorHandlers preventDefault, toasts, and clears overlay', function() {
    jest.useFakeTimers()
    const toastError = jest.fn()
    const handlers = []
    const originalAdd = window.addEventListener.bind(window)
    window.addEventListener = function(type, handler, options) {
      if (type === 'unhandledrejection') handlers.push({ handler: handler, options: options })
      return originalAdd(type, handler, options)
    }
    const iframe = document.createElement('iframe')
    iframe.id = 'webpack-dev-server-client-overlay'
    document.body.appendChild(iframe)
    try {
      installUnhandledNetworkErrorHandlers(toastError)
      const synthetic = {
        reason: {
          message: 'Request failed with status code 503',
          isAxiosError: true,
        },
        preventDefault: jest.fn(),
      }
      expect(handlers.length).toBe(1)
      expect(handlers[0].options).toBe(true)
      handlers[0].handler(synthetic)
      expect(synthetic.preventDefault).toHaveBeenCalled()
      expect(toastError).toHaveBeenCalledWith('A network request failed. Try again.')
      expect(document.getElementById('webpack-dev-server-client-overlay')).toBe(null)
      // Delayed dismiss retries should not throw when already gone.
      jest.runOnlyPendingTimers()
    } finally {
      window.addEventListener = originalAdd
      jest.useRealTimers()
      const leftover = document.getElementById('webpack-dev-server-client-overlay')
      if (leftover && leftover.parentNode) leftover.parentNode.removeChild(leftover)
    }
  })
})
