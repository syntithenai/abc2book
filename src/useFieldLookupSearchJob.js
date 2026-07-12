import { useEffect, useMemo, useRef } from 'react'
import useTuneFieldLookupQueue from './useTuneFieldLookupQueue'
import {
  applyFieldLookupChoice,
  dismissFieldLookup,
  getActiveJob,
  targetKeyForJob,
} from './tuneFieldLookupQueue'

export function buildFieldLookupTargetKey(tuneId, candidateId) {
  if (tuneId) return 'tune:' + String(tuneId)
  if (candidateId) return 'candidate:' + String(candidateId)
  return ''
}

/**
 * Shared wiring for lyrics/chords/composer/notation search buttons.
 * Enqueues into tuneFieldLookupQueue (no nav-guard registration).
 */
export function useFieldLookupSearchJob(options) {
  const opts = options || {}
  const queue = useTuneFieldLookupQueue()
  const targetKey = buildFieldLookupTargetKey(opts.tuneId, opts.candidateId)
  const kind = opts.kind
  const onAwaitingRef = useRef(opts.onAwaiting)
  const onErrorRef = useRef(opts.onError)
  const onProgressRef = useRef(opts.onProgress)
  onAwaitingRef.current = opts.onAwaiting
  onErrorRef.current = opts.onError
  onProgressRef.current = opts.onProgress

  const activeJob = useMemo(function() {
    if (!targetKey || !kind) return null
    return queue.getActiveJob(targetKey, kind) || getActiveJob(targetKey, kind)
  }, [queue, queue.state.jobs, targetKey, kind])

  const busy = !!(activeJob && (activeJob.status === 'pending' || activeJob.status === 'running'))

  useEffect(function() {
    if (!targetKey || !kind) return undefined
    return queue.registerLiveHandler(targetKey, kind, {
      onAwaiting: function(job) {
        if (typeof onAwaitingRef.current === 'function') onAwaitingRef.current(job)
      },
      onError: function(job) {
        if (typeof onErrorRef.current === 'function') onErrorRef.current(job)
      },
      onProgress: function(job) {
        if (typeof onProgressRef.current === 'function') onProgressRef.current(job)
      },
    })
  }, [targetKey, kind, queue])

  function startSearch(spec) {
    if (!targetKey || !kind) return null
    return queue.enqueueLookup(Object.assign({
      tuneId: opts.tuneId || null,
      candidateId: opts.candidateId || null,
      kind: kind,
    }, spec || {}))
  }

  function cancel() {
    if (!activeJob) return false
    return queue.cancelJob(activeJob.id)
  }

  function applyChoice(candidate) {
    if (!activeJob || activeJob.status !== 'awaiting') return null
    return applyFieldLookupChoice(activeJob.id, candidate)
  }

  function dismiss() {
    if (!activeJob || activeJob.status !== 'awaiting') return false
    return dismissFieldLookup(activeJob.id)
  }

  return {
    queue: queue,
    targetKey: targetKey,
    activeJob: activeJob,
    busy: busy,
    progressPercent: activeJob ? (activeJob.progress || 0) : 0,
    progressMessage: activeJob ? (activeJob.message || '') : '',
    startSearch: startSearch,
    cancel: cancel,
    applyChoice: applyChoice,
    dismiss: dismiss,
    targetKeyForJob: targetKeyForJob,
  }
}
