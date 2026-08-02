import { useEffect, useMemo, useState } from 'react'
import { checkCanAfford } from './creditAffordabilityClient'
import { normalizeAccessToken } from './resolverCreditAccess'

export function useCreditAffordance(accessToken, operationId, params) {
  const token = normalizeAccessToken(accessToken)
  const [state, setState] = useState({
    checked: false,
    affordable: true,
    estimateCents: null,
    availableCents: null,
    shortfallCents: null,
    creditUnlimited: false,
    error: null,
  })

  const paramsKey = useMemo(function() {
    try {
      return JSON.stringify(params || {})
    } catch (_err) {
      return ''
    }
  }, [params])

  useEffect(function() {
    if (!token || !operationId) {
      setState({
        checked: true,
        affordable: true,
        estimateCents: null,
        availableCents: null,
        shortfallCents: null,
        creditUnlimited: false,
        error: null,
      })
      return undefined
    }

    let cancelled = false
    setState(function(prev) {
      return Object.assign({}, prev, { checked: false, error: null })
    })

    checkCanAfford(token, [{ id: operationId, params: params || {} }])
      .then(function(body) {
        if (cancelled) return
        const result = (body.results && body.results[0]) || {}
        setState({
          checked: true,
          affordable: !!(body.creditUnlimited || result.affordable || body.affordable),
          estimateCents: result.estimateCents != null ? result.estimateCents : body.totalEstimateCents,
          availableCents: result.availableCents != null ? result.availableCents : body.availableCents,
          shortfallCents: result.shortfallCents != null ? result.shortfallCents : body.totalShortfallCents,
          creditUnlimited: !!(body.creditUnlimited || result.creditUnlimited),
          error: null,
        })
      })
      .catch(function(err) {
        if (cancelled) return
        setState({
          checked: true,
          affordable: true,
          estimateCents: null,
          availableCents: null,
          shortfallCents: null,
          creditUnlimited: false,
          error: err && err.message ? err.message : 'Affordance check failed',
        })
      })

    return function() {
      cancelled = true
    }
  }, [token, operationId, paramsKey])

  return state
}
