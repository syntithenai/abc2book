import React from 'react'
import { toast } from 'react-toastify'

export function scratchpadItemPath(itemId) {
  if (!itemId) return '/scratchpad'
  return '/scratchpad/' + encodeURIComponent(String(itemId))
}

export function showScratchpadExportToast(options) {
  const opts = options || {}
  const message = opts.message || 'Scratchpad notation ready'
  const itemId = opts.itemId
  const onOpen = opts.onOpen

  toast.success(
    function(renderProps) {
      return (
        <div
          className="scratchpad-export-success-toast"
          style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}
        >
          <span>{message}</span>
          {itemId ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              data-testid="scratchpad-export-open-item"
              onClick={function() {
                if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
                if (typeof onOpen === 'function') onOpen(itemId)
              }}
            >
              Open record
            </button>
          ) : null}
        </div>
      )
    },
    { autoClose: 8000, hideProgressBar: true }
  )
}
