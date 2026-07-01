export function isAbortError(error) {
  if (!error) return false
  if (error.name === 'AbortError') return true
  const message = String(error.message || '')
  return message === 'The user aborted a request.'
    || message.indexOf('aborted') >= 0
    || message.indexOf('AbortError') >= 0
}
