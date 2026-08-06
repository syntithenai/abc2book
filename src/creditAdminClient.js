import { fetchViaMediaProxy, hasBillingAdminAccess } from './mediaProxyClient'

export function isBillingAdminAvailable(status, user) {
  if (!status) return false
  if (status.billingAdminAccess) return true
  if (hasBillingAdminAccess(status.candidates || [])) return true
  return false
}

async function parseBillingAdminError(response, fallback) {
  const body = await response.json().catch(function() { return {} })
  const detail = body && (body.detail || body.error)
  if (typeof detail === 'string' && detail) return detail
  return fallback + ' (' + response.status + ')'
}

export async function fetchBillingAdminAccounts(accessToken, options) {
  const opts = options || {}
  const params = new URLSearchParams()
  if (typeof opts.limit === 'number') params.set('limit', String(opts.limit))
  if (typeof opts.offset === 'number') params.set('offset', String(opts.offset))
  if (opts.q) params.set('q', opts.q)
  const query = params.toString()
  const path = '/billing/admin/accounts' + (query ? ('?' + query) : '')
  const response = await fetchViaMediaProxy(path, accessToken, { method: 'GET' })
  if (!response.ok) {
    throw new Error(await parseBillingAdminError(response, 'Billing admin accounts failed'))
  }
  return response.json()
}

export async function fetchBillingAdminLedger(accessToken, email, limit) {
  const encoded = encodeURIComponent(email || '')
  const query = typeof limit === 'number' ? ('?limit=' + encodeURIComponent(String(limit))) : ''
  const response = await fetchViaMediaProxy(
    '/billing/admin/accounts/' + encoded + '/ledger' + query,
    accessToken,
    { method: 'GET' },
  )
  if (!response.ok) {
    throw new Error(await parseBillingAdminError(response, 'Billing admin ledger failed'))
  }
  return response.json()
}

export async function patchBillingAdminAccount(accessToken, email, patch) {
  const encoded = encodeURIComponent(email || '')
  const response = await fetchViaMediaProxy(
    '/billing/admin/accounts/' + encoded,
    accessToken,
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch || {}),
    },
  )
  if (!response.ok) {
    throw new Error(await parseBillingAdminError(response, 'Billing admin update failed'))
  }
  return response.json()
}
