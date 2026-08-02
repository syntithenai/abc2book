import React from 'react'
import { toast } from 'react-toastify'
import { downloadBlob } from './tuneDownloadActions'

function saveViaAnchor(url, filename) {
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
}

function renderReadyDownloadToast(ready, renderProps, options) {
  const opts = options || {}
  const text = opts.message || ((ready.filename || 'download') + ' is ready.')
  return (
    <div
      className="ready-download-toast"
      style={{ display: 'flex', alignItems: 'center', gap: '0.75em', flexWrap: 'wrap' }}
    >
      <span>{text}</span>
      <button
        type="button"
        className="btn btn-sm btn-primary"
        onClick={function() {
          saveReadyDownload(ready)
          if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
        }}
      >
        Download
      </button>
      <button
        type="button"
        className="btn btn-sm btn-outline-secondary"
        onClick={function() {
          revokeReadyDownload(ready)
          if (typeof renderProps.closeToast === 'function') renderProps.closeToast()
        }}
      >
        Discard
      </button>
    </div>
  )
}

export function showReadyDownloadToast(ready, options) {
  const opts = options || {}
  if (!ready || !ready.url) {
    throw new Error('No file to download')
  }
  const toastId = toast.success(function(renderProps) {
    return renderReadyDownloadToast(ready, renderProps, opts)
  }, {
    autoClose: false,
    closeOnClick: false,
    hideProgressBar: true,
    toastId: opts.toastId,
  })

  return {
    delivered: false,
    method: 'toast',
    filename: ready.filename,
    url: ready.url,
    dismiss: function() {
      toast.dismiss(toastId)
      revokeReadyDownload(ready)
    },
  }
}

/**
 * Try an immediate browser download; on failure show a ready toast with
 * Download / Discard buttons (fresh user gesture after slow async export).
 */
export async function offerBlobDownload(blob, filename, options) {
  const opts = options || {}
  const safeName = filename || 'download'
  if (!blob || typeof blob.size !== 'number' || blob.size <= 0) {
    throw new Error('No file to download')
  }

  const ready = createReadyDownload(blob, safeName)

  if (opts.prompt === 'never') {
    try {
      await downloadBlob(safeName, blob)
      revokeReadyDownload(ready)
      return { delivered: true, method: 'immediate', filename: safeName }
    } catch (e) {
      revokeReadyDownload(ready)
      throw e
    }
  }

  if (opts.tryImmediate !== false) {
    try {
      await downloadBlob(safeName, blob)
      revokeReadyDownload(ready)
      return { delivered: true, method: 'immediate', filename: safeName }
    } catch (e) {
      // Fall through to click-to-save prompt.
    }
  }

  return showReadyDownloadToast(ready, opts)
}

export function saveReadyDownload(ready) {
  if (!ready || !ready.url || !ready.filename) return
  saveViaAnchor(ready.url, ready.filename)
}

export function revokeReadyDownload(ready) {
  if (ready && ready.url) {
    URL.revokeObjectURL(ready.url)
  }
}

export function createReadyDownload(blob, filename) {
  if (!blob || typeof blob.size !== 'number' || blob.size <= 0) {
    throw new Error('No file to download')
  }
  return {
    blob: blob,
    filename: filename || 'download',
    url: URL.createObjectURL(blob),
  }
}
