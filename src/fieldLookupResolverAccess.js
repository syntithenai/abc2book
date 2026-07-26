import { useMemo } from 'react'
import { getResolverLoginWarning } from './mediaProxyClient'
import useMediaResolverHealth from './useMediaResolverHealth'
import { isCapabilityAvailable, loadProviderSettings } from './providerSettings'

export function fieldLookupAutomaticLookup(kind, context) {
  const opts = context || {}
  if (opts.needsLogin) return false

  const resolverAvailable = !!opts.resolverAvailable
  const features = opts.features || {}
  const hasLocalChordSearch = !!opts.hasLocalChordSearch
  const hasLlm = resolverAvailable
    && isCapabilityAvailable('llm', features, loadProviderSettings())

  switch (kind) {
    case 'composer':
    case 'artists':
    case 'aliases':
    case 'genre':
    case 'albums':
      return true
    case 'background':
      return hasLlm
    case 'chords':
      return resolverAvailable || hasLocalChordSearch
    case 'lyrics':
    case 'notation':
      return resolverAvailable
    default:
      return resolverAvailable
  }
}

export function useFieldLookupResolverAccess(accessToken) {
  const health = useMediaResolverHealth()
  const loginWarning = useMemo(function() {
    return getResolverLoginWarning(health.status, accessToken)
  }, [health.status, accessToken])
  const needsLogin = !!loginWarning

  return useMemo(function() {
    const base = {
      resolverAvailable: health.available,
      resolverChecked: health.checked,
      resolverStatus: health.status,
      features: health.features,
      loginWarning: loginWarning,
      needsLogin: needsLogin,
    }
    return Object.assign({}, base, {
      automaticLookupFor: function(kind, extra) {
        return fieldLookupAutomaticLookup(kind, Object.assign({}, base, extra || {}))
      },
    })
  }, [
    health.available,
    health.checked,
    health.status,
    health.features,
    loginWarning,
    needsLogin,
  ])
}
