/**
 * Scratchpad Drive sync UI state (login hook updates this).
 */
const listeners = []

let state = {
  status: 'idle',
  message: '',
  lastResult: null,
}

export function getScratchpadSyncState() {
  return state
}

export function subscribeScratchpadSync(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.push(listener)
  return function() {
    const idx = listeners.indexOf(listener)
    if (idx !== -1) listeners.splice(idx, 1)
  }
}

export function patchScratchpadSyncState(patch) {
  state = Object.assign({}, state, patch || {})
  listeners.forEach(function(listener) {
    try { listener(state) } catch (e) { /* ignore */ }
  })
}

export function resetScratchpadSyncState() {
  patchScratchpadSyncState({
    status: 'idle',
    message: '',
    lastResult: null,
  })
}
