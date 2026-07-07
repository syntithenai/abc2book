import { useCallback, useEffect, useState } from 'react'
import * as bulkComposerDiscoveryQueue from './bulkComposerDiscoveryQueue'

export default function useBulkComposerDiscoveryQueue() {
  const [state, setState] = useState(bulkComposerDiscoveryQueue.getState())

  useEffect(function() {
    return bulkComposerDiscoveryQueue.subscribe(setState)
  }, [])

  const start = useCallback(function() {
    bulkComposerDiscoveryQueue.start()
  }, [])

  const stop = useCallback(function() {
    bulkComposerDiscoveryQueue.stop()
  }, [])

  const cancelJob = useCallback(function(id) {
    bulkComposerDiscoveryQueue.cancelJob(id)
  }, [])

  const cancelAll = useCallback(function() {
    bulkComposerDiscoveryQueue.cancelAllJobs()
  }, [])

  const clearFinished = useCallback(function() {
    bulkComposerDiscoveryQueue.clearFinishedJobs()
  }, [])

  const pendingCount = state.jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running' || job.status === 'awaiting'
  }).length

  const applyComposerChoice = useCallback(function(jobId, composer) {
    return bulkComposerDiscoveryQueue.applyComposerDiscoveryChoice(jobId, composer)
  }, [])

  return {
    state: state,
    pendingCount: pendingCount,
    overallProgress: state.overallProgress,
    finishedCount: state.finishedCount,
    totalCount: state.totalCount,
    start: start,
    stop: stop,
    cancelJob: cancelJob,
    cancelAll: cancelAll,
    clearFinished: clearFinished,
    enqueueTunes: bulkComposerDiscoveryQueue.enqueueTunes,
    previewEnqueueTunes: bulkComposerDiscoveryQueue.previewEnqueueTunes,
    applyComposerChoice: applyComposerChoice,
  }
}
