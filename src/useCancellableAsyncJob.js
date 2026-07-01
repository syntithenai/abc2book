import { useCallback, useEffect, useRef, useState } from 'react'
import { isAbortError } from './abortUtils'
import { registerLongRunningJob } from './longRunningJobRegistry'

export function useCancellableAsyncJob() {
  const [busy, setBusy] = useState(false)
  const abortRef = useRef(null)
  const generationRef = useRef(0)

  useEffect(function() {
    if (!busy) return undefined
    return registerLongRunningJob()
  }, [busy])

  useEffect(function() {
    return function() {
      if (abortRef.current) {
        abortRef.current.abort()
      }
    }
  }, [])

  const cancel = useCallback(function() {
    if (abortRef.current) {
      abortRef.current.abort()
      abortRef.current = null
    }
    generationRef.current += 1
    setBusy(false)
  }, [])

  const begin = useCallback(function() {
    if (abortRef.current) {
      abortRef.current.abort()
    }
    const generation = generationRef.current + 1
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true)
    return {
      signal: controller.signal,
      generation: generation,
      isCurrent: function() {
        return generation === generationRef.current
      },
    }
  }, [])

  const finish = useCallback(function(generation) {
    if (generation === generationRef.current) {
      setBusy(false)
      abortRef.current = null
    }
  }, [])

  const onTriggerClick = useCallback(function(startFn) {
    if (busy) {
      cancel()
      return
    }
    startFn()
  }, [busy, cancel])

  return {
    busy: busy,
    setBusy: setBusy,
    cancel: cancel,
    begin: begin,
    finish: finish,
    onTriggerClick: onTriggerClick,
    isAbortError: isAbortError,
  }
}
