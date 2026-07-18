import { createTuneFileFromBlob } from './tuneFiles'

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
    return result.tune
  } catch (e) {
    return tune
  }
}
