import { useCallback, useEffect, useState } from 'react'
import * as stemCreateQueue from './stemCreateQueue'

export default function useStemCreateQueue() {
  const [state, setState] = useState(stemCreateQueue.getState())

  useEffect(function() {
    return stemCreateQueue.subscribe(setState)
  }, [])

  const start = useCallback(function() {
    stemCreateQueue.start()
  }, [])

  const stop = useCallback(function() {
    stemCreateQueue.stop()
  }, [])

  const cancelJob = useCallback(function(id) {
    stemCreateQueue.cancelJob(id)
  }, [])

  const cancelAll = useCallback(function() {
    stemCreateQueue.cancelAllJobs()
  }, [])

  const clearFinished = useCallback(function() {
    stemCreateQueue.clearFinishedJobs()
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
    enqueueStemCreateJob: stemCreateQueue.enqueueStemCreateJob,
    enqueueTunesStemCreateJobs: stemCreateQueue.enqueueTunesStemCreateJobs,
  }
}
