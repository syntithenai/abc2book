import { useMemo, useSyncExternalStore } from 'react'
import {
  getBookImportJobs,
  subscribeBookImportJobs,
} from './bookImportJobStore'

function getJobsRevision() {
  return getBookImportJobs().map(function(job) {
    return [
      job.id,
      job.status,
      job.phase || '',
      job.current || 0,
      job.total || 0,
      job.message || '',
      job.error || '',
      job.updatedAt || 0,
    ].join(':')
  }).join('|')
}

export default function useAllBookImportJobs() {
  const revision = useSyncExternalStore(
    subscribeBookImportJobs,
    getJobsRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getBookImportJobs()
  }, [revision])
}
