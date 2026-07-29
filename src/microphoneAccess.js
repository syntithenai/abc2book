import { isAndroidApp } from './platformUtils'

/**
 * Open the device microphone. Call synchronously from a pointer/click handler on
 * Android so the permission prompt stays tied to the user gesture.
 */
export async function openMicrophoneStream(constraints) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('Microphone not supported in this browser'), {
      name: 'NotSupportedError',
    })
  }
  return navigator.mediaDevices.getUserMedia(constraints || { audio: true })
}

export function stopMicrophoneStream(stream) {
  if (!stream) return
  stream.getTracks().forEach(function(track) {
    track.stop()
  })
}

export function microphoneErrorMessage(error) {
  const name = error && error.name ? error.name : ''
  const message = error && error.message ? String(error.message) : ''
  if (
    name === 'NotAllowedError'
    || name === 'PermissionDeniedError'
    || /permission denied/i.test(message)
  ) {
    return isAndroidApp()
      ? 'Microphone access was blocked. Allow microphone permission for Tunebook in Android Settings.'
      : 'Microphone access was blocked. Allow microphone permission for this site in your browser settings.'
  }
  if (name === 'NotFoundError' || /not found/i.test(message)) {
    return 'No microphone was found on this device.'
  }
  if (name === 'NotReadableError' || /not readable/i.test(message)) {
    return 'The microphone is in use by another app. Close other apps using the mic and try again.'
  }
  return message || 'Microphone access denied'
}
