import { discoverComposers } from './composerSearchClient'
import {
  needsComposerDiscovery,
  parseTitleComposerHints,
  buildComposerPickerCandidates,
} from './composerDiscoveryUtils'
import { unwrapSearchResult } from './searchResultUtils'
import { isGenericArtist } from './genericArtistUtils'

export function pickComposerFromSearchResult(result) {
  if (!result) return ''
  if (result.multiple && Array.isArray(result.candidates) && result.candidates.length > 0) {
    return result.candidates[0].artist || ''
  }
  return result.artist || ''
}

export async function discoverComposerCandidatesIfNeeded(options) {
  const opts = options || {}
  const composer = String(opts.composer || '').trim()
  const hints = parseTitleComposerHints(opts.title, composer, opts.titleHint)
  if (!hints.title) return []

  const shouldDiscover = opts.forceDiscover || needsComposerDiscovery(composer)
  if (!shouldDiscover) return []

  const result = await discoverComposers({
    title: hints.title,
    artist: hints.artistHint || composer,
    titleHint: hints.titleHint,
    accessToken: opts.accessToken,
    signal: opts.signal,
    resolverAvailable: opts.resolverAvailable,
    onProgress: opts.onProgress,
  })

  return buildComposerPickerCandidates(result, composer)
}

export async function discoverComposerIfNeeded(options) {
  const opts = options || {}
  const composer = String(opts.composer || '').trim()
  if (composer && !isGenericArtist(composer)) {
    return composer
  }

  const hints = parseTitleComposerHints(opts.title, composer, opts.titleHint)
  if (!hints.title) return ''

  const result = unwrapSearchResult(await discoverComposers({
    title: hints.title,
    artist: hints.artistHint || composer,
    titleHint: hints.titleHint,
    accessToken: opts.accessToken,
    signal: opts.signal,
    resolverAvailable: opts.resolverAvailable,
    onProgress: opts.onProgress,
  }))

  const discovered = pickComposerFromSearchResult(result)
  return discovered && !isGenericArtist(discovered) ? discovered : ''
}

export function shouldAttemptComposerDiscovery(composer) {
  return needsComposerDiscovery(composer)
}
