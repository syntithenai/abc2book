import { Button } from 'react-bootstrap'
import { buildGoogleLoginSummary } from '../googleLoginStatus'

function toneClass(tone) {
  if (tone === 'ok') return ' is-connected'
  if (tone === 'warn') return ' is-warn'
  if (tone === 'pending') return ' is-pending'
  return ' is-unavailable'
}

export default function GoogleAuthStatusSection({
  user,
  token,
  authMode,
  authBase,
  authBaseChecked,
  resolverStatus,
  login,
  logout,
  refresh,
  requestGoogleScopes,
}) {
  var status = buildGoogleLoginSummary({
    user: user,
    token: token,
    authMode: authMode,
    authBase: authBase,
    authBaseChecked: authBaseChecked,
    resolverStatus: resolverStatus,
  })

  function runAction(action) {
    if (action.label === 'Refresh token now' && typeof refresh === 'function') {
      refresh()
      return
    }
    if (action.label.indexOf('Sign out') === 0 && typeof logout === 'function' && typeof login === 'function') {
      // Start logout, then open Google sign-in on this click so the GIS popup
      // is not treated as blocked. Do not wait for network logout to finish.
      Promise.resolve(logout()).catch(function() {})
      login()
      return
    }
    if (action.label === 'Log in with Google' && typeof login === 'function') {
      login()
    }
  }

  return (
    <div className="app-surface-panel App-settings-section App-providers-auth-status">
      <h2>Google sign-in</h2>
      <p className={'App-providers-auth-headline App-providers-status-pill' + toneClass(status.tone)}>
        {status.headline}
      </p>
      <p className="app-text-muted App-providers-auth-summary">
        {status.summary}
      </p>
      <p className="app-text-muted App-providers-auth-silent">
        <strong>Silent refresh:</strong> {status.silentRefreshLabel}
        {status.oauthBffHost ? (
          <span className="app-text-muted"> · via <code>{status.oauthBffHost}</code></span>
        ) : null}
      </p>
      {status.actions.length > 0 ? (
        <div className="App-providers-auth-actions">
          <p className="app-text-muted App-providers-auth-actions-title">
            {status.silentRefresh ? 'If renewal stops working:' : 'To restore silent refresh:'}
          </p>
          <ul className="App-providers-auth-action-list">
            {status.actions.map(function(action) {
              return (
                <li key={action.label}>
                  <button
                    type="button"
                    className="App-providers-auth-action-link"
                    onClick={function() { runAction(action) }}
                  >
                    {action.label}
                  </button>
                  {action.description ? (
                    <span className="app-text-muted"> — {action.description}</span>
                  ) : null}
                </li>
              )
            })}
          </ul>
        </div>
      ) : null}
      <div className="App-settings-actions">
        {status.signedIn ? (
          <>
            {typeof refresh === 'function' ? (
              <Button variant="outline-secondary" size="sm" onClick={function() { refresh() }}>
                Refresh token now
              </Button>
            ) : null}
            {typeof logout === 'function' ? (
              <Button variant="outline-danger" size="sm" onClick={function() { logout() }}>
                Sign out
              </Button>
            ) : null}
          </>
        ) : typeof login === 'function' ? (
          <Button variant="primary" size="sm" onClick={login}>
            Log in with Google
          </Button>
        ) : null}
      </div>
    </div>
  )
}
