import React from 'react'
import { toast } from 'react-toastify'
import { getBackgroundReviewSummary } from './backgroundReviewQueue'

const BACKGROUND_REVIEW_TOAST_ID = 'background-review'
const BACKGROUND_PROCESSING_TOAST_ID = 'background-review-processing'
const PROCESSING_TOAST_AUTO_CLOSE_MS = 4000
const CONTINUING_TOAST_AUTO_CLOSE_MS = 5000
const REVIEW_TOAST_SUPPRESS_MS = 30000
const CONTINUING_TOAST_ID = 'background-jobs-continuing'

let reviewToastDismissedUntil = 0
let suppressNextCloseCapture = false
let snoozedReadyKeys = null
let lastProcessingCount = 0
let shownReadyFingerprint = null

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
  const fileOcrReady = summary && Array.isArray(summary.fileOcrReady) ? summary.fileOcrReady : []
  fileOcrReady.forEach(function(id) {
    keys.push('fileocr:' + id)
  })
  return keys
}

function readyFingerprint(summary) {
  return collectReadyReviewKeys(summary).slice().sort().join('|')
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
  shownReadyFingerprint = readyFingerprint(summary) || null
  dismissBackgroundReviewToast()
}

export function __resetBackgroundReviewToastForTests() {
  reviewToastDismissedUntil = 0
  suppressNextCloseCapture = false
  snoozedReadyKeys = null
  lastProcessingCount = 0
  shownReadyFingerprint = null
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
 * Old "ready for review" persistent toast retired — field searches use short
 * finish toasts plus the Review N Search Suggestions page.
 */
export function syncBackgroundReviewToast(options) {
  dismissReviewToastProgrammatically()
  toast.dismiss(BACKGROUND_PROCESSING_TOAST_ID)
  lastProcessingCount = 0
  shownReadyFingerprint = null
  return null
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
