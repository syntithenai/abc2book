/**
 * Attach image/PDF and audio/video onto the live Add draft without review,
 * transcription, enrichment, or Google Drive upload.
 */

import { isSheetImageImportFile } from './importSourceParse'
import { isAudioImportFile, isVideoImportFile } from './audioFileMetadata'
import { isMidiImportFile } from './midiFileUtils'
import { createTuneFileFromBlob, removeTuneFileMeta, deleteStoredTuneFile, isPdfTuneFileType } from './tuneFiles'
import { indexPdfTuneFile } from './pdfSnapshotIndex'
import {
  createAttachedAudioLink,
  createAttachedVideoLink,
  createAttachedMidiLink,
  isOwnedMediaLink,
} from './linkRecording'
import { freshTuneId } from './importReviewCandidateUtils'
import { resolveMediaFileIdentity } from './mediaImportCandidates'

export function ensureAddDraftTuneId(tune) {
  const next = Object.assign({}, tune || {})
  if (!String(next.id || '').trim()) {
    next.id = freshTuneId()
  }
  return next
}

export function addDraftHasLocalAttachments(tune) {
  if (!tune) return false
  if (Array.isArray(tune.tuneFiles) && tune.tuneFiles.length > 0) return true
  if (Array.isArray(tune.links) && tune.links.some(isOwnedMediaLink)) return true
  return false
}

/**
 * @returns {'sheetImage'|'audio'|'video'|'midi'|null}
 */
export function classifyAddFormFile(file) {
  if (!file) return null
  if (isSheetImageImportFile(file)) return 'sheetImage'
  if (isMidiImportFile(file)) return 'midi'
  if (isVideoImportFile(file)) return 'video'
  if (isAudioImportFile(file)) return 'audio'
  return null
}

/**
 * Attach image/PDF as tuneFiles on the draft (local only).
 */
export async function attachSheetImageToAddDraft(tune, file, options) {
  const opts = options || {}
  const withId = ensureAddDraftTuneId(tune)
  const result = await createTuneFileFromBlob({
    tune: withId,
    blob: file,
    name: (file && file.name) || 'Sheet image',
    type: (file && file.type) || 'image/png',
    source: 'import',
    uploadToDrive: false,
    setActive: true,
  })
  let nextTune = result.tune
  if (file && isPdfTuneFileType(file.type || result.meta && result.meta.type)) {
    try {
      nextTune = await indexPdfTuneFile(nextTune, result.meta.id, file, {
        fileName: file.name || 'sheet.pdf',
        type: file.type || 'application/pdf',
        resolverAvailable: opts.resolverAvailable === true,
        accessToken: opts.accessToken,
      })
    } catch (e) {
      // indexing is best-effort
    }
  }
  return nextTune
}

/**
 * Attach audio/video as owned-media links (local only).
 */
export async function attachMediaFilesToAddDraft(tune, files, mediaAction) {
  let next = ensureAddDraftTuneId(tune)
  const list = Array.isArray(files) ? files : []
  const links = Array.isArray(next.links) ? next.links.slice() : []
  const isVideo = mediaAction === 'video'

  for (let i = 0; i < list.length; i += 1) {
    const file = list[i]
    if (!file) continue
    const identity = await resolveMediaFileIdentity(file, { tune: next })
    if (identity.title && !String(next.name || '').trim()) {
      next.name = identity.title
    }
    if (identity.artist && !String(next.composer || '').trim()) {
      next.composer = identity.artist
    }

    const linkTitle = identity.title || file.name || (isVideo ? 'Attached video' : 'Attached audio')
    const attached = identity.isVideo
      ? await createAttachedVideoLink({
        tune: next,
        file: file,
        title: linkTitle,
        uploadToDrive: false,
      })
      : await createAttachedAudioLink({
        tune: next,
        file: file,
        title: linkTitle,
        uploadToDrive: false,
      })
    if (attached && attached.link) {
      links.push(attached.link)
    }
  }

  next.links = links
  next.mediaCacheLocked = true
  return next
}

export async function attachMidiFilesToAddDraft(tune, files) {
  let next = ensureAddDraftTuneId(tune)
  const list = Array.isArray(files) ? files : []
  const links = Array.isArray(next.links) ? next.links.slice() : []

  for (let i = 0; i < list.length; i += 1) {
    const file = list[i]
    if (!file || !isMidiImportFile(file)) continue
    const title = file.name || 'Attached MIDI'
    if (!String(next.name || '').trim() && file.name) {
      next.name = String(file.name).replace(/\.[^.]+$/, '')
    }
    const attached = await createAttachedMidiLink({
      tune: next,
      file: file,
      title: title,
      uploadToDrive: false,
    })
    if (attached && attached.link) {
      links.push(attached.link)
    }
  }

  next.links = links
  next.mediaCacheLocked = true
  return next
}

export async function removeAddDraftTuneFile(tune, fileId) {
  if (!tune || !fileId) return tune
  const next = removeTuneFileMeta(tune, fileId)
  try {
    await deleteStoredTuneFile(fileId, tune.id)
  } catch (e) { /* ignore */ }
  return next
}

export function removeAddDraftMediaLink(tune, linkIndex) {
  if (!tune || !Array.isArray(tune.links)) return tune
  const links = tune.links.slice()
  if (linkIndex < 0 || linkIndex >= links.length) return tune
  links.splice(linkIndex, 1)
  return Object.assign({}, tune, { links: links })
}
