import React from 'react'
import { toast } from 'react-toastify'
import { getBackgroundReviewSummary } from './backgroundReviewQueue'

const BACKGROUND_REVIEW_TOAST_ID = 'background-review'
const BACKGROUND_PROCESSING_TOAST_ID = 'background-review-processing'
const PROCESSING_TOAST_AUTO_CLOSE_MS = 4000
const REVIEW_TOAST_SUPPRESS_MS = 30000

let reviewToastDismissedUntil = 0
let suppressNextCloseCapture = false
let snoozedReadyKeys = null

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
  return keys
}

function hasNewReadyWork(summary) {
  const currentKeys = collectReadyReviewKeys(summary)
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
  snoozedReadyKeys = new Set(collectReadyReviewKeys(summary))
  dismissBackgroundReviewToast()
}

export function __resetBackgroundReviewToastForTests() {
  reviewToastDismissedUntil = 0
  suppressNextCloseCapture = false
  snoozedReadyKeys = null
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

export function syncBackgroundReviewToast(options) {
  const opts = options || {}
  const summary = getBackgroundReviewSummary()
  const readyCount = summary.ready > 0 ? summary.ready : 0
  const processingCount = summary.processing > 0 ? summary.processing : 0
  const readyMessage = readyCount > 0 ? readyCount + ' ready for review' : ''
  const processingMessage = processingCount > 0 ? processingCount + ' still processing' : ''

  if (!readyMessage || shouldSuppressReadyToast(summary, opts)) {
    dismissReviewToastProgrammatically()
  } else {
    suppressNextCloseCapture = false
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

  if (!processingMessage) {
    toast.dismiss(BACKGROUND_PROCESSING_TOAST_ID)
  } else if (opts.showProcessingNotice) {
    toast.info(processingMessage, {
      toastId: BACKGROUND_PROCESSING_TOAST_ID,
      autoClose: PROCESSING_TOAST_AUTO_CLOSE_MS,
      hideProgressBar: true,
    })
  }

  return readyMessage || processingMessage || null
}

export function showBackgroundProcessingNotice(options) {
  return syncBackgroundReviewToast(Object.assign({}, options || {}, {
    showProcessingNotice: true,
  }))
}
