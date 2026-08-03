import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Spinner, Table } from 'react-bootstrap'
import { toast } from 'react-toastify'
import {
  createCreditCheckoutSession,
  fetchBillingBalance,
  fetchBillingHistory,
  formatCreditCents,
  formatLedgerDeltaMillicents,
  formatPaymentMethodsCopy,
} from '../creditClient'

export default function CreditSettingsSection(props) {
  const accessToken = props.accessToken
  const billingEnabled = !!props.billingEnabled
  const [loading, setLoading] = useState(false)
  const [balanceCents, setBalanceCents] = useState(null)
  const [creditUnlimited, setCreditUnlimited] = useState(false)
  const [packs, setPacks] = useState([])
  const [entries, setEntries] = useState([])
  const [paymentMethods, setPaymentMethods] = useState(null)
  const [error, setError] = useState('')
  const [checkoutPackId, setCheckoutPackId] = useState('')

  const loadBilling = useCallback(function() {
    if (!billingEnabled || !accessToken) {
      setBalanceCents(null)
      setEntries([])
      return Promise.resolve()
    }
    setLoading(true)
    setError('')
    return Promise.allSettled([
      fetchBillingBalance(accessToken),
      fetchBillingHistory(accessToken, 30),
    ]).then(function(results) {
      const balanceResult = results[0]
      const historyResult = results[1]
      if (balanceResult.status === 'rejected') {
        throw balanceResult.reason
      }
      const balanceBody = balanceResult.value || {}
      const historyBody = historyResult.status === 'fulfilled' ? (historyResult.value || {}) : {}
      setBalanceCents(typeof balanceBody.balanceCents === 'number' ? balanceBody.balanceCents : null)
      setCreditUnlimited(!!balanceBody.creditUnlimited)
      setPacks(Array.isArray(balanceBody.packs) ? balanceBody.packs : [])
      setPaymentMethods(balanceBody.paymentMethods || null)
      setEntries(Array.isArray(historyBody.entries) ? historyBody.entries : [])
      if (historyResult.status === 'rejected') {
        const historyMessage = historyResult.reason && historyResult.reason.message
          ? historyResult.reason.message
          : 'Could not load usage history'
        setError(historyMessage + ' (balance loaded)')
      }
    }).catch(function(err) {
      setError(err && err.message ? err.message : 'Could not load billing')
    }).finally(function() {
      setLoading(false)
    })
  }, [billingEnabled, accessToken])

  useEffect(function() {
    loadBilling()
  }, [loadBilling])

  useEffect(function() {
    function onOpenCredit() {
      loadBilling()
    }
    window.addEventListener('tunebook-open-credit-settings', onOpenCredit)
    return function() {
      window.removeEventListener('tunebook-open-credit-settings', onOpenCredit)
    }
  }, [loadBilling])

  async function handleBuyPack(packId) {
    if (!accessToken || !packId) return
    setCheckoutPackId(packId)
    setError('')
    try {
      const session = await createCreditCheckoutSession(accessToken, packId)
      if (session && session.url) {
        window.location.assign(session.url)
        return
      }
      throw new Error('Checkout session did not return a URL')
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Could not start checkout')
      setCheckoutPackId('')
    }
  }

  if (!billingEnabled) {
    return (
      <div className="mb-3">
        <h3>Resolver credit</h3>
        <p className="app-text-muted mb-0">
          Credit billing is not enabled on this resolver. Use your own API keys under Providers, or run a local resolver.
        </p>
      </div>
    )
  }

  return (
    <div className="mb-4">
      <h3>Resolver credit</h3>
      <p className="app-text-muted">
        Prepaid credit covers hosted resolver features (LLM, Whisper, OCR, stems, TTS title announcements, media proxy egress, and feed enrichment).
        When you use your own API keys (BYO), Tunebook still charges a small flat proxy fee plus egress for traffic through the hosted resolver.
        Usage is billed at twice the upstream cost. New accounts receive trial credit on first sign-in.
      </p>
      {!accessToken ? (
        <Alert variant="warning">Sign in with Google to view balance and buy credit.</Alert>
      ) : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}
      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <strong>Balance:</strong>
        {loading ? <Spinner animation="border" size="sm" /> : (
          <span>
            {creditUnlimited ? (
              <>
                Unlimited (allowlisted)
                {typeof balanceCents === 'number' && balanceCents > 0 ? (
                  <span className="app-text-muted"> — {formatCreditCents(balanceCents)} purchased</span>
                ) : null}
              </>
            ) : formatCreditCents(balanceCents)}
          </span>
        )}
        <Button variant="outline-secondary" size="sm" disabled={loading || !accessToken} onClick={loadBilling}>
          Refresh
        </Button>
      </div>
      {accessToken && creditUnlimited ? (
        <p className="app-text-muted small mb-2">
          Your account has unlimited resolver access via the allowlist. You can still buy credit to test checkout
          or build ledger history; usage is not deducted while you remain allowlisted.
        </p>
      ) : null}
      {accessToken ? (
        <div className="d-flex flex-wrap gap-2 mb-3">
          {(packs.length ? packs : [
            { id: 'pack_1', label: '$1', amount_cents: 100 },
            { id: 'pack_5', label: '$5', amount_cents: 500 },
            { id: 'pack_10', label: '$10', amount_cents: 1000 },
          ]).map(function(pack) {
            return (
              <Button
                key={pack.id}
                variant="primary"
                size="sm"
                disabled={!!checkoutPackId}
                onClick={function() { handleBuyPack(pack.id) }}
              >
                {checkoutPackId === pack.id ? 'Redirecting…' : ('Buy ' + (pack.label || formatCreditCents(pack.amount_cents)))}
              </Button>
            )
          })}
        </div>
      ) : null}
      {accessToken && paymentMethods ? (
        <p className="app-text-muted small mb-3">
          Pay with {formatPaymentMethodsCopy(paymentMethods)} via secure Stripe Checkout.
        </p>
      ) : null}
      {entries.length > 0 ? (
        <Table responsive size="sm" className="mb-0">
          <thead>
            <tr>
              <th>When</th>
              <th>Type</th>
              <th>Detail</th>
              <th className="text-end">Change</th>
              <th className="text-end">Balance</th>
            </tr>
          </thead>
          <tbody>
            {entries.map(function(entry) {
              const when = entry.created_at
                ? new Date(entry.created_at * 1000).toLocaleString()
                : ''
              return (
                <tr key={entry.id}>
                  <td>{when}</td>
                  <td>{entry.entry_type || ''}</td>
                  <td>{entry.usage_type || ''}</td>
                  <td className="text-end">{formatLedgerDeltaMillicents(entry.delta_millicents)}</td>
                  <td className="text-end">{formatLedgerDeltaMillicents(entry.balance_after_millicents).replace('+', '')}</td>
                </tr>
              )
            })}
          </tbody>
        </Table>
      ) : (
        <p className="app-text-muted mb-0">No usage history yet.</p>
      )}
    </div>
  )
}
