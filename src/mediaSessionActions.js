export const MEDIA_SESSION_ACTIONS = [
  'play',
  'pause',
  'stop',
  'seekbackward',
  'seekforward',
  'seekto',
  'nexttrack',
  'previoustrack',
]

export function registerMediaSessionHandlers(mediaSession, handlersByAction) {
  if (!mediaSession || typeof mediaSession.setActionHandler !== 'function') return
  const handlers = handlersByAction || {}
  MEDIA_SESSION_ACTIONS.forEach(function(action) {
    const handler = Object.prototype.hasOwnProperty.call(handlers, action)
      ? handlers[action]
      : null
    try {
      mediaSession.setActionHandler(action, handler)
    } catch (e) {}
  })
}

export function clearMediaSessionHandlersRegistration(mediaSession) {
  registerMediaSessionHandlers(mediaSession, {})
}
