import { useMemo, useSyncExternalStore } from 'react'
import {
  getScratchpadBackgroundJobs,
  subscribeScratchpadBackgroundJobs,
} from './scratchpadBackgroundJobs'

function getJobsRevision() {
  return getScratchpadBackgroundJobs().map(function(job) {
    return [
      job.id,
      job.status,
      job.progress || 0,
      job.message || '',
      job.error || '',
      job.createdItemId || '',
    ].join(':')
  }).join('|')
}

export default function useAllScratchpadBackgroundJobs() {
  const revision = useSyncExternalStore(
    subscribeScratchpadBackgroundJobs,
    getJobsRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getScratchpadBackgroundJobs()
  }, [revision])
}
