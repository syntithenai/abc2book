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

async function blobToUint8Array(blob) {
  if (!blob || typeof blob.size !== 'number' || blob.size <= 0) {
    return null
  }
  try {
    if (typeof blob.arrayBuffer === 'function') {
      const buffer = await blob.arrayBuffer()
      if (buffer && buffer.byteLength > 0) {
        return new Uint8Array(buffer)
      }
    }
  } catch (e) {
    // Fall back to FileReader below.
  }
  return new Promise(function(resolve, reject) {
    const reader = new FileReader()
    reader.onloadend = function() {
      if (!reader.result || !reader.result.byteLength) {
        reject(new Error('Could not read blob data'))
        return
      }
      resolve(new Uint8Array(reader.result))
    }
    reader.onerror = reject
    reader.readAsArrayBuffer(blob)
  })
}

async function writeBytesToFileHandle(handle, bytes) {
  let writable = null
  try {
    writable = await handle.createWritable()
    await writable.write(bytes)
    await writable.close()
    writable = null
    const saved = await handle.getFile()
    if (!saved || !saved.size) {
      throw new Error('Saved file is empty')
    }
    return saved
  } catch (err) {
    if (writable) {
      try {
        await writable.abort()
      } catch (abortErr) {
        // ignore abort errors
      }
    }
    throw err
  }
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

function savePickerTypesForFilename(filename) {
  const lower = String(filename || '').toLowerCase()
  if (lower.endsWith('.m4a') || lower.endsWith('.aac')) {
    return [{ description: 'AAC audio', accept: { 'audio/mp4': ['.m4a', '.aac'] } }]
  }
  if (lower.endsWith('.mp3')) {
    return [{ description: 'MP3 audio', accept: { 'audio/mpeg': ['.mp3'] } }]
  }
  if (lower.endsWith('.wav')) {
    return [{ description: 'WAV audio', accept: { 'audio/wav': ['.wav'] } }]
  }
  if (lower.endsWith('.zip')) {
    return [{ description: 'ZIP archive', accept: { 'application/zip': ['.zip'] } }]
  }
  if (lower.endsWith('.pdf')) {
    return [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }]
  }
  const mime = guessMimeType(filename)
  return [{ description: 'File', accept: mime ? { [mime]: [] } : { 'application/octet-stream': [] } }]
}

export function canUseSaveFilePicker() {
  return typeof window !== 'undefined'
    && typeof window.showSaveFilePicker === 'function'
    && !isCapacitorNative()
}

/**
 * Call at the start of a click handler, before slow async export work.
 * Reserves a save target while the browser user-gesture is still active.
 */
export async function beginBlobSave(filename) {
  const safeName = sanitizeDownloadFilename(filename, 'download')
  if (isCapacitorNative()) {
    return { mode: 'native', filename: safeName }
  }
  if (canUseSaveFilePicker()) {
    try {
      const handle = await window.showSaveFilePicker({
        suggestedName: safeName,
        types: savePickerTypesForFilename(safeName),
      })
      return { mode: 'fileHandle', handle: handle, filename: safeName }
    } catch (err) {
      if (err && err.name === 'AbortError') {
        return { mode: 'cancelled', filename: safeName }
      }
    }
  }
  return { mode: 'manual', filename: safeName }
}

/**
 * Write a prepared blob to the save target from beginBlobSave.
 * Manual mode returns needsManualSave so the UI can offer a fresh click-to-save button.
 */
export async function completeBlobSave(session, blob) {
  if (!session || session.mode === 'cancelled') {
    return { saved: false, cancelled: true }
  }
  if (!blob) {
    throw new Error('No file to download')
  }

  if (session.mode === 'native') {
    await saveBlobToDevice(blob, session.filename)
    return { saved: true, filename: session.filename }
  }

  if (session.mode === 'fileHandle' && session.handle) {
    const bytes = await blobToUint8Array(blob)
    if (!bytes || !bytes.byteLength) {
      throw new Error('Export produced an empty file')
    }
    await writeBytesToFileHandle(session.handle, bytes)
    return { saved: true, filename: session.filename }
  }

  return {
    saved: false,
    needsManualSave: true,
    blob: blob,
    filename: session.filename,
  }
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
  setTimeout(function() {
    window.URL.revokeObjectURL(url)
  }, 1000)
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
