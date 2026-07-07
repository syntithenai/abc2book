import {
  MEDIA_SESSION_ACTIONS,
  registerMediaSessionHandlers,
  clearMediaSessionHandlersRegistration,
} from './mediaSessionActions'

describe('useTuneBookMediaController media session registration', function() {
  test('registers handlers for all supported media session actions', function() {
    const setActionHandler = jest.fn()
    const mediaSession = { setActionHandler: setActionHandler }
    const handlers = {}

    MEDIA_SESSION_ACTIONS.forEach(function(action) {
      handlers[action] = jest.fn()
    })

    registerMediaSessionHandlers(mediaSession, handlers)

    expect(setActionHandler).toHaveBeenCalledTimes(MEDIA_SESSION_ACTIONS.length)
    MEDIA_SESSION_ACTIONS.forEach(function(action) {
      expect(setActionHandler).toHaveBeenCalledWith(action, handlers[action])
    })
  })

  test('clears handlers by registering null for all media session actions', function() {
    const setActionHandler = jest.fn()
    const mediaSession = { setActionHandler: setActionHandler }

    clearMediaSessionHandlersRegistration(mediaSession)

    expect(setActionHandler).toHaveBeenCalledTimes(MEDIA_SESSION_ACTIONS.length)
    MEDIA_SESSION_ACTIONS.forEach(function(action) {
      expect(setActionHandler).toHaveBeenCalledWith(action, null)
    })
  })

  test('is a no-op when media session object is unavailable', function() {
    expect(function() {
      registerMediaSessionHandlers(null, {})
      clearMediaSessionHandlersRegistration(null)
    }).not.toThrow()
  })
})
