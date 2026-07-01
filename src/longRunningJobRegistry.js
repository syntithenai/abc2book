import { useSyncExternalStore } from 'react'
import { hasActiveMediaAnalysisJobs, subscribeMediaAnalysisJobs } from './mediaAnalysisJobs'
import { hasActivePlaybackRegionScanJobs, subscribePlaybackRegionScanJobs } from './playbackRegionScanJobs'

let manualJobCount = 0
let stemJobCount = 0
const listeners = new Set()

function notifyListeners() {
  listeners.forEach(function(listener) {
    listener()
  })
}

export function registerLongRunningJob() {
  manualJobCount += 1
  notifyListeners()
  return function unregister() {
    manualJobCount = Math.max(0, manualJobCount - 1)
    notifyListeners()
  }
}

export function registerStemSeparationJob() {
  stemJobCount += 1
  notifyListeners()
  return function unregister() {
    stemJobCount = Math.max(0, stemJobCount - 1)
    notifyListeners()
  }
}

export function subscribeLongRunningJobs(listener) {
  listeners.add(listener)
  return function unsubscribe() {
    listeners.delete(listener)
  }
}

export function hasActiveLongRunningJobs() {
  return manualJobCount > 0
    || stemJobCount > 0
    || hasActiveMediaAnalysisJobs()
    || hasActivePlaybackRegionScanJobs()
}

function subscribeAllLongRunningJobs(listener) {
  const unsubs = [
    subscribeLongRunningJobs(listener),
    subscribeMediaAnalysisJobs(listener),
    subscribePlaybackRegionScanJobs(listener),
  ]
  return function unsubscribeAll() {
    unsubs.forEach(function(unsub) { unsub() })
  }
}

export function useHasActiveLongRunningJobs() {
  return useSyncExternalStore(
    subscribeAllLongRunningJobs,
    hasActiveLongRunningJobs,
    function() { return false }
  )
}
