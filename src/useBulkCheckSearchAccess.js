import { useMemo } from 'react'
import useMediaResolverHealth from './useMediaResolverHealth'
import {
  getBulkCheckResolverLoginWarning,
  getBulkCheckSearchActionAccess,
} from './bulkCheckSearchAccess'

export function useBulkCheckResolverAccess(accessToken) {
  const health = useMediaResolverHealth()

  return useMemo(function() {
    const context = {
      resolverAvailable: health.available,
      resolverChecked: health.checked,
      resolverStatus: health.status,
      accessToken: accessToken,
      features: health.features,
    }
    return {
      resolverAvailable: health.available,
      resolverChecked: health.checked,
      resolverStatus: health.status,
      features: health.features,
      loginWarning: getBulkCheckResolverLoginWarning(context),
    }
  }, [accessToken, health.available, health.checked, health.status, health.features])
}

export function useBulkCheckSearchActionAccess(actionId, tune, tunebook, accessToken) {
  const resolver = useBulkCheckResolverAccess(accessToken)

  return useMemo(function() {
    return getBulkCheckSearchActionAccess(actionId, {
      tune: tune,
      tunebook: tunebook,
      resolverAvailable: resolver.resolverAvailable,
      resolverChecked: resolver.resolverChecked,
      resolverStatus: resolver.resolverStatus,
      accessToken: accessToken,
      features: resolver.features,
    })
  }, [
    actionId,
    tune,
    tunebook,
    accessToken,
    resolver.resolverAvailable,
    resolver.resolverChecked,
    resolver.resolverStatus,
    resolver.features,
  ])
}
