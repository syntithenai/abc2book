import React from 'react'
import { toast } from 'react-toastify'
import { getBackgroundReviewSummary } from './backgroundReviewQueue'
import { isImportReviewUiVisible } from './importReviewSessionStore'

const BACKGROUND_REVIEW_TOAST_ID = 'background-review'
const BACKGROUND_PROCESSING_TOAST_ID = 'background-review-processing'
const BULK_IMPORT_STARTED_TOAST_ID = 'bulk-import-started'
const IMPORT_REVIEW_READY_TOAST_ID = 'import-review-ready'
const PROCESSING_TOAST_AUTO_CLOSE_MS = 4000
const CONTINUING_TOAST_AUTO_CLOSE_MS = 5000
const REVIEW_TOAST_SUPPRESS_MS = 30000
const CONTINUING_TOAST_ID = 'background-jobs-continuing'

let reviewToastDismissedUntil = 0
let suppressNextCloseCapture = false
let snoozedReadyKeys = null
let lastProcessingCount = 0
let shownReadyFingerprint = null
let shownImportReadyFingerprint = null
let lastImportProcessing = 0

function markReviewToastDismissedNow() {
  reviewToastDismissedUntil = Date.now() + REVIEW_TOAST_SUPPRESS_MS
}

function isReviewToastSuppressed() {
  return Date.now() < reviewToastDismissedUntil
}

function dismissReviewToastProgrammatically() {
  suppressNextCloseCapture = true
  toast.dismiss(BACKGROUND_REVIEW_TOAST_ID)
}

export function dismissBackgroundReviewToast() {
  dismissReviewToastProgrammatically()
  toast.dismiss(BACKGROUND_PROCESSING_TOAST_ID)
  toast.dismiss(IMPORT_REVIEW_READY_TOAST_ID)
}

export function showBulkImportStartedToast(options) {
  const opts = options || {}
  const savedCount = Number(opts.savedCount) || 0
  let message = 'Import running in the background…'
  if (savedCount > 0) {
    message = savedCount === 1 ? 'Saved 1 song' : ('Saved ' + savedCount + ' songs')
    if (opts.enhance) {
      message += ' — looking up chords, lyrics, and notation…'
    } else {
      message += '.'
    }
  }
  toast.info(message, {
    toastId: BULK_IMPORT_STARTED_TOAST_ID,
    autoClose: 5000,
    hideProgressBar: true,
  })
}

export function collectReadyReviewKeys(summary) {
  const keys = []
  const importReadyIds = summary && Array.isArray(summary.importReadyIds) ? summary.importReadyIds : []
  importReadyIds.forEach(function(id) {
    keys.push('import:' + id)
  })
  const mediaReady = summary && Array.isArray(summary.mediaReady) ? summary.mediaReady : []
  mediaReady.forEach(function(id) {
    keys.push('media:' + id)
  })
  const fieldLookupAwaiting = summary && Array.isArray(summary.fieldLookupAwaiting)
    ? summary.fieldLookupAwaiting
    : []
  fieldLookupAwaiting.forEach(function(id) {
    keys.push('field:' + id)
  })
  const fileOcrReady = summary && Array.isArray(summary.fileOcrReady) ? summary.fileOcrReady : []
  fileOcrReady.forEach(function(id) {
    keys.push('fileocr:' + id)
  })
  return keys
}

/**
 * Ready toast is only for attach-analysis work (file OCR / media), not field lookups.
 */
export function collectAttachAnalysisReadyKeys(summary) {
  return collectReadyReviewKeys(summary).filter(function(key) {
    return key.indexOf('fileocr:') === 0 || key.indexOf('media:') === 0
  })
}

function readyFingerprint(summary) {
  return collectAttachAnalysisReadyKeys(summary).slice().sort().join('|')
}

function hasNewReadyWork(summary) {
  const currentKeys = collectAttachAnalysisReadyKeys(summary)
  if (!snoozedReadyKeys) return currentKeys.length > 0
  return currentKeys.some(function(key) {
    return !snoozedReadyKeys.has(key)
  })
}

function shouldSuppressReadyToast(summary, opts) {
  if (opts && opts.suppressReadyToast) return true
  if (isReviewToastSuppressed()) return true
  if (!snoozedReadyKeys) return false
  if (summary.processing > 0) return true
  if (!hasNewReadyWork(summary)) return true
  snoozedReadyKeys = null
  return false
}

export function snoozeBackgroundReviewToast() {
  const summary = getBackgroundReviewSummary()
  snoozedReadyKeys = new Set(collectAttachAnalysisReadyKeys(summary))
  shownReadyFingerprint = readyFingerprint(summary) || null
  dismissBackgroundReviewToast()
}

export function __resetBackgroundReviewToastForTests() {
  reviewToastDismissedUntil = 0
  suppressNextCloseCapture = false
  snoozedReadyKeys = null
  lastProcessingCount = 0
  shownReadyFingerprint = null
  shownImportReadyFingerprint = null
  lastImportProcessing = 0
}

function renderReviewToast(message, opts, renderProps) {
  return (
    <div className="background-review-toast" style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}>
      <span>{message}</span>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={function() {
          if (typeof opts.onReview === 'function') opts.onReview()
          if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
        }}
      >
        Review
      </button>
    </div>
  )
}

