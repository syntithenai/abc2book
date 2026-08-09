import { yieldToMain } from './tuneListFilter'

/** Show chunked progress UI when operating on this many items or more. */
export const BULK_OPERATION_PROGRESS_THRESHOLD = 25

export const DEFAULT_BULK_CHUNK_SIZE = 25

export function shouldShowBulkOperationProgress(count) {
  return typeof count === 'number' && count >= BULK_OPERATION_PROGRESS_THRESHOLD
}

export function buildBulkProgressEvent(current, total, message) {
  const safeTotal = typeof total === 'number' && total > 0 ? total : 0
  const safeCurrent = typeof current === 'number' ? Math.max(0, current) : 0
  const percent = safeTotal > 0 ? Math.round((safeCurrent / safeTotal) * 100) : 0
  return {
    current: safeCurrent,
    total: safeTotal,
    percent: percent,
    message: message || '',
  }
}

/**
 * Process items in chunks, yielding to the main thread between chunks.
 * processChunk receives (chunk, chunkIndex) and may return a Promise.
 */
export async function runChunkedBulkOperation(options) {
  const opts = options || {}
  const items = Array.isArray(opts.items) ? opts.items : []
  const total = items.length
  const chunkSize = opts.chunkSize > 0 ? opts.chunkSize : DEFAULT_BULK_CHUNK_SIZE
  const onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function() {}
  const processChunk = opts.processChunk
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : function() { return false }
  const messageForIndex = typeof opts.messageForIndex === 'function'
    ? opts.messageForIndex
    : function(index, count) { return index + ' of ' + count }

  if (!processChunk || total === 0) {
    onProgress(buildBulkProgressEvent(0, total, ''))
    return { processed: 0, cancelled: false }
  }

  let processed = 0
  for (let start = 0; start < total; start += chunkSize) {
    if (shouldCancel()) {
      return { processed: processed, cancelled: true }
    }
    const chunk = items.slice(start, Math.min(start + chunkSize, total))
    await Promise.resolve(processChunk(chunk, Math.floor(start / chunkSize)))
    processed = Math.min(start + chunk.length, total)
    onProgress(buildBulkProgressEvent(
      processed,
      total,
      messageForIndex(processed, total)
    ))
    if (processed < total) {
      await yieldToMain()
    }
    if (shouldCancel()) {
      return { processed: processed, cancelled: true }
    }
  }

  return { processed: processed, cancelled: false }
}

/**
 * Run chunked tunebook mutations with a single commit at the end.
 * processChunk receives (chunkIds) and should call tunebook helpers with { deferSave: true }.
 */
export async function runChunkedTunebookMutation(tunebook, options) {
  const opts = options || {}
  const items = Array.isArray(opts.items) ? opts.items : []
  const tunebookApi = tunebook || {}
  if (typeof tunebookApi.beginTunesBatchCommit === 'function') {
    tunebookApi.beginTunesBatchCommit()
  }
  try {
    const result = await runChunkedBulkOperation({
      items: items,
      chunkSize: opts.chunkSize,
      processChunk: opts.processChunk,
      messageForIndex: opts.messageForIndex,
      shouldCancel: opts.shouldCancel,
      onProgress: opts.onProgress,
    })
    if (typeof tunebookApi.commitTunesBatch === 'function') {
      tunebookApi.commitTunesBatch()
    }
    if (!result.cancelled && typeof opts.onComplete === 'function') {
      opts.onComplete(result)
    }
    return result
  } catch (err) {
    if (typeof tunebookApi.commitTunesBatch === 'function') {
      tunebookApi.commitTunesBatch()
    }
    throw err
  }
}
