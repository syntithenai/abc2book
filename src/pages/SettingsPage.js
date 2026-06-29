import { useNavigate } from 'react-router-dom'
import { Button } from 'react-bootstrap'
import { useEffect, useState } from 'react'
import {
  DEFAULT_PUBLIC_MEDIA_PROXY,
  getSavedMediaProxyBase,
  normalizeMediaProxyBase,
  notifyMediaProxySettingsChanged,
  setSavedMediaProxyBase,
} from '../mediaProxyConfig'
import { describeResolverAuthReason } from '../mediaProxyClient'
import useMediaResolverHealth from '../useMediaResolverHealth'

function formatCandidateStatus(candidate, activeBase) {
  if (!candidate.reachable) {
    if (candidate.mixedContent) {
      return candidate.base + ' — blocked: this page is HTTPS but the resolver is HTTP. Use an https:// resolver URL.'
    }
    return candidate.base + ' — not reachable'
  }
  if (candidate.available) {
    const inUse = activeBase && candidate.base === activeBase ? ' (in use)' : ''
    return candidate.base + ' — available' + inUse
  }
  if (candidate.requireAuth) {
    const reason = describeResolverAuthReason(candidate.authReason)
    return candidate.base + ' — reachable, ' + (reason || 'not available to this account')
  }
  return candidate.base + ' — reachable, not available'
}

function getResolverMessage(status, checked) {
  if (!checked || !status) {
    return 'Checking resolvers...'
  }
  if (status.available && status.activeBase) {
    return 'Using ' + status.activeBase
  }
  if (status.candidates.some(function(candidate) { return candidate.reachable })) {
    return 'Resolver reachable but not available to this account. Log in with an authorized Google account or use a local resolver.'
  }
  if (status.candidates.some(function(candidate) { return candidate.mixedContent })) {
    return 'No resolver available. An HTTPS page cannot reach an HTTP resolver — use an https:// resolver URL (e.g. ' + DEFAULT_PUBLIC_MEDIA_PROXY + ').'
  }
  return 'No resolver available'
}

export default function SettingsPage(props) {
  const navigate = useNavigate()
  const tunebook = props.tunebook
  const token = props.token
  const accessToken = token && token.access_token ? token.access_token : null
  const [mediaProxyUrl, setMediaProxyUrl] = useState(getSavedMediaProxyBase())
  const { status: resolverStatus, checked, refreshMediaResolverHealth } = useMediaResolverHealth()
  const [resolverMessage, setResolverMessage] = useState('Checking resolvers...')

  useEffect(function() {
    setResolverMessage(getResolverMessage(resolverStatus, checked))
  }, [resolverStatus, checked])

  function refreshResolverStatus() {
    setResolverMessage('Checking resolvers...')
    return refreshMediaResolverHealth()
  }

  function saveMediaProxy() {
    const normalized = normalizeMediaProxyBase(mediaProxyUrl)
    if (mediaProxyUrl.trim() && !normalized) {
      setResolverMessage('Enter a valid http:// or https:// URL')
      return
    }
    setSavedMediaProxyBase(normalized)
    setMediaProxyUrl(normalized)
    notifyMediaProxySettingsChanged()
  }

  function clearMediaProxy() {
    setSavedMediaProxyBase('')
    setMediaProxyUrl('')
    notifyMediaProxySettingsChanged()
  }

  return <div style={{ marginLeft: '0.3em' }} className="App-settings">
    <h1>Settings</h1>
    <br />
    <Button variant="success" title="Download" style={{ color: 'white', float: 'right' }} onClick={function() { props.tunebook.downloadTuneBookAbc() }}>
      {props.tunebook.icons.save} Download Tunebook
    </Button>

    <Button style={{ marginRight: '0.5em', marginBottom: '1em', position: 'relative', top: '2px' }} variant="danger" onClick={function() {
      if (props.token) {
        if (window.confirm('Are you REALLY sure you want to delete all of your tunes from this device and all other devices? Logout if you only want to reset this device')) {
          if (window.confirm('Are you REALLY sure you want to delete all of your tunes on all your devices?')) {
            tunebook.deleteAll()
            navigate('/books')
          }
        }
      } else if (window.confirm('Are you sure you want to delete all of your tunes on this device? Login to delete tunes from all your devices.')) {
        if (window.confirm('Are you REALLY sure you want to delete all of your tunes from this device?')) {
          tunebook.deleteAll()
          navigate('/books')
        }
      }
    }}>Delete All Tunes</Button><br />

    <hr style={{ margin: '1em' }} />

    <Button style={{ marginRight: '0.5em', marginBottom: '1em', position: 'relative', top: '2px' }} variant="warning" onClick={tunebook.utils.resetAudioCache}>Clear Audio Cache</Button><br />

    <hr style={{ margin: '1em' }} />

    <div>
      <h2 style={{ fontSize: '1.2em' }}>Media resolver / proxy</h2>
      <p>
        Optional base URL for pitch/tempo playback, lyrics transcription, and chord discovery.
        Leave blank to try localhost, then shared public resolvers.
      </p>
      <label htmlFor="media-proxy-url" style={{ fontWeight: 'bold' }}>Resolver URL</label>
      <br />
      <input
        id="media-proxy-url"
        type="url"
        value={mediaProxyUrl}
        placeholder={DEFAULT_PUBLIC_MEDIA_PROXY}
        onChange={function(e) { setMediaProxyUrl(e.target.value) }}
        style={{ width: 'min(100%, 32em)', marginTop: '0.4em' }}
      />
      <br />
      <Button style={{ marginTop: '0.6em', marginRight: '0.5em' }} variant="primary" onClick={saveMediaProxy}>Save resolver</Button>
      <Button style={{ marginTop: '0.6em', marginRight: '0.5em' }} variant="outline-secondary" onClick={clearMediaProxy}>Use defaults</Button>
      <Button style={{ marginTop: '0.6em' }} variant="outline-secondary" onClick={refreshResolverStatus}>Refresh status</Button>
      <br />
      <i style={{ display: 'block', marginTop: '0.6em' }}>
        Order when blank: http://localhost:8787, then {DEFAULT_PUBLIC_MEDIA_PROXY}
      </i>
      <div style={{ marginTop: '0.6em' }}>
        <strong>{resolverMessage}</strong>
      </div>
      {resolverStatus && resolverStatus.candidates.length > 0 && (
        <ul style={{ marginTop: '0.6em', paddingLeft: '1.2em' }}>
          {resolverStatus.candidates.map(function(candidate) {
            return (
              <li key={candidate.base}>
                {formatCandidateStatus(candidate, resolverStatus.activeBase)}
              </li>
            )
          })}
        </ul>
      )}
      {!accessToken && (
        <div style={{ marginTop: '0.6em' }}>
          <i>Log in with Google if the shared resolver requires an authorized account.</i>
        </div>
      )}
    </div>
  </div>
}
