import { useSyncExternalStore, useMemo } from 'react'

let manualJobCount = 0
let stemJobCount = 0
let nextTrackedJobId = 0
const trackedJobs = new Map()
const listeners = new Set()

function notifyListeners() {
  listeners.forEach(function(listener) {
    listener()
  })
}

export function registerLongRunningJob(options) {
  manualJobCount += 1
  let jobId = null
  if (options && typeof options === 'object') {
    jobId = 'lrj-' + String(++nextTrackedJobId)
    trackedJobs.set(jobId, {
      id: jobId,
      label: options.label || 'Search',
      onCancel: typeof options.onCancel === 'function' ? options.onCancel : null,
    })
  }
  notifyListeners()
  return function unregister() {
    manualJobCount = Math.max(0, manualJobCount - 1)
    if (jobId) {
      trackedJobs.delete(jobId)
    }
    notifyListeners()
  }
}

export function registerStemSeparationJob(options) {
  stemJobCount += 1
  let jobId = null
  if (options && typeof options === 'object') {
    jobId = 'stem-lrj-' + String(++nextTrackedJobId)
    trackedJobs.set(jobId, {
      id: jobId,
      label: options.label || 'Stem separation',
      onCancel: typeof options.onCancel === 'function' ? options.onCancel : null,
    })
  }
  notifyListeners()
  return function unregister() {
    stemJobCount = Math.max(0, stemJobCount - 1)
    if (jobId) {
      trackedJobs.delete(jobId)
    }
    notifyListeners()
  }
}

export function getActiveTrackedJobs() {
  return Array.from(trackedJobs.values())
}

/** Manual searches (not background stem separation). */
export function getManualTrackedSearchJobs() {
  return getActiveTrackedJobs().filter(function(job) {
    return !job.id || job.id.indexOf('stem-lrj-') !== 0
  })
}

function getActiveTrackedJobsRevision() {
  return getActiveTrackedJobs().map(function(job) {
    return job.id + ':' + (job.label || '')
  }).join('|')
}

export function cancelTrackedJob(id) {
  const job = trackedJobs.get(id)
  if (!job || !job.onCancel) return false
  job.onCancel()
  return true
}

export function cancelAllTrackedJobs() {
  getActiveTrackedJobs().forEach(function(job) {
    if (job.onCancel) {
      job.onCancel()
    }
  })
}

export function subscribeLongRunningJobs(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

// Background queues (bulk check, background research, field lookups, playback-region
// scans, media analysis) are intentionally excluded: they keep running while you browse
// tunes and surface completion via the review toast/page.
export function hasActiveLongRunningJobs() {
  // Background stem separation is intentionally excluded (see stemAnalysisJobStore).
  return manualJobCount > 0
}

function subscribeAllLongRunningJobs(listener) {
  return subscribeLongRunningJobs(listener)
}

export function useHasActiveLongRunningJobs() {
  return useSyncExternalStore(
    subscribeAllLongRunningJobs,
    hasActiveLongRunningJobs,
    function() { return false }
  )
}

export function useActiveTrackedJobs() {
  const revision = useSyncExternalStore(
    subscribeLongRunningJobs,
    getActiveTrackedJobsRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getActiveTrackedJobs()
  }, [revision])
}

export function __resetForTests() {
  manualJobCount = 0
  stemJobCount = 0
  nextTrackedJobId = 0
  trackedJobs.clear()
  listeners.clear()
}
