import { showReadyDownloadToast } from './offerBlobDownload'
import { toast } from 'react-toastify'

export function showAudioExportStartToast(options) {
  const opts = options || {}
  const tuneName = opts.tuneName || 'Tune'
  const count = opts.tuneCount > 0 ? opts.tuneCount : 1
  const plural = count === 1 ? '' : 's'
  const label = opts.processed ? 'processed audio' : 'audio'
  const message = count === 1
    ? ('Preparing ' + label + ' download for ' + tuneName + '...')
    : ('Preparing ' + label + ' download for ' + count + ' tune' + plural + '...')
  toast.info(message, { autoClose: 4000, hideProgressBar: true })
}

export function showAudioExportReadyToast(ready, options) {
  const opts = options || {}
  const tuneName = opts.tuneName || ''
  const prefix = tuneName ? (tuneName + ': ') : ''
  const message = prefix + (ready && ready.filename ? ready.filename : 'Audio') + ' is ready.'
  try {
    return showReadyDownloadToast(ready, { message: message })
  } catch (e) {
    console.warn('ready download toast failed', e)
    toast.success(message, { autoClose: false, hideProgressBar: true })
    return { delivered: false, method: 'fallback', filename: ready && ready.filename }
  }
}

export function showAudioExportErrorToast(message) {
  toast.error(message || 'Audio download failed', { autoClose: 6000 })
}
