/**
 * Attach image/PDF and audio/video onto the live Add draft without review,
 * transcription, enrichment, or Google Drive upload.
 */

import { isSheetImageImportFile } from './importSourceParse'
import { isAudioImportFile, isVideoImportFile, isMidiImportFile } from './audioFileMetadata'
import { createTuneFileFromBlob, removeTuneFileMeta, deleteStoredTuneFile } from './tuneFiles'
import {
  createAttachedAudioLink,
  createAttachedVideoLink,
  createAttachedMidiLink,
  isOwnedMediaLink,
} from './linkRecording'
import { freshTuneId } from './importReviewCandidateUtils'
import { readAudioFileMetadata } from './audioFileMetadata'

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
 * @returns {'sheetImage'|'audio'|'video'|null}
 */
export function classifyAddFormFile(file) {
  if (!file) return null
  if (isSheetImageImportFile(file)) return 'sheetImage'
  if (isVideoImportFile(file)) return 'video'
  if (isAudioImportFile(file)) return 'audio'
  return null
}

/**
 * Attach image/PDF as tuneFiles on the draft (local only).
 */
export async function attachSheetImageToAddDraft(tune, file) {
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
  return result.tune
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
    let title = file.name || (isVideo ? 'Attached video' : 'Attached audio')
    if (!isVideo) {
      try {
        const metadata = await readAudioFileMetadata(file)
        if (metadata && metadata.title) title = metadata.title
        if (metadata && metadata.artist && !String(next.composer || '').trim()) {
          next.composer = metadata.artist
        }
        if (metadata && metadata.title && !String(next.name || '').trim()) {
          next.name = metadata.title
        }
      } catch (e) { /* ignore metadata errors */ }
    } else if (!String(next.name || '').trim() && file.name) {
      next.name = String(file.name).replace(/\.[^.]+$/, '')
    }

    const attached = isVideo
      ? await createAttachedVideoLink({
        tune: next,
        file: file,
        title: title,
        uploadToDrive: false,
      })
      : await createAttachedAudioLink({
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
