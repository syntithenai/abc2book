/** Shared resolver credit + gating helpers for SPA feature buttons. */

import { formatEstimateCents } from './creditAffordabilityClient'
import { getResolverLoginWarning } from './mediaProxyClient'

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
  if (access.needsLogin) return 'Login to ' + label
  if (access.needsCredit) return 'Buy Credit to ' + label
  if (access.cannotAfford) {
    const est = formatEstimateCents(access.estimateCents)
    if (est) return 'Insufficient credit (~' + est + ' needed) — ' + label
    return 'Insufficient credit — ' + label
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
  const loginWarning = getResolverLoginWarning(opts.resolverStatus, normalizeAccessToken(opts.accessToken))
  const needsLogin = !!(loginWarning && loginWarning.showLoginButton)
  const needsCredit = !!(loginWarning && loginWarning.showBuyCreditButton)
  const hasCapability = resolverAvailable && hasFeature
  const showButton = resolverChecked && (hasCapability || needsLogin || needsCredit)

  return {
    showButton: showButton,
    needsLogin: needsLogin && showButton,
    needsCredit: needsCredit && showButton,
    canUse: hasCapability && !needsLogin && !needsCredit,
    loginWarning: loginWarning,
  }
}

export function openCreditSettings() {
  if (typeof window === 'undefined') return
  const path = '/settings'
  const url = path + '?tab=providers&credit=1'
  if (window.location && window.location.pathname === path) {
    window.dispatchEvent(new CustomEvent('tunebook-open-credit-settings'))
    return
  }
  window.location.assign(url)
}

export function runResolverGatedAction(access, handlers) {
  const opts = handlers || {}
  if (!access || !access.showButton && !access.showOption) return false
  if (access.needsLogin) {
    if (typeof opts.login === 'function') {
      opts.login()
    }
    return true
  }
  if (access.needsCredit) {
    if (typeof opts.buyCredit === 'function') {
      opts.buyCredit()
    } else {
      openCreditSettings()
    }
    return true
  }
  if (access.cannotAfford) {
    if (typeof opts.buyCredit === 'function') {
      opts.buyCredit()
    } else {
      openCreditSettings()
    }
    return true
  }
  if (typeof opts.onReady === 'function') {
    opts.onReady()
  }
  return false
}
