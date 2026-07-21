import { fetchViaMediaProxy } from './mediaProxyClient'
import { attachPendingFileFromCandidate } from './attachPendingTuneFile'
import { applyNotationTuneMeta } from './notationImportUtils'

export function isNotationPdfCandidate(candidate) {
  if (!candidate || typeof candidate !== 'object') return false
  const pdf = candidate.pdfAttachment
  return !!(pdf && typeof pdf === 'object' && pdf.downloadUrl)
}

export async function downloadNotationPdfAttachment(candidate, accessToken) {
  const pdf = candidate && candidate.pdfAttachment
  const downloadUrl = pdf && pdf.downloadUrl ? String(pdf.downloadUrl).trim() : ''
  if (!downloadUrl) {
    throw new Error('No PDF attachment URL')
  }
  const path = '/fetch-score-attachment?url=' + encodeURIComponent(downloadUrl)
  const response = await fetchViaMediaProxy(path, accessToken, { method: 'GET' })
  const blob = await response.blob()
  const filename = String(pdf.filename || 'score.pdf').trim() || 'score.pdf'
  const type = String(pdf.contentType || blob.type || 'application/pdf').trim() || 'application/pdf'
  return {
    name: filename,
    type: type,
    blob: blob,
    source: 'archive',
  }
}

export async function applyNotationPdfCandidateToTune(tune, candidate, options) {
  if (!tune || !isNotationPdfCandidate(candidate)) return false
  const opts = options || {}
  const pendingFile = await downloadNotationPdfAttachment(candidate, opts.accessToken)
  const tuneMeta = candidate.tuneMeta && typeof candidate.tuneMeta === 'object'
    ? candidate.tuneMeta
    : null
  if (tuneMeta) {
    applyNotationTuneMeta(tune, tuneMeta)
  }
  if (candidate.sourceUrl && !tune.srcUrl) {
    tune.srcUrl = String(candidate.sourceUrl)
  }
  if (!tune.meta || typeof tune.meta !== 'object') tune.meta = {}
  tune.meta.archivePdfSnapshot = {
    source: candidate.source || '',
    filename: pendingFile.name,
    titleSource: 'archive',
  }
  const attached = await attachPendingFileFromCandidate(tune, pendingFile, {
    token: opts.token,
    driveApi: opts.driveApi,
    uploadToDrive: opts.uploadToDrive === true,
  })
  Object.assign(tune, attached)
  return true
}
