import React from 'react'
import { toast } from 'react-toastify'

export const BOOK_IMPORT_JOBS_TAB = 'import-scans'

export function backgroundJobsBookImportPath() {
  return '/#/settings/background-jobs?jobsTab=' + BOOK_IMPORT_JOBS_TAB
}

/** Open Import scans wizard to a review set (listened by AddFromDropdown). */
export function requestOpenBookImportReview(setId) {
  if (typeof window === 'undefined' || !setId) return
  window.dispatchEvent(new CustomEvent('abc2book-open-book-import', {
    detail: { setId: String(setId) },
  }))
}

function renderToastWithButton(message, buttonLabel, onClick, renderProps) {
  return (
    <div
      className="book-import-job-toast"
      style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}
    >
      <span>{message}</span>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={function() {
          if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
          onClick()
        }}
      >
        {buttonLabel}
      </button>
    </div>
  )
}

export function showBookImportJobStartedToast(options) {
  const opts = options || {}
  const setName = opts.setName || 'Review set'
  const fileCount = Number(opts.fileCount) || 0
  const message = fileCount > 0
    ? (setName + ': processing ' + fileCount + ' file' + (fileCount === 1 ? '' : 's'))
    : (setName + ': processing started')
  toast.info(function(renderProps) {
    return renderToastWithButton(message, 'View jobs', function() {
      window.location.assign(backgroundJobsBookImportPath())
    }, renderProps)
  }, { autoClose: 8000, hideProgressBar: true, toastId: 'book-import-started' })
}

export function showBookImportJobContinuingToast(options) {
  const opts = options || {}
  const setName = opts.setName || 'Review set'
  toast.info(function(renderProps) {
    return renderToastWithButton(
      setName + ': continuing in background',
      'View jobs',
      function() {
        window.location.assign(backgroundJobsBookImportPath())
      },
      renderProps
    )
  }, { autoClose: 8000, hideProgressBar: true, toastId: 'book-import-continuing' })
}

export function showBookImportJobCompleteToast(options) {
  const opts = options || {}
  const setName = opts.setName || 'Review set'
  const setId = opts.setId
  toast.success(function(renderProps) {
    return renderToastWithButton(
      setName + ': ready for review',
      'Open review',
      function() {
        if (setId) requestOpenBookImportReview(setId)
        else window.location.assign(backgroundJobsBookImportPath())
      },
      renderProps
    )
  }, { autoClose: 12000, hideProgressBar: true })
}

export function showBookImportJobErrorToast(options) {
  const opts = options || {}
  const setName = opts.setName || 'Review set'
  const message = opts.message || 'Import failed'
  toast.error(setName + ': ' + message, {
    autoClose: 12000,
  })
}
