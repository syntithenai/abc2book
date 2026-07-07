import { useEffect, useState, useCallback } from 'react'
import * as mediaCacheQueue from './mediaCacheQueue'

export default function useMediaCacheQueue() {
  const [state, setState] = useState(mediaCacheQueue.getState())

  useEffect(function() {
    return mediaCacheQueue.subscribe(setState)
  }, [])

  const start = useCallback(function() {
    mediaCacheQueue.start()
  }, [])

  const stop = useCallback(function() {
    mediaCacheQueue.stop()
  }, [])

  const cancelJob = useCallback(function(id) {
    mediaCacheQueue.cancelJob(id)
  }, [])

  const cancelAll = useCallback(function() {
    mediaCacheQueue.cancelAllJobs()
  }, [])

  const clearFinished = useCallback(function() {
    mediaCacheQueue.clearFinishedJobs()
  }, [])

  const pendingCount = state.jobs.filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  }).length

  return {
    state: state,
    pendingCount: pendingCount,
    start: start,
    stop: stop,
    cancelJob: cancelJob,
    cancelAll: cancelAll,
    clearFinished: clearFinished,
    enqueueCacheJob: mediaCacheQueue.enqueueCacheJob,
    enqueueDownloadJob: mediaCacheQueue.enqueueDownloadJob,
    enqueueTunesCacheJobs: mediaCacheQueue.enqueueTunesCacheJobs,
    enqueueTunesDownloadJobs: mediaCacheQueue.enqueueTunesDownloadJobs,
  }
}
