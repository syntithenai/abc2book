/** Live on-demand stem separation job state (survives media-controls dialog close). */

const EMPTY_SNAPSHOT = {
  active: false,
  progress: 0,
  message: '',
  tuneId: null,
  linkIndex: null,
  tuneName: '',
  error: '',
}

let snapshot = Object.assign({}, EMPTY_SNAPSHOT)
const listeners = new Set()

function notifyListeners() {
  listeners.forEach(function(listener) {
    listener()
  })
}

export function getStemAnalysisJobSnapshot() {
  return snapshot
}

export function getStemAnalysisJobRevision() {
  return [
    snapshot.active ? '1' : '0',
    snapshot.progress,
    snapshot.message,
    snapshot.tuneId || '',
    snapshot.linkIndex != null ? String(snapshot.linkIndex) : '',
    snapshot.tuneName || '',
    snapshot.error || '',
  ].join('|')
}

export function subscribeStemAnalysisJob(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function updateStemAnalysisJob(patch) {
  snapshot = Object.assign({}, snapshot, patch || {})
  notifyListeners()
}

export function clearStemAnalysisJob() {
  snapshot = Object.assign({}, EMPTY_SNAPSHOT)
  notifyListeners()
}

export function __resetStemAnalysisJobStoreForTests() {
  snapshot = Object.assign({}, EMPTY_SNAPSHOT)
  listeners.clear()
}
