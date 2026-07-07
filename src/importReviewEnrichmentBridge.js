let snapshot = {
  active: false,
  jobs: [],
  onSkipJob: null,
  onSkipAll: null,
  onClear: null,
}

const listeners = new Set()

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

export function syncImportReviewEnrichment(options) {
  const next = options || {}
  snapshot = {
    active: true,
    jobs: Array.isArray(next.jobs) ? next.jobs.slice() : [],
    onSkipJob: typeof next.onSkipJob === 'function' ? next.onSkipJob : null,
    onSkipAll: typeof next.onSkipAll === 'function' ? next.onSkipAll : null,
    onClear: typeof next.onClear === 'function' ? next.onClear : null,
  }
  notify()
}

export function clearImportReviewEnrichmentBridge() {
  snapshot = {
    active: false,
    jobs: [],
    onSkipJob: null,
    onSkipAll: null,
    onClear: null,
  }
  notify()
}

export function getImportReviewEnrichmentSnapshot() {
  return snapshot
}

export function subscribeImportReviewEnrichment(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function __resetImportReviewEnrichmentBridgeForTests() {
  clearImportReviewEnrichmentBridge()
  listeners.clear()
}
