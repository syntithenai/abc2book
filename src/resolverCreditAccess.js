/** Shared resolver credit + gating helpers for SPA feature buttons. */

import { toast } from 'react-toastify'
import { getResolverLoginWarning } from './mediaProxyClient'
import {
  OFFLINE_MESSAGE,
  getOfflineBlock,
  isNavigatorOffline,
} from './offlineNetwork'

export function normalizeAccessToken(token) {
  if (!token) return null
  if (typeof token === 'string') return token
  return token.access_token || null
}

export function getCreditBalanceCents(resolverStatus) {
  if (!resolverStatus || resolverStatus.creditBalanceCents == null) return null
  const value = Number(resolverStatus.creditBalanceCents)
  return Number.isFinite(value) ? value : null
}

export function resolverBillingEnabled(resolverStatus) {
  return !!(resolverStatus && resolverStatus.billingEnabled)
}

export function getGatedActionLabel(access, actionLabel) {
  const label = actionLabel || ''
  if (!access) return label
  if (access.needsNetwork) return label
  if (access.needsLogin) return 'Login to ' + label
  if (access.needsCredit || access.cannotAfford) {
    // Credit purchasing is disabled: never prompt to buy. The action is simply
    // unavailable for this account.
    return label ? ('Unavailable: ' + label) : 'Unavailable'
  }
  return label
}

export function mergeAffordanceIntoAccess(baseAccess, affordance) {
  const base = baseAccess || {}
  const afford = affordance || {}
  if (!afford.checked || afford.creditUnlimited || afford.error) {
    return base
  }
  const cannotAfford = !afford.affordable
  const needsCredit = base.needsCredit || cannotAfford
  const canUse = base.canUse && !cannotAfford
  const canGenerate = base.canGenerate != null ? (base.canGenerate && !cannotAfford) : undefined
  return Object.assign({}, base, {
    cannotAfford: cannotAfford,
    needsCredit: needsCredit,
    canUse: canUse,
    canGenerate: canGenerate != null ? canGenerate : canUse,
    estimateCents: afford.estimateCents,
    availableCents: afford.availableCents,
    shortfallCents: afford.shortfallCents,
    affordanceChecked: afford.checked,
  })
}

export function getResolverGatedActionAccess(context, options) {
  const opts = context || {}
  const gate = options || {}
  const requiresFeature = gate.requiresFeature || null
  const resolverAvailable = !!opts.resolverAvailable
  const resolverChecked = !!opts.resolverChecked
  const features = opts.features || {}
  const hasFeature = !requiresFeature || !!features[requiresFeature]
  const offlineBlock = getOfflineBlock()
  const needsNetwork = !!offlineBlock
  const loginWarning = needsNetwork
    ? offlineBlock
    : getResolverLoginWarning(opts.resolverStatus, normalizeAccessToken(opts.accessToken))
  const needsLogin = !needsNetwork && !!(loginWarning && loginWarning.showLoginButton)
  // Outstanding credit is not purchasable and not advertised; treat it as
  // unavailable rather than routing to a buy-credit prompt.
  const creditBlocked = !needsNetwork && !!(loginWarning && loginWarning.showBuyCreditButton)
  const hasCapability = resolverAvailable && hasFeature && !needsNetwork
  const showButton = resolverChecked && (hasCapability || needsLogin)

  return {
    showButton: showButton,
    needsLogin: needsLogin && showButton,
    needsCredit: false,
    creditBlocked: creditBlocked,
    needsNetwork: needsNetwork,
    canUse: hasCapability && !needsLogin && !creditBlocked,
    loginWarning: loginWarning,
  }
}

/**
 * Credit purchasing is disabled. This is intentionally a no-op so older
 * components cannot deep-link into a removed checkout flow.
 */
export function openCreditSettings() {
  return undefined
}

export function runResolverGatedAction(access, handlers) {
  const opts = handlers || {}
  if (!access) return false
  if (access.needsNetwork || isNavigatorOffline()) {
    if (typeof opts.onOffline === 'function') {
      opts.onOffline()
    } else {
      toast.info(OFFLINE_MESSAGE)
    }
    return true
  }
  if (!access.showButton && !access.showOption) return false
  if (access.needsLogin) {
    if (typeof opts.login === 'function') {
      opts.login()
    }
    return true
  }
  if (access.needsCredit || access.cannotAfford || access.creditBlocked) {
    // No purchase CTA: block silently, or let the caller show a neutral notice.
    if (typeof opts.onUnavailable === 'function') opts.onUnavailable()
    return true
  }
  if (typeof opts.onReady === 'function') {
    opts.onReady()
  }
  return false
}
