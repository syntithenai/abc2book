import { getGatedActionLabel, normalizeAccessToken } from './resolverCreditAccess'
import { getResolverLoginWarning } from './mediaProxyClient'
import { getOfflineBlock } from './offlineNetwork'

export const SCRATCHPAD_NOTATION_ABC_ACCEPT = '.abc,.txt,text/plain'
export const SCRATCHPAD_NOTATION_FULL_ACCEPT =
  '.abc,.txt,.xml,.musicxml,.mxl,.mid,.midi,audio/midi,audio/mid'

/**
 * Scratchpad notation import button + file picker behavior from resolver health.
 * - No resolver: ABC-only import
 * - Resolver reachable but auth required: login label
 * - Resolver available: ABC / MusicXML / MIDI
 */
export function getScratchpadNotationImportAccess(context) {
  const opts = context || {}
  const resolverChecked = !!opts.resolverChecked
  const resolverAvailable = !!opts.resolverAvailable
  const loginWarning = getOfflineBlock()
    || getResolverLoginWarning(opts.resolverStatus, normalizeAccessToken(opts.accessToken))
  const needsNetwork = !!(loginWarning && loginWarning.kind === 'offline')
  const needsLogin = !needsNetwork && !!(loginWarning && loginWarning.showLoginButton)
  const needsCredit = !needsNetwork && !!(loginWarning && loginWarning.showBuyCreditButton)

  if (!resolverChecked) {
    return {
      mode: 'loading',
      importLabel: 'Import ABC/MusicXML/MIDI',
      fileAccept: SCRATCHPAD_NOTATION_FULL_ACCEPT,
      canPickFile: false,
      needsLogin: false,
      abcOnly: false,
      loginWarning: null,
    }
  }

  if (needsNetwork) {
    return {
      mode: 'abcOnly',
      importLabel: 'Import ABC',
      fileAccept: SCRATCHPAD_NOTATION_ABC_ACCEPT,
      canPickFile: true,
      needsLogin: false,
      needsCredit: false,
      needsNetwork: true,
      abcOnly: true,
      loginWarning: loginWarning,
    }
  }

  if (needsLogin || needsCredit) {
    return {
      mode: needsCredit ? 'credit' : 'login',
      importLabel: 'Import ABC',
      loginImportLabel: getGatedActionLabel({ needsLogin: needsLogin, needsCredit: needsCredit }, 'Import MusicXML/MIDI'),
      fileAccept: SCRATCHPAD_NOTATION_ABC_ACCEPT,
      canPickFile: true,
      needsLogin: needsLogin,
      needsCredit: needsCredit,
      abcOnly: true,
      loginWarning: loginWarning,
    }
  }

  if (resolverAvailable) {
    return {
      mode: 'full',
      importLabel: 'Import ABC/MusicXML/MIDI',
      fileAccept: SCRATCHPAD_NOTATION_FULL_ACCEPT,
      canPickFile: true,
      needsLogin: false,
      abcOnly: false,
      loginWarning: null,
    }
  }

  return {
    mode: 'abcOnly',
    importLabel: 'Import ABC',
    fileAccept: SCRATCHPAD_NOTATION_ABC_ACCEPT,
    canPickFile: true,
    needsLogin: false,
    abcOnly: true,
    loginWarning: null,
  }
}
