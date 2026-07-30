import {
  getGatedActionLabel,
  getResolverGatedActionAccess,
} from './resolverCreditAccess'

export { getGatedActionLabel, getResolverGatedActionAccess }

/**
 * Whether MIDI links should offer export-to-scratchpad notation.
 * Hide when no converter resolver exists; login label when auth blocks it.
 */
export function getMidiExportNotationAccess(context) {
  const access = getResolverGatedActionAccess(context, { requiresFeature: null })
  return {
    showButton: access.showButton,
    needsLogin: access.needsLogin,
    needsCredit: access.needsCredit,
    canExport: access.canUse,
    loginWarning: access.loginWarning,
  }
}

/**
 * Whether audio/video links should offer play-range editing with scan support.
 * Requires Whisper on the resolver; hide when unavailable, login label when auth blocks it.
 */
export function getLinkPlayRangeAccess(context) {
  const access = getResolverGatedActionAccess(context, { requiresFeature: 'whisper' })
  return {
    showButton: access.showButton,
    needsLogin: access.needsLogin,
    needsCredit: access.needsCredit,
    canOpen: access.canUse,
    loginWarning: access.loginWarning,
  }
}
