import { useMemo, useSyncExternalStore } from 'react'
import {
  getAllPlaybackRegionScanJobs,
  subscribePlaybackRegionScanJobs,
} from './playbackRegionScanJobs'

function getJobsRevision() {
  return getAllPlaybackRegionScanJobs().map(function(job) {
    return [
      job.tuneId,
      job.linkIndex,
      job.isScanning ? 1 : 0,
      job.progress,
      job.status,
      job.error,
    ].join(':')
  }).join('|')
}

export default function useAllPlaybackRegionScanJobs() {
  const revision = useSyncExternalStore(
    subscribePlaybackRegionScanJobs,
    getJobsRevision,
    function() { return '' }
  )
  return useMemo(function() {
    return getAllPlaybackRegionScanJobs()
  }, [revision])
}
