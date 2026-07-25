import { useEffect, useMemo, useRef } from 'react'
import useTuneFieldLookupQueue from './useTuneFieldLookupQueue'
import useBulkBackgroundResearchQueue from './useBulkBackgroundResearchQueue'

function normalizeTuneId(tuneId) {
  return tuneId == null ? '' : String(tuneId)
}

function findFieldLookupJob(jobs, tuneId, kind) {
  const id = normalizeTuneId(tuneId)
  if (!id) return null
  const targetKey = 'tune:' + id
  return (jobs || []).find(function(job) {
    if (job.kind !== kind) return false
    if (normalizeTuneId(job.tuneId) !== id && job.targetKey !== targetKey) return false
    return job.status === 'pending'
      || job.status === 'running'
      || job.status === 'awaiting'
  }) || null
}

function findBackgroundJob(jobs, tuneId) {
  const id = normalizeTuneId(tuneId)
  if (!id) return null
  return (jobs || []).find(function(job) {
    return normalizeTuneId(job.tuneId) === id
      && (job.status === 'pending' || job.status === 'running')
  }) || null
}

function findJobById(jobs, jobId) {
  return (jobs || []).find(function(job) { return job.id === jobId }) || null
}

export function useBulkCheckSearchJobRefresh(tuneId, onRefresh) {
  const fieldQueue = useTuneFieldLookupQueue()
  const backgroundQueue = useBulkBackgroundResearchQueue()
  const trackedRef = useRef(new Set())
  const handledRef = useRef(new Set())

  useEffect(function() {
    if (!tuneId || typeof onRefresh !== 'function') return
    const id = normalizeTuneId(tuneId)
    const composerJob = findFieldLookupJob(fieldQueue.state.jobs, id, 'composer')
    const backgroundJob = findBackgroundJob(backgroundQueue.state.jobs, id)
    if (composerJob) trackedRef.current.add(composerJob.id)
    if (backgroundJob) trackedRef.current.add(backgroundJob.id)

    trackedRef.current.forEach(function(jobId) {
      if (handledRef.current.has(jobId)) return
      const job = findJobById(fieldQueue.state.jobs, jobId)
        || findJobById(backgroundQueue.state.jobs, jobId)
      if (!job) {
        trackedRef.current.delete(jobId)
        return
      }
      const terminal = job.status === 'done'
        || job.status === 'error'
        || job.status === 'cancelled'
      if (!terminal) return
      handledRef.current.add(jobId)
      trackedRef.current.delete(jobId)
      if (job.status === 'done') onRefresh()
    })
  }, [tuneId, onRefresh, fieldQueue.state.jobs, backgroundQueue.state.jobs])
}

export function useBulkCheckSearchJobStatus(tuneId, actionId) {
  const fieldQueue = useTuneFieldLookupQueue()
  const backgroundQueue = useBulkBackgroundResearchQueue()

  return useMemo(function() {
    if (!tuneId || !actionId) return null
    if (actionId === 'searchArtist') {
      const job = findFieldLookupJob(fieldQueue.state.jobs, tuneId, 'composer')
      if (!job) return null
      return {
        busy: job.status === 'pending' || job.status === 'running',
        percent: job.progress || 0,
        message: job.message || '',
        status: job.status,
        jobId: job.id,
      }
    }
    if (actionId === 'backgroundInfo') {
      const job = findBackgroundJob(backgroundQueue.state.jobs, tuneId)
      if (!job) return null
      return {
        busy: true,
        percent: job.progress || 0,
        message: job.message || '',
        status: job.status,
        jobId: job.id,
      }
    }
    return null
  }, [tuneId, actionId, fieldQueue.state.jobs, backgroundQueue.state.jobs])
}
