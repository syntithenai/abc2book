import { useCallback, useEffect, useState } from 'react'
import * as tuneFieldLookupQueue from './tuneFieldLookupQueue'

export default function useTuneFieldLookupQueue() {
  const [state, setState] = useState(tuneFieldLookupQueue.getState())

  useEffect(function() {
    return tuneFieldLookupQueue.subscribe(setState)
  }, [])

  const start = useCallback(function() {
    tuneFieldLookupQueue.start()
  }, [])

  const stop = useCallback(function() {
    tuneFieldLookupQueue.stop()
  }, [])

  const cancelJob = useCallback(function(id) {
    return tuneFieldLookupQueue.cancelJob(id)
  }, [])

  const cancelAll = useCallback(function() {
    tuneFieldLookupQueue.cancelAllJobs()
  }, [])

  const clearFinished = useCallback(function() {
    tuneFieldLookupQueue.clearFinishedJobs()
  }, [])

  const enqueueLookup = useCallback(function(spec) {
    const id = tuneFieldLookupQueue.enqueueLookup(spec)
    if (id) tuneFieldLookupQueue.start()
    return id
  }, [])

  const seedAwaitingLookup = useCallback(function(spec) {
    return tuneFieldLookupQueue.seedAwaitingLookup(spec)
  }, [])

  const applyChoice = useCallback(function(jobId, candidate) {
    return tuneFieldLookupQueue.applyFieldLookupChoice(jobId, candidate)
  }, [])

  const dismiss = useCallback(function(jobId) {
    return tuneFieldLookupQueue.dismissFieldLookup(jobId)
  }, [])

  return {
    state: state,
    activeCount: state.activeCount,
    awaitingCount: state.awaitingCount,
    overallProgress: state.overallProgress,
    finishedCount: state.finishedCount,
    totalCount: state.totalCount,
    start: start,
    stop: stop,
    cancelJob: cancelJob,
    cancelAll: cancelAll,
    clearFinished: clearFinished,
    enqueueLookup: enqueueLookup,
    seedAwaitingLookup: seedAwaitingLookup,
    applyChoice: applyChoice,
    dismiss: dismiss,
    getAwaitingJob: tuneFieldLookupQueue.getAwaitingJob,
    getActiveJob: tuneFieldLookupQueue.getActiveJob,
    findJobById: tuneFieldLookupQueue.findJobById,
    registerLiveHandler: tuneFieldLookupQueue.registerLiveHandler,
    targetKeyForJob: tuneFieldLookupQueue.targetKeyForJob,
  }
}
