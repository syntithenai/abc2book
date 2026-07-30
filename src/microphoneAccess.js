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
  // #region agent log
  fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'microphoneAccess.js:kickoffMicrophoneAccess',message:'sync getUserMedia kickoff',data:{isSecureContext:typeof window!=='undefined'?window.isSecureContext:null,hasMediaDevices:!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia),userAgent:typeof navigator!=='undefined'?navigator.userAgent.slice(0,120):null,inIframe:typeof window!=='undefined'?window.self!==window.top:null},timestamp:Date.now(),hypothesisId:'H6,H7'})}).catch(()=>{});
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices) {
    navigator.mediaDevices.enumerateDevices().then(function(devices) {
      const audioInputs = devices.filter(function(d) { return d.kind === 'audioinput' })
      let permState = 'unknown'
      const permQuery = navigator.permissions && navigator.permissions.query
        ? navigator.permissions.query({ name: 'microphone' }).catch(function() { return null })
        : Promise.resolve(null)
      permQuery.then(function(status) {
        if (status && status.state) permState = status.state
        fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'microphoneAccess.js:kickoffMicrophoneAccess:preEnum',message:'pre-getUserMedia device snapshot',data:{audioInputCount:audioInputs.length,permState:permState,deviceIds:audioInputs.map(function(d){return d.deviceId?d.deviceId.slice(0,8)+'…':''})},timestamp:Date.now(),hypothesisId:'H8,H9'})}).catch(function(){})
      })
    }).catch(function(){})
  }
  // #endregion
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
  // #region agent log
  fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'microphoneAccess.js:openMicrophoneStream:entry',message:'openMicrophoneStream called',data:{hasMediaDevices:!!(navigator.mediaDevices&&navigator.mediaDevices.getUserMedia),constraints:constraints||{audio:true},hasStreamPromise:!!streamPromise},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
  if (navigator.mediaDevices && navigator.mediaDevices.enumerateDevices && !streamPromise) {
    navigator.mediaDevices.enumerateDevices().then(function(devices) {
      const audioInputs = devices.filter(function(d) { return d.kind === 'audioinput' })
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'microphoneAccess.js:openMicrophoneStream:preEnum',message:'pre-getUserMedia device snapshot (hold path)',data:{audioInputCount:audioInputs.length,deviceIds:audioInputs.map(function(d){return d.deviceId?d.deviceId.slice(0,8)+'…':''})},timestamp:Date.now(),hypothesisId:'H8,H9'})}).catch(function(){})
    }).catch(function(){})
  }
  // #endregion
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    throw Object.assign(new Error('Microphone not supported in this browser'), {
      name: 'NotSupportedError',
    })
  }
  const baseConstraints = constraints || { audio: true }
  if (streamPromise) {
    try {
      const stream = await streamPromise
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'microphoneAccess.js:openMicrophoneStream:gesturePromiseSuccess',message:'gesture stream promise resolved',data:{trackCount:stream.getAudioTracks?stream.getAudioTracks().length:0},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      return stream
    } catch (error) {
      // #region agent log
      fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',runId:'post-fix',location:'microphoneAccess.js:openMicrophoneStream:gesturePromiseFailed',message:'gesture stream promise rejected',data:{errorName:error&&error.name,errorMessage:error&&error.message},timestamp:Date.now(),hypothesisId:'H6'})}).catch(()=>{});
      // #endregion
      throw await enrichMicError(error)
    }
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia(baseConstraints)
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'microphoneAccess.js:openMicrophoneStream:success',message:'getUserMedia succeeded on first attempt',data:{trackCount:stream.getAudioTracks?stream.getAudioTracks().length:0,trackStates:stream.getAudioTracks?stream.getAudioTracks().map(function(t){return t.readyState}):[]},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
    return stream
  } catch (error) {
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'microphoneAccess.js:openMicrophoneStream:firstCatch',message:'getUserMedia first attempt failed',data:{errorName:error&&error.name,errorMessage:error&&error.message},timestamp:Date.now(),hypothesisId:'H1,H2'})}).catch(()=>{});
    // #endregion
    if (!error || (error.name !== 'NotFoundError' && error.name !== 'OverconstrainedError')) {
      throw error
    }
    if (!navigator.mediaDevices.enumerateDevices) throw error
    const devices = await navigator.mediaDevices.enumerateDevices()
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'microphoneAccess.js:openMicrophoneStream:enumerated',message:'enumerated audio devices after failure',data:{audioInputCount:devices.filter(function(d){return d.kind==='audioinput'}).length,deviceIds:devices.filter(function(d){return d.kind==='audioinput'}).map(function(d){return d.deviceId?d.deviceId.slice(0,8)+'…':''})},timestamp:Date.now(),hypothesisId:'H1'})}).catch(()=>{});
    // #endregion
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
    // #region agent log
    fetch('http://127.0.0.1:7543/ingest/714bef82-d1cf-4636-9283-79de04198120',{method:'POST',headers:{'Content-Type':'application/json','X-Debug-Session-Id':'552c4e'},body:JSON.stringify({sessionId:'552c4e',location:'microphoneAccess.js:openMicrophoneStream:throw',message:'all getUserMedia attempts failed',data:{errorName:lastError&&lastError.name,errorMessage:lastError&&lastError.message},timestamp:Date.now(),hypothesisId:'H1,H2'})}).catch(()=>{});
    // #endregion
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