/**
 * Show ready toast for file OCR (and media keys if present). Field-lookup ready
 * items stay on the Review suggestions page without a persistent toast.
 */
export function syncBackgroundReviewToast(options) {
  const opts = options || {}
  const summary = getBackgroundReviewSummary() || {}
  const attachReadyKeys = collectAttachAnalysisReadyKeys(summary)
  const readyCount = attachReadyKeys.length
  const processingCount = (summary.fileOcrProcessing && summary.fileOcrProcessing.length)
    ? summary.fileOcrProcessing.length
    : 0
  const mediaProcessing = summary.mediaProcessing && summary.mediaProcessing.length
    ? summary.mediaProcessing.length
    : 0
  const totalProcessing = processingCount + mediaProcessing
  const readyMessage = readyCount > 0
    ? (readyCount === 1 ? '1 file OCR result ready' : (readyCount + ' file OCR results ready'))
    : ''
  const processingMessage = totalProcessing > 0 ? totalProcessing + ' still processing' : ''
  const fingerprint = readyFingerprint(summary)
  const processingDroppedToZero = lastProcessingCount > 0 && totalProcessing === 0
  const fingerprintChanged = fingerprint !== shownReadyFingerprint
  const suppressed = !readyMessage || shouldSuppressReadyToast(summary, opts)
  const shouldShowReady = !suppressed
    && totalProcessing === 0
    && (processingDroppedToZero || fingerprintChanged)

  if (suppressed || totalProcessing > 0 || !shouldShowReady) {
    if (suppressed || readyCount === 0) {
      dismissReviewToastProgrammatically()
      if (readyCount === 0) shownReadyFingerprint = null
    }
  } else {
    suppressNextCloseCapture = false
    shownReadyFingerprint = fingerprint
    toast.warn(
      function(renderProps) {
        return renderReviewToast(readyMessage, opts, renderProps)
      },
      {
        toastId: BACKGROUND_REVIEW_TOAST_ID,
        autoClose: false,
        closeOnClick: false,
        onClose: function() {
          if (suppressNextCloseCapture) {
            suppressNextCloseCapture = false
            return
          }
          markReviewToastDismissedNow()
        },
      }
    )
  }

  lastProcessingCount = totalProcessing

  if (!processingMessage) {
    toast.dismiss(BACKGROUND_PROCESSING_TOAST_ID)
  } else if (opts.showProcessingNotice) {
    toast.info(processingMessage, {
      toastId: BACKGROUND_PROCESSING_TOAST_ID,
      autoClose: PROCESSING_TOAST_AUTO_CLOSE_MS,
      hideProgressBar: true,
    })
  }

  const importReady = summary.importReady || 0
  const importProcessing = summary.importProcessing || 0
  const importReviewVisible = isImportReviewUiVisible()
  const importReadyIds = Array.isArray(summary.importReadyIds) ? summary.importReadyIds : []
  const importFingerprint = importReadyIds.slice().sort().join('|')
  const importProcessingDropped = lastImportProcessing > 0 && importProcessing === 0
  const importFingerprintChanged = importFingerprint !== shownImportReadyFingerprint
  const importReadyMessage = importReady > 0
    ? (importReady === 1 ? '1 song ready for import review' : (importReady + ' songs ready for import review'))
    : ''

  if (importProcessing > 0 || importReviewVisible || !importReadyMessage || shouldSuppressReadyToast(summary, opts)) {
    if (importProcessing > 0 || importReady === 0) {
      toast.dismiss(IMPORT_REVIEW_READY_TOAST_ID)
      if (importReady === 0) shownImportReadyFingerprint = null
    }
  } else if (importProcessingDropped || importFingerprintChanged) {
    shownImportReadyFingerprint = importFingerprint
    suppressNextCloseCapture = false
    toast.warn(
      function(renderProps) {
        return renderReviewToast(importReadyMessage, {
          onReview: function() {
            if (typeof opts.onImportReview === 'function') opts.onImportReview()
            else if (typeof opts.onReview === 'function') opts.onReview()
          },
        }, renderProps)
      },
      {
        toastId: IMPORT_REVIEW_READY_TOAST_ID,
        autoClose: false,
        closeOnClick: false,
        onClose: function() {
          if (suppressNextCloseCapture) {
            suppressNextCloseCapture = false
            return
          }
          markReviewToastDismissedNow()
        },
      }
    )
  }

  lastImportProcessing = importProcessing

  return readyMessage || processingMessage || importReadyMessage || null
}

export function showBackgroundProcessingNotice(options) {
  return syncBackgroundReviewToast(Object.assign({}, options || {}, {
    showProcessingNotice: true,
  }))
}

/**
 * One-shot notice when leaving edit/add with jobs still running.
 * Does not open Review.
 */
export function showBackgroundJobsContinuingNotice(options) {
  const opts = options || {}
  const summary = opts.summary || getBackgroundReviewSummary()
  const count = typeof opts.count === 'number'
    ? opts.count
    : (summary && summary.processing > 0 ? summary.processing : 0)
  if (!(count > 0)) return null
  const message = count === 1
    ? '1 job continuing in background'
    : (count + ' jobs continuing in background')
  toast.info(message, {
    toastId: CONTINUING_TOAST_ID,
    autoClose: CONTINUING_TOAST_AUTO_CLOSE_MS,
    hideProgressBar: true,
  })
  return message
}
