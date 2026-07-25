import { toast } from 'react-toastify'
import { getLinkSrcType } from './checkTuneLinkPlayback'
import { resolveMidiLinkPlaybackData } from './midiLinkResolve'
import { openMidiImportWizard } from './midiImportWizard'
import { registerLongRunningJob } from './longRunningJobRegistry'
import { createScratchpadItem, blankNotationTune } from './scratchpadStore'
import { showScratchpadExportToast } from './scratchpadExportToast'
import { getActiveResolverAccessToken } from './mediaResolverHealthStore'
import { resolveResolverAccessToken } from './resolverAccessToken'

function midiFileNameFromLink(link) {
  const title = String(link && link.title || 'export').trim() || 'export'
  return /\.mid(i)?$/i.test(title) ? title : title + '.mid'
}

export async function resolveMidiBytesForLink(link, tuneId, linkIndex, options) {
  const srcType = getLinkSrcType(link, options && options.isYoutubeLink)
  if (srcType !== 'midifile') {
    throw new Error('Not a MIDI media link')
  }
  const resolved = await resolveMidiLinkPlaybackData(link, tuneId, linkIndex, options || {})
  return {
    bytes: new Uint8Array(resolved.arrayBuffer),
    fileName: midiFileNameFromLink(link),
  }
}

export async function exportMidiLinkToScratchpad(options) {
  const opts = options || {}
  const link = opts.link
  const tuneId = opts.tuneId
  const linkIndex = opts.linkIndex != null ? opts.linkIndex : 0
  if (!link || !tuneId) {
    throw new Error('Missing MIDI link')
  }
  if (!opts.workspaceId) {
    throw new Error('Choose a scratchpad workspace')
  }

  const midi = await resolveMidiBytesForLink(link, tuneId, linkIndex, {
    accessToken: opts.accessToken && (opts.accessToken.access_token || opts.accessToken),
    driveApi: opts.driveApi,
    isYoutubeLink: opts.isYoutubeLink,
  })

  const wizardResult = await openMidiImportWizard({
    midiBytes: midi.bytes,
    fileName: midi.fileName,
    accessToken: resolveResolverAccessToken(opts.accessToken) || getActiveResolverAccessToken(),
  })

  const unregister = registerLongRunningJob({ label: 'Export MIDI to scratchpad' })
  try {
    const candidate = wizardResult && wizardResult.candidates && wizardResult.candidates[0]
    const tuneSnapshot = candidate && candidate.tune
      ? candidate.tune
      : blankNotationTune(null, link.title || 'Notation')

    const item = await createScratchpadItem({
      type: 'notation',
      title: tuneSnapshot.name || link.title || 'Notation',
      tuneSnapshot: tuneSnapshot,
      workspaceId: opts.workspaceId,
    })

    showScratchpadExportToast({
      message: 'MIDI exported to scratchpad notation',
      itemId: item.id,
      onOpen: opts.onOpenItem,
    })
    return item
  } catch (e) {
    if (!e || !e.message || e.message.indexOf('cancelled') === -1) {
      toast.error(e && e.message ? e.message : 'Could not export MIDI to scratchpad')
    }
    throw e
  } finally {
    unregister()
  }
}
