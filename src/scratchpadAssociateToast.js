import React from 'react'
import { toast } from 'react-toastify'

export function editorPathForScratchpadAssociate(associateMode, tuneId) {
  const id = encodeURIComponent(String(tuneId || ''))
  if (!id) return '/editor'
  const mode = String(associateMode || '')
  if (mode === 'notation' || mode.indexOf('notation') === 0) {
    return '/editor/' + id + '/music'
  }
  if (mode === 'lyrics') return '/editor/' + id + '/lyrics'
  if (mode === 'chords') return '/editor/' + id + '/chords'
  if (mode === 'background') return '/editor/' + id + '/info'
  return '/editor/' + id
}

export function showScratchpadAssociateSuccessToast(options) {
  const opts = options || {}
  const message = opts.message || 'Associated with tune'
  const tuneId = opts.tuneId
  const onOpenTune = opts.onOpenTune

  toast.success(
    function(renderProps) {
      return (
        <div
          className="scratchpad-associate-success-toast"
          style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}
        >
          <span>{message}</span>
          {tuneId ? (
            <button
              type="button"
              className="btn btn-sm btn-primary"
              data-testid="scratchpad-associate-open-tune"
              onClick={function() {
                if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
                if (typeof onOpenTune === 'function') onOpenTune(tuneId)
              }}
            >
              Open tune
            </button>
          ) : null}
        </div>
      )
    },
    { autoClose: 8000, hideProgressBar: true }
  )
}
