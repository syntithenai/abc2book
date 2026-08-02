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

/**
 * Try an immediate browser download, then show a click-to-save toast that
 * carries a fresh user gesture (required after slow async export work).
 */
export async function offerBlobDownload(blob, filename, options) {
  const opts = options || {}
  const safeName = filename || 'download'
  if (!blob || typeof blob.size !== 'number' || blob.size <= 0) {
    throw new Error('No file to download')
  }

  if (opts.tryImmediate !== false) {
    try {
      await downloadBlob(safeName, blob)
      if (!opts.alwaysPrompt) {
        return { delivered: true, method: 'immediate', filename: safeName }
      }
    } catch (e) {
      // Fall through to click-to-save prompt.
    }
  }

  const url = URL.createObjectURL(blob)
  const message = opts.message || ('Audio ready — click here to save ' + safeName)
  const toastId = toast.info(message, {
    autoClose: false,
    closeOnClick: false,
    onClick: function() {
      saveViaAnchor(url, safeName)
      toast.dismiss(toastId)
      setTimeout(function() {
        URL.revokeObjectURL(url)
      }, 1000)
    },
  })

  return {
    delivered: false,
    method: 'toast',
    filename: safeName,
    url: url,
    dismiss: function() {
      toast.dismiss(toastId)
      URL.revokeObjectURL(url)
    },
  }
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
