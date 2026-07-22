import { createScratchpadItem, ensureDefaultWorkspace } from './scratchpadStore'
import { resolveRecordingLinkAudio, isOwnedMediaLink } from './linkRecording'
import { getLinkSrcType } from './checkTuneLinkPlayback'
import { fetchDirectOrProxy } from './mediaProxyClient'

async function srcToBlob(src, srcType, options) {
  const trimmed = String(src || '').trim()
  if (!trimmed) return null
  if (trimmed.startsWith('data:')) {
    const response = await fetch(trimmed)
    return response.blob()
  }
  const result = await fetchDirectOrProxy({
    src: trimmed,
    srcType: srcType,
    youtubeGetId: options.youtubeGetId,
    accessToken: options.token,
  })
  return result.response.blob()
}

/**
 * Copy link audio bytes into a new scratchpad audio item.
 */
export async function createScratchpadItemFromLink(options) {
  const opts = options || {}
  const link = opts.link
  if (!link || !String(link.link || '').trim()) {
    throw new Error('Missing link')
  }

  const srcType = getLinkSrcType(link, opts.isYoutubeLink)
  if (srcType !== 'audio' && srcType !== 'recording') {
    throw new Error('Only audio links can be opened in scratchpad')
  }

  let blob = null
  if (srcType === 'recording' || isOwnedMediaLink(link)) {
    if (!opts.tuneId) {
      throw new Error('Save the tune before opening in scratchpad')
    }
    const resolved = await resolveRecordingLinkAudio(link, opts.tuneId, opts.linkIndex, {
      accessToken: opts.token,
      driveApi: opts.driveApi,
      forPlayback: true,
    })
    blob = resolved && resolved.blob
  } else {
    blob = await srcToBlob(link.link, srcType, opts)
  }

  if (!blob || blob.size <= 0) {
    throw new Error('Could not load audio data for scratchpad')
  }

  ensureDefaultWorkspace()
  const title = String(opts.title || link.title || 'Audio').trim() || 'Audio'
  return createScratchpadItem({
    type: 'audio',
    title: title,
    blob: blob,
    workspaceId: opts.workspaceId,
  })
}

export function linkCanOpenInScratchpad(link, isYoutubeLink) {
  const srcType = getLinkSrcType(link, isYoutubeLink)
  return srcType === 'audio' || srcType === 'recording'
}
