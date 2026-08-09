import { useCallback, useRef, useState } from 'react'
import {
  runChunkedBulkOperation,
  runChunkedTunebookMutation,
  shouldShowBulkOperationProgress,
  buildBulkProgressEvent,
} from './bulkOperationProgress'

export default function useBulkOperationProgress() {
  const [show, setShow] = useState(false)
  const [title, setTitle] = useState('')
  const [progress, setProgress] = useState(buildBulkProgressEvent(0, 0, ''))
  const cancelRef = useRef(false)

  const reset = useCallback(function() {
    cancelRef.current = false
    setShow(false)
    setTitle('')
    setProgress(buildBulkProgressEvent(0, 0, ''))
  }, [])

  const cancel = useCallback(function() {
    cancelRef.current = true
  }, [])

  const run = useCallback(async function(options) {
    const opts = options || {}
    const items = Array.isArray(opts.items) ? opts.items : []
    const total = items.length
    const useModal = opts.showProgress !== false && shouldShowBulkOperationProgress(total)

    cancelRef.current = false
    if (useModal) {
      setTitle(opts.title || 'Working…')
      setProgress(buildBulkProgressEvent(0, total, opts.initialMessage || 'Starting…'))
      setShow(true)
    }

    function onProgress(event) {
      if (useModal) {
        setProgress(event)
      }
      if (typeof opts.onProgress === 'function') {
        opts.onProgress(event)
      }
    }

    try {
      const result = await runChunkedBulkOperation({
        items: items,
        chunkSize: opts.chunkSize,
        processChunk: opts.processChunk,
        messageForIndex: opts.messageForIndex,
        shouldCancel: function() { return cancelRef.current },
        onProgress: onProgress,
      })
      if (useModal) {
        setShow(false)
      }
      return result
    } catch (err) {
      if (useModal) {
        setShow(false)
      }
      throw err
    }
  }, [])

  const runTunebook = useCallback(async function(options) {
    const opts = options || {}
    const items = Array.isArray(opts.items) ? opts.items : []
    const total = items.length
    const useModal = opts.showProgress !== false && shouldShowBulkOperationProgress(total)

    cancelRef.current = false
    if (useModal) {
      setTitle(opts.title || 'Working…')
      setProgress(buildBulkProgressEvent(0, total, opts.initialMessage || 'Starting…'))
      setShow(true)
    }

    function onProgress(event) {
      if (useModal) {
        setProgress(event)
      }
      if (typeof opts.onProgress === 'function') {
        opts.onProgress(event)
      }
    }

    try {
      const result = await runChunkedTunebookMutation(opts.tunebook, {
        items: items,
        chunkSize: opts.chunkSize,
        processChunk: opts.processChunk,
        messageForIndex: opts.messageForIndex,
        shouldCancel: function() { return cancelRef.current },
        onProgress: onProgress,
        onComplete: opts.onComplete,
      })
      if (useModal) {
        setShow(false)
      }
      return result
    } catch (err) {
      if (useModal) {
        setShow(false)
      }
      throw err
    }
  }, [])

  return {
    show: show,
    title: title,
    progress: progress,
    run: run,
    runTunebook: runTunebook,
    reset: reset,
    cancel: cancel,
  }
}
