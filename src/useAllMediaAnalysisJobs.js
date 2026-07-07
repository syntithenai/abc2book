import { useMemo, useSyncExternalStore } from 'react'
import {
  getAllMediaAnalysisJobs,
  subscribeMediaAnalysisJobs,
} from './mediaAnalysisJobs'

function getJobsRevision() {
  return getAllMediaAnalysisJobs().map(function(job) {
    return [
      job.tuneId,
      job.isAnalyzing ? 1 : 0,
      job.progress,
      job.status,
      job.error,
    ].join(':')
  }).join('|')
}

export default function useAllMediaAnalysisJobs() {
  const revision = useSyncExternalStore(
    subscribeMediaAnalysisJobs,
    getJobsRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getAllMediaAnalysisJobs()
  }, [revision])
}
