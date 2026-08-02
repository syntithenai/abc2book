import { isAndroidApp } from './platformUtils'

async function enrichMicError(error, devices) {
  const audioInputs = devices
    ? devices.filter(function(d) { return d.kind === 'audioinput' })
    : (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices
      ? await navigator.mediaDevices.enumerateDevices().then(function(list) {
        return list.filter(function(d) { return d.kind === 'audioinput' })
      }).catch(function() { return [] })
      : [])
  let micPermissionState = 'unknown'
  if (navigator.permissions && navigator.permissions.query) {
    try {
      const status = await navigator.permissions.query({ name: 'microphone' })
      if (status && status.state) micPermissionState = status.state
    } catch (e) {
      // ignore
    }
  }
  return Object.assign(error, {
    audioInputCount: audioInputs.length,
    micPermissionState: micPermissionState,
  })
}

/**
 * Start getUserMedia synchronously inside a user-gesture handler (pointerdown).
 * Returns a promise; must be called before any await in the gesture handler.
 */
export function kickoffMicrophoneAccess() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    return Promise.reject(Object.assign(new Error('Microphone not supported in this browser'), {
      name: 'NotSupportedError',
    }))
  }
  return navigator.mediaDevices.getUserMedia({ audio: true })
}

/**
 * Open the device microphone. Call synchronously from a pointer/click handler on
 * Android so the permission prompt stays tied to the user gesture.
 */
export async function openMicrophoneStream(constraints, streamPromise) {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('Microphone not supported in this browser'), {
      name: 'NotSupportedError',
    })
  }
  const baseConstraints = constraints || { audio: true }
  if (streamPromise) {
    try {
      const stream = await streamPromise
      return stream
    } catch (error) {
      throw await enrichMicError(error)
    }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(baseConstraints)
    return stream
  } catch (error) {
    if (!error || (error.name !== 'NotFoundError' && error.name !== 'OverconstrainedError')) {
      throw error
    }
    if (!navigator.mediaDevices.enumerateDevices) throw error
    const devices = await navigator.mediaDevices.enumerateDevices()
    let lastError = error
    for (let i = 0; i < devices.length; i += 1) {
      const device = devices[i]
      if (!device || device.kind !== 'audioinput' || !device.deviceId) continue
      try {
        return await navigator.mediaDevices.getUserMedia({
          audio: { deviceId: { ideal: device.deviceId } },
        })
      } catch (attemptError) {
        lastError = attemptError
      }
    }
    throw await enrichMicError(lastError, devices)
  }
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
    if (error && error.audioInputCount === 0 && error.micPermissionState === 'granted') {
      return 'Chrome has microphone permission but cannot see any input devices. Fully quit and restart Chrome (or try Firefox), then check that an input device is selected in system Sound settings.'
    }
    return 'No microphone was found on this device. Check your system sound input settings and browser microphone permission for this site.'
  }
  if (name === 'NotReadableError' || /not readable/i.test(message)) {
    return 'The microphone is in use by another app. Close other apps using the mic and try again.'
  }
  return message || 'Microphone access denied'
}
