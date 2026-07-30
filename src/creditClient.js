import { fetchViaMediaProxy } from './mediaProxyClient'

export async function fetchBillingBalance(accessToken) {
  const response = await fetchViaMediaProxy('/billing/balance', accessToken, {
    method: 'GET',
  })
  if (!response.ok) {
    const body = await response.json().catch(function() { return {} })
    throw new Error((body && body.error) || ('Billing balance failed (' + response.status + ')'))
  }
  return response.json()
}

export async function fetchBillingHistory(accessToken, limit) {
  const query = typeof limit === 'number' ? ('?limit=' + encodeURIComponent(String(limit))) : ''
  const response = await fetchViaMediaProxy('/billing/history' + query, accessToken, {
    method: 'GET',
  })
  if (!response.ok) {
    const body = await response.json().catch(function() { return {} })
    throw new Error((body && body.error) || ('Billing history failed (' + response.status + ')'))
  }
  return response.json()
}

export async function createCreditCheckoutSession(accessToken, packId) {
  const response = await fetchViaMediaProxy('/billing/create-checkout-session', accessToken, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ pack_id: packId }),
  })
  if (!response.ok) {
    const body = await response.json().catch(function() { return {} })
    throw new Error((body && body.error) || ('Checkout failed (' + response.status + ')'))
  }
  return response.json()
}

export function formatCreditCents(cents) {
  const value = Number(cents)
  if (!Number.isFinite(value)) return '—'
  return '$' + (value / 100).toFixed(2)
}

export function formatLedgerDeltaMillicents(millicents) {
  const value = Number(millicents)
  if (!Number.isFinite(value)) return '—'
  const dollars = value / 100000
  const prefix = dollars > 0 ? '+' : ''
  return prefix + '$' + Math.abs(dollars).toFixed(4).replace(/0+$/, '').replace(/\.$/, '')
}

export function formatPaymentMethodsCopy(paymentMethods) {
  const stripe = paymentMethods && paymentMethods.stripe ? paymentMethods.stripe : {}
  const parts = []
  if (stripe.cards) parts.push('card')
  if (stripe.googlePay) parts.push('Google Pay')
  if (stripe.applePay) parts.push('Apple Pay')
  if (paymentMethods && paymentMethods.paypal) parts.push('PayPal')
  if (!parts.length) return 'card'
  if (parts.length === 1) return parts[0]
  return parts.slice(0, -1).join(', ') + ', or ' + parts[parts.length - 1]
}
