import { mergeAffordanceIntoAccess, getGatedActionLabel, normalizeAccessToken } from './resolverCreditAccess'
import { getResolverLoginWarning } from './mediaProxyClient'
import { getOfflineBlock } from './offlineNetwork'
import { isAiEnabled } from './resolverFeatures'

function audioTranscribeAvailable(resolverAvailable, features) {
  return resolverAvailable && isAiEnabled(features) && !!features.whisper
}

/**
 * Resolver-gated access for scratchpad audio Transcribe Use option.
 */
export function getScratchpadTranscribeAccess(context) {
  const opts = context || {}
  const resolverChecked = !!opts.resolverChecked
  const resolverAvailable = !!opts.resolverAvailable
  const features = opts.features || {}
  if (!isAiEnabled(features)) {
    return {
      showOption: false,
      needsLogin: false,
      needsCredit: false,
      canUse: false,
      loginWarning: null,
    }
  }
  const loginWarning = getOfflineBlock()
    || getResolverLoginWarning(opts.resolverStatus, normalizeAccessToken(opts.accessToken))
  const needsNetwork = !!(loginWarning && loginWarning.kind === 'offline')
  const needsLogin = !needsNetwork && !!(loginWarning && loginWarning.showLoginButton)
  const creditBlocked = !needsNetwork && !!(loginWarning && loginWarning.showBuyCreditButton)
  const hasCapability = audioTranscribeAvailable(resolverAvailable, features)
  const showOption = resolverChecked && (hasCapability || needsLogin)

  const baseAccess = {
    showOption: showOption,
    needsLogin: needsLogin && showOption,
    needsCredit: false,
    creditBlocked: creditBlocked,
    needsNetwork: needsNetwork,
    canUse: hasCapability && !needsLogin && !creditBlocked,
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
