import { createTuneFileFromBlob, isPdfTuneFileType } from './tuneFiles'
import { indexPdfTuneFile } from './pdfSnapshotIndex'

/**
 * Attach candidate.pendingFile onto a saved tune (Add/Import image|PDF path).
 */
export async function attachPendingFileFromCandidate(tune, pendingFile, options) {
  if (!tune || !tune.id || !pendingFile || !pendingFile.blob) {
    return tune
  }
  const opts = options || {}
  try {
    const result = await createTuneFileFromBlob({
      tune: tune,
      blob: pendingFile.blob,
      name: pendingFile.name || 'Import file',
      type: pendingFile.type || pendingFile.blob.type || 'image/png',
      source: pendingFile.source || 'import',
      token: opts.token,
      driveApi: opts.driveApi,
      uploadToDrive: opts.uploadToDrive === true,
      setActive: true,
    })
    let nextTune = result.tune
    if (isPdfTuneFileType(result.meta && result.meta.type)) {
      try {
        nextTune = await indexPdfTuneFile(nextTune, result.meta.id, pendingFile.blob, {
          fileName: pendingFile.name || 'sheet.pdf',
          type: pendingFile.type || pendingFile.blob.type,
          resolverAvailable: opts.resolverAvailable === true,
          accessToken: opts.accessToken,
        })
      } catch (e) {
        // indexing is best-effort
      }
    }
    return nextTune
  } catch (e) {
    return tune
  }
}
