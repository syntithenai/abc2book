/**
 * Songbook Google Drive save status for Settings → Background jobs.
 */
const listeners = new Set()

let state = {
  status: 'idle',
  message: '',
  lastError: null,
  lastSyncedAt: null,
}

function notify() {
  listeners.forEach(function(listener) {
    try { listener(state) } catch (e) { /* ignore */ }
  })
}

export function getDriveSongbookSyncState() {
  return state
}

export function subscribeDriveSongbookSync(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.add(listener)
  return function() { listeners.delete(listener) }
}

export function patchDriveSongbookSync(patch) {
  state = Object.assign({}, state, patch || {})
  notify()
}

export function markDriveSongbookSyncPending() {
  patchDriveSongbookSync({
    status: 'pending',
    message: 'Songbook save scheduled…',
    lastError: null,
  })
}

export function markDriveSongbookSyncRunning() {
  patchDriveSongbookSync({
    status: 'running',
    message: 'Saving songbook to Google Drive…',
  })
}

export function markDriveSongbookSyncSuccess() {
  patchDriveSongbookSync({
    status: 'success',
    message: 'Songbook saved to Google Drive.',
    lastError: null,
    lastSyncedAt: Date.now(),
  })
}

export function markDriveSongbookSyncCancelled() {
  patchDriveSongbookSync({
    status: 'idle',
    message: 'Songbook save cancelled.',
  })
}

export function markDriveSongbookSyncError(err) {
  const message = (err && err.message) ? err.message : String(err || 'Save failed')
  patchDriveSongbookSync({
    status: 'error',
    message: message,
    lastError: message,
  })
}

export function __resetDriveSongbookSyncForTests() {
  state = {
    status: 'idle',
    message: '',
    lastError: null,
    lastSyncedAt: null,
  }
}
