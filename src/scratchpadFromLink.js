import { createScratchpadItem, ensureDefaultWorkspace } from './scratchpadStore'
import { getLinkSrcType } from './checkTuneLinkPlayback'
import { resolveTuneLinkAudioBlob } from './scratchpadAudioInsert'

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

  const blob = await resolveTuneLinkAudioBlob({
    link: link,
    linkIndex: opts.linkIndex != null ? opts.linkIndex : 0,
    tuneId: opts.tuneId,
    tune: opts.tune,
    tunebook: opts.tunebook,
    token: opts.token,
    driveApi: opts.driveApi,
    isYoutubeLink: opts.isYoutubeLink,
  })

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
