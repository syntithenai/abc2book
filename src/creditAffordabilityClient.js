import { fetchViaMediaProxy } from './mediaProxyClient'

export function parseInsufficientCreditBody(body) {
  if (!body || typeof body !== 'object') return null
  if (body.error !== 'insufficient_credit') return null
  return {
    error: 'insufficient_credit',
    operation: body.operation || '',
    estimateCents: body.estimateCents,
    availableCents: body.availableCents,
    balanceCents: body.balanceCents,
    shortfallCents: body.shortfallCents,
  }
}

export function formatEstimateCents(cents) {
  const value = Number(cents)
  if (!Number.isFinite(value)) return ''
  const dollars = value / 100
  if (dollars < 0.01) return '<$0.01'
  return '$' + dollars.toFixed(2)
}

export async function fetchOperationEstimates(accessToken) {
  const response = await fetchViaMediaProxy('/billing/estimates', accessToken, {
    method: 'GET',
  })
  if (!response.ok) {
    const body = await response.json().catch(function() { return {} })
    throw new Error((body && body.error) || ('Estimates failed (' + response.status + ')'))
  }
  return response.json()
}

export async function checkCanAfford(accessToken, operations, options) {
  const opts = options || {}
  const response = await fetchViaMediaProxy('/billing/can-afford', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      operations: operations || [],
      model: opts.model || '',
    }),
  })
  if (!response.ok) {
    const body = await response.json().catch(function() { return {} })
    throw new Error((body && body.error) || ('Affordance check failed (' + response.status + ')'))
  }
  return response.json()
}

export function affordanceForOperation(canAffordBody, operationId) {
  const results = (canAffordBody && canAffordBody.results) || []
  return results.find(function(item) {
    return item && item.id === operationId
  }) || null
}
