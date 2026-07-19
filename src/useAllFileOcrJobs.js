import { useMemo, useSyncExternalStore } from 'react'
import {
  getFileOcrJobs,
  subscribeFileOcrJobs,
} from './fileOcrJobs'

function getJobsRevision() {
  return getFileOcrJobs().map(function(job) {
    return [
      job.id,
      job.status,
      job.progress || 0,
      job.message || '',
      job.error || '',
    ].join(':')
  }).join('|')
}

export default function useAllFileOcrJobs() {
  const revision = useSyncExternalStore(
    subscribeFileOcrJobs,
    getJobsRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getFileOcrJobs()
  }, [revision])
}
