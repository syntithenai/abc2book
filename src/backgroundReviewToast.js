import React from 'react'
import { toast } from 'react-toastify'
import { getBackgroundReviewSummary } from './backgroundReviewQueue'

const BACKGROUND_REVIEW_TOAST_ID = 'background-review'
const BACKGROUND_PROCESSING_TOAST_ID = 'background-review-processing'
const PROCESSING_TOAST_AUTO_CLOSE_MS = 4000

export function dismissBackgroundReviewToast() {
  toast.dismiss(BACKGROUND_REVIEW_TOAST_ID)
  toast.dismiss(BACKGROUND_PROCESSING_TOAST_ID)
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

  if (!readyMessage) {
    toast.dismiss(BACKGROUND_REVIEW_TOAST_ID)
  } else {
    toast.info(
      function(renderProps) {
        return renderReviewToast(readyMessage, opts, renderProps)
      },
      {
        toastId: BACKGROUND_REVIEW_TOAST_ID,
        autoClose: false,
        closeOnClick: false,
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
