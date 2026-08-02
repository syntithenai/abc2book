import { createAttachedAudioLink } from './linkRecording'
import { getScratchpadBlob, putScratchpadBlob, deleteScratchpadBlob, scratchpadCompositionMediaBlobKey } from './scratchpadBlobs'
import { generateCompositionChunkId } from './scratchpadCompositionChordImport'

function cloneComposition(composition) {
  return JSON.parse(JSON.stringify(composition || {}))
}

function sortMediaAttachments(attachments) {
  return (Array.isArray(attachments) ? attachments.slice() : []).sort(function(a, b) {
    return (Number(a && a.order) || 0) - (Number(b && b.order) || 0)
  })
}

export function compositionMediaAttachments(composition) {
  return sortMediaAttachments(composition && composition.mediaAttachments)
}

export function addCompositionMediaAttachment(composition, entry) {
  if (!composition || !entry || !entry.id) return composition
  const next = cloneComposition(composition)
  const list = Array.isArray(next.mediaAttachments) ? next.mediaAttachments.slice() : []
  const order = entry.order != null ? entry.order : list.length
  list.push(Object.assign({}, entry, { order: order }))
  next.mediaAttachments = list
  return next
}

export function removeCompositionMediaAttachment(composition, attachmentId) {
  if (!composition || !attachmentId) return composition
  const next = cloneComposition(composition)
  next.mediaAttachments = (next.mediaAttachments || []).filter(function(entry) {
    return entry && entry.id !== attachmentId
  })
  return next
}

export async function storeCompositionMediaBlob(itemId, attachmentId, blob) {
  const blobKey = scratchpadCompositionMediaBlobKey(itemId, attachmentId)
  await putScratchpadBlob(blobKey, blob)
  return blobKey
}

export async function deleteCompositionMediaBlob(itemId, attachmentId) {
  const blobKey = scratchpadCompositionMediaBlobKey(itemId, attachmentId)
  await deleteScratchpadBlob(blobKey)
}

/**
 * Attach composition media files to a tune as owned-media links (same as scratchpad audio associate).
 */
export async function attachCompositionMediaToTune(tune, composition, itemId, options) {
  const opts = options || {}
  if (!tune || !composition) return tune
  const attachments = compositionMediaAttachments(composition)
  if (!attachments.length) return tune
  let next = Object.assign({}, tune)
  for (let i = 0; i < attachments.length; i += 1) {
    const entry = attachments[i]
    if (!entry || !entry.blobKey) continue
    const blob = await getScratchpadBlob(entry.blobKey)
    if (!blob || blob.size <= 0) continue
    const mimeType = entry.mimeType || blob.type || 'audio/webm'
    const fileName = entry.fileName || (entry.source === 'mic' ? 'recording.webm' : 'audio')
    const file = blob instanceof File
      ? blob
      : new File([blob], fileName, { type: mimeType })
    const link = await createAttachedAudioLink({
      tune: next,
      file: file,
      title: entry.title || fileName,
      token: opts.token,
      driveApi: opts.driveApi,
      uploadToDrive: opts.uploadToDrive !== false,
    })
    const links = Array.isArray(next.links) ? next.links.slice() : []
    links.unshift(link)
    next = Object.assign({}, next, { links: links })
  }
  return next
}

export function createCompositionMediaAttachmentDraft(itemId, options) {
  const opts = options || {}
  const id = generateCompositionChunkId()
  return {
    id: id,
    title: opts.title || 'Audio',
    blobKey: scratchpadCompositionMediaBlobKey(itemId, id),
    mimeType: opts.mimeType || '',
    fileName: opts.fileName || '',
    source: opts.source === 'mic' ? 'mic' : 'file',
    order: opts.order != null ? opts.order : 0,
    createdAt: Date.now(),
  }
}
