import { mergeAffordanceIntoAccess, getGatedActionLabel, normalizeAccessToken } from './resolverCreditAccess'
import { getResolverLoginWarning } from './mediaProxyClient'
import { getOfflineBlock } from './offlineNetwork'

function audioTranscribeAvailable(resolverAvailable, features) {
  return resolverAvailable && !!features.whisper
}

/**
 * Resolver-gated access for scratchpad audio Transcribe Use option.
 */
export function getScratchpadTranscribeAccess(context) {
  const opts = context || {}
  const resolverChecked = !!opts.resolverChecked
  const resolverAvailable = !!opts.resolverAvailable
  const features = opts.features || {}
  const loginWarning = getOfflineBlock()
    || getResolverLoginWarning(opts.resolverStatus, normalizeAccessToken(opts.accessToken))
  const needsNetwork = !!(loginWarning && loginWarning.kind === 'offline')
  const needsLogin = !needsNetwork && !!(loginWarning && loginWarning.showLoginButton)
  const needsCredit = !needsNetwork && !!(loginWarning && loginWarning.showBuyCreditButton)
  const hasCapability = audioTranscribeAvailable(resolverAvailable, features)
  const showOption = resolverChecked && (hasCapability || needsLogin || needsCredit)

  const baseAccess = {
    showOption: showOption,
    needsLogin: needsLogin && showOption,
    needsCredit: needsCredit && showOption,
    needsNetwork: needsNetwork,
    canUse: hasCapability && !needsLogin && !needsCredit,
    loginWarning: loginWarning,
  }
  return mergeAffordanceIntoAccess(baseAccess, opts.affordance)
}

export function getScratchpadTranscribeUseLabel(access) {
  if (!access || !access.showOption) return ''
  return getGatedActionLabel(access, 'Transcribe')
}

export function getScratchpadTranscribeBackgroundStartMessage() {
  return 'Transcription is running in the background. You will get a notification when the text record is ready.'
}
