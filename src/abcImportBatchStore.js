/**
 * Pending multi-tune ABC batch summary (Add-from-file / bulk / editor redirect).
 * Hosted by ImportReviewBridge so Apply certain / Review remaining share one UI.
 */

let pendingBatch = null
let revision = 0
const listeners = new Set()

function notify() {
  revision += 1
  listeners.forEach(function(listener) {
    try { listener(); } catch (e) { /* ignore */ }
  })
}

export function getPendingAbcImportBatch() {
  return pendingBatch
}

export function getPendingAbcImportBatchRevision() {
  return revision
}

export function setPendingAbcImportBatch(batchSummary) {
  pendingBatch = batchSummary || null
  notify()
}

export function clearPendingAbcImportBatch() {
  if (pendingBatch == null) return
  pendingBatch = null
  notify()
}

export function subscribePendingAbcImportBatch(listener) {
  if (typeof listener !== 'function') return function() {}
  listeners.add(listener)
  return function() {
    listeners.delete(listener)
  }
}
