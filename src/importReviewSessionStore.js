import { isReviewSessionActive } from './importReviewSession'

const STORAGE_KEY = 'abc2book.importReviewSession'

function readStoredSession() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw)
    if (!parsed || !isReviewSessionActive(parsed)) return null
    return parsed
  } catch (e) {
    return null
  }
}

function writeStoredSession(next) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (!next || !isReviewSessionActive(next)) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(next))
  } catch (e) {}
}

let session = readStoredSession()
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

export function requestImportReview(candidates, options) {
  if (typeof startReviewHandler === 'function') {
    startReviewHandler(candidates, options)
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
  writeStoredSession(next)
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
  writeStoredSession(null)
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
  writeStoredSession(null)
}
