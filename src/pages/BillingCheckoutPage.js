import { useCallback, useEffect, useState } from 'react'
import { Link, useNavigate, useSearchParams } from 'react-router-dom'
import { Alert, Button, Spinner } from 'react-bootstrap'
import { useDocumentTitle } from '../pageTitle'
import { fetchBillingBalance, formatCreditCents } from '../creditClient'
import useMediaResolverHealth from '../useMediaResolverHealth'

const CREDIT_SETTINGS_PATH = '/settings?tab=providers&credit=1'

export default function BillingCheckoutPage(props) {
  const outcome = props.outcome === 'cancel' ? 'cancel' : 'success'
  const accessToken = props.token && props.token.access_token ? props.token.access_token : null
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const sessionId = searchParams.get('session_id') || ''
  const { refreshMediaResolverHealth } = useMediaResolverHealth()
  const [balanceCents, setBalanceCents] = useState(null)
  const [balanceLoading, setBalanceLoading] = useState(outcome === 'success')
  const [balanceError, setBalanceError] = useState('')

  useDocumentTitle(outcome === 'success' ? 'Payment received' : 'Checkout cancelled')

  const loadBalance = useCallback(function() {
    if (!accessToken) {
      setBalanceLoading(false)
      return Promise.resolve()
    }
    setBalanceLoading(true)
    setBalanceError('')
    return refreshMediaResolverHealth(accessToken).then(function() {
      return fetchBillingBalance(accessToken)
    }).then(function(body) {
      if (typeof body.balanceCents === 'number') {
        setBalanceCents(body.balanceCents)
      }
    }).catch(function(err) {
      setBalanceError(err && err.message ? err.message : 'Could not load balance')
    }).finally(function() {
      setBalanceLoading(false)
    })
  }, [accessToken, refreshMediaResolverHealth])

  useEffect(function() {
    if (outcome !== 'success' || !accessToken) {
      setBalanceLoading(false)
      return undefined
    }
    let cancelled = false
    let attempts = 0
    function poll() {
      if (cancelled) return
      loadBalance().finally(function() {
        attempts += 1
        if (!cancelled && attempts < 6) {
          window.setTimeout(poll, 2000)
        }
      })
    }
    poll()
    return function() {
      cancelled = true
    }
  }, [outcome, accessToken, loadBalance])

  function openCreditSettings() {
    navigate(CREDIT_SETTINGS_PATH)
  }

  if (outcome === 'cancel') {
    return (
      <div className="App-settings p-3 p-md-4" style={{ maxWidth: 640, margin: '0 auto' }}>
        <h1>Checkout cancelled</h1>
        <Alert variant="info">
          No charge was made. You can buy resolver credit any time from Settings → Providers.
          If you left checkout after a card decline, try again with a different card or payment method.
        </Alert>
        <div className="d-flex flex-wrap gap-2">
          <Button variant="primary" onClick={openCreditSettings}>
            Back to credit
          </Button>
          <Button as={Link} to="/" variant="outline-secondary">
            Home
          </Button>
        </div>
      </div>
    )
  }

  return (
    <div className="App-settings p-3 p-md-4" style={{ maxWidth: 640, margin: '0 auto' }}>
      <h1>Payment received</h1>
      <Alert variant="success">
        Thanks — your Stripe payment completed. Resolver credit is added automatically; it may take a few seconds to appear.
      </Alert>
      {sessionId ? (
        <p className="app-text-muted small">Checkout reference: {sessionId}</p>
      ) : null}
      {!accessToken ? (
        <Alert variant="warning">
          Sign in with the same Google account you used at checkout to see your updated balance.
          {typeof props.login === 'function' ? (
            <div className="mt-2">
              <Button variant="outline-warning" size="sm" onClick={props.login}>
                Log in with Google
              </Button>
            </div>
          ) : null}
        </Alert>
      ) : null}
      {accessToken ? (
        <div className="mb-3">
          <strong>Current balance: </strong>
          {balanceLoading ? <Spinner animation="border" size="sm" className="ms-2" /> : (
            <span>{formatCreditCents(balanceCents)}</span>
          )}
          {balanceError ? <div className="text-danger small mt-1">{balanceError}</div> : null}
        </div>
      ) : null}
      <div className="d-flex flex-wrap gap-2">
        <Button variant="primary" onClick={openCreditSettings}>
          View credit &amp; history
        </Button>
        <Button variant="outline-secondary" disabled={!accessToken || balanceLoading} onClick={loadBalance}>
          Refresh balance
        </Button>
        <Button as={Link} to="/" variant="outline-secondary">
          Home
        </Button>
      </div>
    </div>
  )
}
