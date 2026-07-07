import { isReviewSessionActive } from './importReviewSession'

let session = null
let uiVisible = false
const listeners = new Set()

function notify() {
  listeners.forEach(function(listener) {
    listener()
  })
}

export function registerImportReviewStarter(handler) {
  startReviewHandler = handler
}

export function requestImportReview(candidates) {
  if (typeof startReviewHandler === 'function') {
    startReviewHandler(candidates)
  }
}

let startReviewHandler = null

export function getImportReviewSession() {
  return session
}

export function isImportReviewUiVisible() {
  return uiVisible
}

export function setImportReviewSession(next) {
  session = next
  notify()
}

export function showImportReviewUi() {
  uiVisible = true
  notify()
}

export function hideImportReviewUi() {
  uiVisible = false
  notify()
}

export function clearImportReviewSession() {
  session = null
  uiVisible = false
  notify()
}

export function hasActiveImportReviewSession() {
  return isReviewSessionActive(session)
}

export function subscribeImportReviewSession(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function getImportReviewSessionRevision() {
  if (!session) return ''
  const jobs = session.enrichmentJobs || []
  return [
    session.step,
    session.phase,
    session.index,
    session.mergeIndex,
    Object.keys(session.importedCandidateIds || {}).length,
    jobs.map(function(job) {
      return job.id + ':' + job.status
    }).join(','),
    uiVisible ? '1' : '0',
  ].join('|')
}

export function __resetImportReviewSessionStoreForTests() {
  session = null
  uiVisible = false
  startReviewHandler = null
  listeners.clear()
}
