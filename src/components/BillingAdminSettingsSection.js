import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Form, Spinner, Table } from 'react-bootstrap'
import { toast } from 'react-toastify'
import {
  fetchBillingAdminAccounts,
  fetchBillingAdminLedger,
  patchBillingAdminAccount,
} from '../creditAdminClient'
import { formatLedgerDeltaMillicents } from '../creditClient'

const PAGE_SIZE = 50

function formatWhen(ts) {
  if (!ts) return '—'
  const date = new Date(ts * 1000)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

function accountDraftKey(account) {
  return account.email + '|' + String(account.balanceCents)
}

export default function BillingAdminSettingsSection(props) {
  const accessToken = props.accessToken
  const billingEnabled = !!props.billingEnabled
  const [loading, setLoading] = useState(false)
  const [savingEmail, setSavingEmail] = useState('')
  const [error, setError] = useState('')
  const [accounts, setAccounts] = useState([])
  const [total, setTotal] = useState(0)
  const [offset, setOffset] = useState(0)
  const [searchInput, setSearchInput] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedEmail, setSelectedEmail] = useState('')
  const [drafts, setDrafts] = useState({})
  const [ledgerLoading, setLedgerLoading] = useState(false)
  const [ledgerEntries, setLedgerEntries] = useState([])
  const searchTimerRef = useRef(null)

  const loadAccounts = useCallback(function() {
    if (!billingEnabled || !accessToken) {
      setAccounts([])
      setTotal(0)
      return Promise.resolve()
    }
    setLoading(true)
    setError('')
    return fetchBillingAdminAccounts(accessToken, {
      limit: PAGE_SIZE,
      offset: offset,
      q: searchQuery,
    }).then(function(body) {
      const rows = Array.isArray(body.accounts) ? body.accounts : []
      setAccounts(rows)
      setTotal(typeof body.total === 'number' ? body.total : rows.length)
      const nextDrafts = {}
      rows.forEach(function(account) {
        nextDrafts[account.email] = {
          email: account.email,
          balanceCents: account.balanceCents,
        }
      })
      setDrafts(nextDrafts)
    }).catch(function(err) {
      setError(err && err.message ? err.message : 'Could not load billing accounts')
    }).finally(function() {
      setLoading(false)
    })
  }, [billingEnabled, accessToken, offset, searchQuery])

  const loadLedger = useCallback(function(email) {
    if (!billingEnabled || !accessToken || !email) {
      setLedgerEntries([])
      return Promise.resolve()
    }
    setLedgerLoading(true)
    return fetchBillingAdminLedger(accessToken, email, 200).then(function(body) {
      setLedgerEntries(Array.isArray(body.entries) ? body.entries : [])
    }).catch(function(err) {
      toast.error(err && err.message ? err.message : 'Could not load ledger')
      setLedgerEntries([])
    }).finally(function() {
      setLedgerLoading(false)
    })
  }, [billingEnabled, accessToken])

  useEffect(function() {
    loadAccounts()
  }, [loadAccounts])

  useEffect(function() {
    if (selectedEmail) {
      loadLedger(selectedEmail)
    } else {
      setLedgerEntries([])
    }
  }, [selectedEmail, loadLedger])

  useEffect(function() {
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    searchTimerRef.current = setTimeout(function() {
      setSearchQuery(searchInput.trim())
      setOffset(0)
    }, 300)
    return function() {
      if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    }
  }, [searchInput])

  function updateDraft(email, field, value) {
    setDrafts(function(prev) {
      const current = prev[email] || { email: email, balanceCents: 0 }
      return Object.assign({}, prev, {
        [email]: Object.assign({}, current, { [field]: value }),
      })
    })
  }

  function draftDirty(account) {
    const draft = drafts[account.email]
    if (!draft) return false
    const balanceChanged = Number(draft.balanceCents) !== Number(account.balanceCents)
    const emailChanged = (draft.email || '').trim().toLowerCase() !== account.email
    return balanceChanged || emailChanged
  }

  async function handleSave(account) {
    if (!accessToken || !account || !account.email) return
    const draft = drafts[account.email]
    if (!draft || !draftDirty(account)) return

    const patch = {}
    const newEmail = (draft.email || '').trim().toLowerCase()
    if (newEmail && newEmail !== account.email) {
      patch.newEmail = newEmail
    }
    if (Number(draft.balanceCents) !== Number(account.balanceCents)) {
      patch.balanceCents = Number(draft.balanceCents)
    }

    setSavingEmail(account.email)
    setError('')
    try {
      const result = await patchBillingAdminAccount(accessToken, account.email, patch)
      toast.success('Updated ' + (result.account && result.account.email ? result.account.email : account.email))
      const savedEmail = result.account && result.account.email ? result.account.email : newEmail || account.email
      if (selectedEmail === account.email) {
        setSelectedEmail(savedEmail)
      }
      await loadAccounts()
      if (savedEmail) {
        await loadLedger(savedEmail)
      }
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Could not save account')
    } finally {
      setSavingEmail('')
    }
  }

  if (!billingEnabled) {
    return (
      <div className="app-surface-panel App-settings-section">
        <h2>Billing admin</h2>
        <p className="app-text-muted mb-0">Credit billing is not enabled on this resolver.</p>
      </div>
    )
  }

  const pageStart = total === 0 ? 0 : offset + 1
  const pageEnd = Math.min(offset + accounts.length, total)

  return (
    <div className="app-surface-panel App-settings-section">
      <h2>Billing admin</h2>
      <p className="app-text-muted">
        View and edit credit accounts. Only configured admins can access this panel; other users see only their own balance.
      </p>
      {!accessToken ? (
        <Alert variant="warning">Sign in with Google to manage billing accounts.</Alert>
      ) : null}
      {error ? <Alert variant="danger">{error}</Alert> : null}

      <div className="d-flex flex-wrap align-items-center gap-2 mb-3">
        <Form.Control
          type="search"
          size="sm"
          placeholder="Search email"
          value={searchInput}
          onChange={function(e) { setSearchInput(e.target.value) }}
          style={{ maxWidth: '280px' }}
        />
        <Button variant="outline-secondary" size="sm" disabled={loading || !accessToken} onClick={loadAccounts}>
          Refresh
        </Button>
        {loading ? <Spinner animation="border" size="sm" /> : null}
        <span className="app-text-muted small ms-auto">
          {total > 0 ? (pageStart + '–' + pageEnd + ' of ' + total) : 'No accounts'}
        </span>
      </div>

      <Table responsive size="sm" className="mb-4">
        <thead>
          <tr>
            <th>Email</th>
            <th className="text-end">Balance</th>
            <th>Created</th>
            <th>Updated</th>
            <th>Trial</th>
            <th>Actions</th>
          </tr>
        </thead>
        <tbody>
          {accounts.map(function(account) {
            const draft = drafts[account.email] || account
            const isSelected = selectedEmail === account.email
            const dirty = draftDirty(account)
            return (
              <tr
                key={accountDraftKey(account)}
                className={isSelected ? 'table-active' : ''}
              >
                <td>
                  <Form.Control
                    size="sm"
                    type="email"
                    value={draft.email || ''}
                    onChange={function(e) { updateDraft(account.email, 'email', e.target.value) }}
                  />
                </td>
                <td className="text-end">
                  <Form.Control
                    size="sm"
                    type="number"
                    step="0.01"
                    min="0"
                    className="text-end"
                    value={draft.balanceCents ?? ''}
                    onChange={function(e) { updateDraft(account.email, 'balanceCents', e.target.value) }}
                  />
                </td>
                <td>{formatWhen(account.createdAt)}</td>
                <td>{formatWhen(account.updatedAt)}</td>
                <td>{account.trialGranted ? 'Yes' : 'No'}</td>
                <td>
                  <div className="d-flex flex-wrap gap-1">
                    <Button
                      variant={isSelected ? 'primary' : 'outline-secondary'}
                      size="sm"
                      onClick={function() { setSelectedEmail(account.email) }}
                    >
                      Transactions
                    </Button>
                    <Button
                      variant="outline-primary"
                      size="sm"
                      disabled={!dirty || savingEmail === account.email}
                      onClick={function() { handleSave(account) }}
                    >
                      {savingEmail === account.email ? 'Saving…' : 'Save'}
                    </Button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>

      <div className="d-flex gap-2 mb-4">
        <Button
          variant="outline-secondary"
          size="sm"
          disabled={offset <= 0 || loading}
          onClick={function() { setOffset(Math.max(0, offset - PAGE_SIZE)) }}
        >
          Previous
        </Button>
        <Button
          variant="outline-secondary"
          size="sm"
          disabled={offset + PAGE_SIZE >= total || loading}
          onClick={function() { setOffset(offset + PAGE_SIZE) }}
        >
          Next
        </Button>
      </div>

      {selectedEmail ? (
        <div>
          <div className="d-flex flex-wrap align-items-center gap-2 mb-2">
            <h3 className="h5 mb-0">Transactions: {selectedEmail}</h3>
            <Button
              variant="outline-secondary"
              size="sm"
              disabled={ledgerLoading}
              onClick={function() { loadLedger(selectedEmail) }}
            >
              Refresh
            </Button>
            {ledgerLoading ? <Spinner animation="border" size="sm" /> : null}
          </div>
          {ledgerEntries.length > 0 ? (
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
                {ledgerEntries.map(function(entry) {
                  return (
                    <tr key={entry.id}>
                      <td>{formatWhen(entry.created_at)}</td>
                      <td>{entry.entry_type || ''}</td>
                      <td>{entry.usage_type || ''}</td>
                      <td className="text-end">{formatLedgerDeltaMillicents(entry.delta_millicents)}</td>
                      <td className="text-end">
                        {formatLedgerDeltaMillicents(entry.balance_after_millicents).replace('+', '')}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          ) : (
            <p className="app-text-muted mb-0">
              {ledgerLoading ? 'Loading transactions…' : 'No transactions for this account.'}
            </p>
          )}
        </div>
      ) : (
        <p className="app-text-muted mb-0">Click Transactions on an account to view its history.</p>
      )}
    </div>
  )
}
