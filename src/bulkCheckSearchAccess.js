import { fieldLookupAutomaticLookup } from './fieldLookupResolverAccess'
import { buildGoogleComposerSearchUrl } from './composerDiscoveryUtils'
import { buildGoogleChordsSearchUrl } from './chordSearchSites'
import { buildExternalSearchUrl } from './externalSearchLinks'
import { getResolverLoginWarning } from './mediaProxyClient'
import { getOfflineBlock } from './offlineNetwork'
import { buildTuneBackgroundSearchUrl } from './tuneBackgroundResearchClient'
import { lyricLinesToText } from './wLinesUtils'

export const BULK_CHECK_SEARCH_ACTION_IDS = [
  'searchArtist',
  'backgroundInfo',
  'searchChordsLyrics',
  'searchAbc',
]

export const BULK_CHECK_RESOLVER_GATED_ACTION_IDS = BULK_CHECK_SEARCH_ACTION_IDS.concat([
  'scanLinkRegion',
])

export function isBulkCheckSearchAction(actionId) {
  return BULK_CHECK_SEARCH_ACTION_IDS.indexOf(actionId) >= 0
}

export function isBulkCheckResolverGatedAction(actionId) {
  return BULK_CHECK_RESOLVER_GATED_ACTION_IDS.indexOf(actionId) >= 0
}

function unavailableReason(access) {
  if (!access) return ''
  if (access.needsNetwork && access.loginWarning) return access.loginWarning.message
  if ((access.needsLogin || access.needsCredit) && access.loginWarning) return access.loginWarning.message
  if (access.actionId === 'scanLinkRegion') {
    return 'Playback region scan needs the media resolver with Whisper available'
  }
  return 'Search needs the media resolver'
}

function tuneSearchFields(tune) {
  const title = tune && tune.name ? String(tune.name).trim() : ''
  const artist = tune && tune.composer ? String(tune.composer).trim() : ''
  const lyrics = tune ? lyricLinesToText(tune) : ''
  return { title: title, artist: artist, lyrics: lyrics }
}

export function getBulkCheckActionAccess(actionId, context) {
  if (!isBulkCheckResolverGatedAction(actionId)) return null

  const opts = context || {}
  const tune = opts.tune || null
  const fields = tuneSearchFields(tune)
  const resolverAvailable = !!opts.resolverAvailable
  const loginWarning = getOfflineBlock()
    || getResolverLoginWarning(opts.resolverStatus, opts.accessToken)
  const needsNetwork = !!(loginWarning && loginWarning.kind === 'offline')
  const needsLogin = !needsNetwork && !!(loginWarning && loginWarning.showLoginButton)
  const needsCredit = !needsNetwork && !!(loginWarning && loginWarning.showBuyCreditButton)
  const blocked = needsLogin || needsCredit || needsNetwork
  const lookupContext = {
    needsLogin: blocked,
    resolverAvailable: resolverAvailable,
    features: opts.features || {},
    hasLocalChordSearch: !!(opts.tunebook && opts.tunebook.abcTools),
  }
  const hasWhisper = !!(opts.features && opts.features.whisper)

  let automaticLookup = false
  let externalUrl = ''

  switch (actionId) {
    case 'searchArtist':
      automaticLookup = fieldLookupAutomaticLookup('composer', lookupContext)
      externalUrl = buildGoogleComposerSearchUrl(fields.title, fields.artist)
      break
    case 'backgroundInfo':
      automaticLookup = fieldLookupAutomaticLookup('background', lookupContext)
      externalUrl = buildTuneBackgroundSearchUrl(fields.title, fields.artist, fields.lyrics)
      break
    case 'searchChordsLyrics':
      automaticLookup = fieldLookupAutomaticLookup('chords', lookupContext)
      externalUrl = buildGoogleChordsSearchUrl(fields.title, fields.artist, '')
      break
    case 'searchAbc':
      automaticLookup = fieldLookupAutomaticLookup('notation', lookupContext)
      externalUrl = buildExternalSearchUrl('notation', fields.title, fields.artist)
      break
    case 'scanLinkRegion':
      automaticLookup = resolverAvailable && hasWhisper && !blocked
      break
    default:
      break
  }

  const showExternalOnly = !automaticLookup && !!externalUrl
  const showSearchButton = automaticLookup || blocked
  const requiresTitle = actionId !== 'scanLinkRegion'
  const searchDisabled = (requiresTitle && !fields.title) || blocked || !automaticLookup
  const access = {
    actionId: actionId,
    title: fields.title,
    needsLogin: needsLogin,
    needsCredit: needsCredit,
    needsNetwork: needsNetwork,
    loginWarning: loginWarning,
    automaticLookup: automaticLookup,
    externalUrl: externalUrl,
    showExternalOnly: showExternalOnly,
    showSearchButton: showSearchButton,
    searchDisabled: searchDisabled,
    canRunAutomatic: automaticLookup && (!requiresTitle || !!fields.title) && !blocked,
  }
  access.unavailableReason = unavailableReason(access)
  return access
}

export function getBulkCheckSearchActionAccess(actionId, context) {
  if (!isBulkCheckSearchAction(actionId)) return null
  return getBulkCheckActionAccess(actionId, context)
}

export function getBulkCheckResolverLoginWarning(context) {
  const opts = context || {}
  return getResolverLoginWarning(opts.resolverStatus, opts.accessToken)
}
