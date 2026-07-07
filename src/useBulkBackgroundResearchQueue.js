import { useCallback, useEffect, useState } from 'react'
import * as bulkBackgroundResearchQueue from './bulkBackgroundResearchQueue'

export default function useBulkBackgroundResearchQueue() {
  const [state, setState] = useState(bulkBackgroundResearchQueue.getState())

  useEffect(function() {
    return bulkBackgroundResearchQueue.subscribe(setState)
  }, [])

  const start = useCallback(function() {
    bulkBackgroundResearchQueue.start()
  }, [])

  const stop = useCallback(function() {
    bulkBackgroundResearchQueue.stop()
  }, [])

  const cancelJob = useCallback(function(id) {
    bulkBackgroundResearchQueue.cancelJob(id)
  }, [])

  const cancelAll = useCallback(function() {
    bulkBackgroundResearchQueue.cancelAllJobs()
  }, [])

  const clearFinished = useCallback(function() {
    bulkBackgroundResearchQueue.clearFinishedJobs()
  }, [])

  const pendingCount = state.jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  }).length

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
    enqueueTunes: bulkBackgroundResearchQueue.enqueueTunes,
    previewEnqueueTunes: bulkBackgroundResearchQueue.previewEnqueueTunes,
  }
}
