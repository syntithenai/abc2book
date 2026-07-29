/**
 * Save blobs on Capacitor Android (anchor downloads do not work in WebView).
 */
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { isCapacitorNative } from './platformUtils'
import { sanitizeDownloadFilename } from './tuneDownloadActions'

function blobToBase64(blob) {
  return new Promise(function(resolve, reject) {
    const reader = new FileReader()
    reader.onloadend = function() {
      const dataUrl = String(reader.result || '')
      resolve(dataUrl.split(',')[1] || '')
    }
    reader.onerror = reject
    reader.readAsDataURL(blob)
  })
}

function guessMimeType(filename) {
  const lower = String(filename || '').toLowerCase()
  if (lower.endsWith('.pdf')) return 'application/pdf'
  if (lower.endsWith('.mp3')) return 'audio/mpeg'
  if (lower.endsWith('.wav')) return 'audio/wav'
  if (lower.endsWith('.json')) return 'application/json'
  if (lower.endsWith('.csv')) return 'text/csv'
  if (lower.endsWith('.abc')) return 'text/vnd.abc'
  if (lower.endsWith('.xml') || lower.endsWith('.musicxml')) {
    return 'application/vnd.recordare.musicxml+xml'
  }
  return 'application/octet-stream'
}

async function saveBlobNative(blob, filename) {
  const safeName = sanitizeDownloadFilename(filename, 'download')
  const base64 = await blobToBase64(blob)
  const path = 'downloads/' + safeName
  await Filesystem.writeFile({
    path: path,
    data: base64,
    directory: Directory.Documents,
    recursive: true,
  })
  const uriResult = await Filesystem.getUri({
    path: path,
    directory: Directory.Documents,
  })
  return uriResult.uri
}

/**
 * Save a blob on native platforms (share sheet) or trigger a browser download.
 */
export async function saveBlobToDevice(blob, filename, options) {
  if (!blob) return false
  const opts = options || {}
  const safeName = sanitizeDownloadFilename(filename, 'download')

  if (isCapacitorNative()) {
    const uri = await saveBlobNative(blob, safeName)
    if (opts.share === false) return uri
    await Share.share({
      title: safeName,
      text: opts.shareText || safeName,
      url: uri,
      dialogTitle: opts.dialogTitle || 'Save file',
    })
    return uri
  }

  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.setAttribute('download', safeName)
  anchor.style.display = 'none'
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  window.URL.revokeObjectURL(url)
  return true
}

export async function shareBlobForPrint(blob, filename) {
  const safeName = sanitizeDownloadFilename(filename, 'print.pdf')
  if (!isCapacitorNative()) return false
  const uri = await saveBlobNative(blob, safeName.endsWith('.pdf') ? safeName : safeName + '.pdf')
  await Share.share({
    title: 'Print PDF',
    text: 'Open with a PDF viewer or printer app',
    url: uri,
    dialogTitle: 'Print or save PDF',
  })
  return true
}
