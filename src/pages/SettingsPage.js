import { useNavigate } from 'react-router-dom'
import { Button, Form } from 'react-bootstrap'
import { useCallback, useEffect, useState } from 'react'
import { toast } from 'react-toastify'
import {
  formatBytes,
  getAllMediaCacheStats,
} from '../mediaCacheStorage'
import { countMediaCacheLockedTunes, getLockedTuneIdSet } from '../mediaCacheLock'
import MediaCacheTunesModal from '../components/MediaCacheTunesModal'
import BackgroundJobsSettingsSection from '../components/backgroundJobs/BackgroundJobsSettingsSection'
import {
  DEFAULT_PUBLIC_MEDIA_PROXY,
  getLocalMediaProxyCandidates,
  getSavedMediaProxyBase,
  normalizeMediaProxyBase,
  notifyMediaProxySettingsChanged,
  setSavedMediaProxyBase,
} from '../mediaProxyConfig'
import { describeResolverAuthReason } from '../mediaProxyClient'
import useMediaResolverHealth from '../useMediaResolverHealth'
import FormFieldHelp from '../components/FormFieldHelp'
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText'
import {
  loadOfflineMediaSettings,
  saveOfflineMediaSettings,
} from '../offlineMediaSettings'
import {
  getPerformanceBindings,
  resetPerformanceBindings,
  setPerformanceBindingKeys,
  setPerformanceBindings,
} from '../performanceKeyBindings'
import {
  COLOR_SCHEMES,
  getColorScheme,
  setColorScheme,
} from '../colorSchemeSettings'
import { runMergeChecksNow } from '../mergeCheckTrigger'

function formatFeatureSummary(features) {
  if (!features) return ''
  const labels = []
  if (features.proxy) labels.push('proxy')
  if (features.stems) labels.push('stems')
  if (features.whisper) labels.push('whisper')
  if (features.llm) labels.push('llm')
  return labels.length > 0 ? ' · features: ' + labels.join(', ') : ' · no optional features enabled'
}

function formatCandidateStatus(candidate, activeBase) {
  if (!candidate.reachable) {
    if (candidate.mixedContent) {
      return candidate.base + ' — blocked: this page is HTTPS but the resolver is HTTP. Use an https:// resolver URL.'
    }
    return candidate.base + ' — not reachable'
  }
  if (candidate.available) {
    const inUse = activeBase && candidate.base === activeBase ? ' (in use)' : ''
    return candidate.base + ' — available' + inUse + formatFeatureSummary(candidate.features)
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
    return 'Using ' + status.activeBase + formatFeatureSummary(status.features)
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
  const tunes = props.tunes || {}
  const deletedTunes = props.deletedTunes || {}
  const totalTuneCount = Object.keys(tunes).length
  const lockedCacheTuneCount = countMediaCacheLockedTunes(tunes)
  const [mediaProxyUrl, setMediaProxyUrl] = useState(getSavedMediaProxyBase())
  const [offlineMediaSettings, setOfflineMediaSettings] = useState(loadOfflineMediaSettings())
  const [performanceBindings, setPerformanceBindingsState] = useState(getPerformanceBindings())
  const [colorScheme, setColorSchemeState] = useState(getColorScheme())
  const [recordingAction, setRecordingAction] = useState(null)
  const [mergeCheckBusy, setMergeCheckBusy] = useState(false)
  const [cacheStats, setCacheStats] = useState(null)
  const [cacheStatsLoading, setCacheStatsLoading] = useState(true)
  const [showMediaCacheTunes, setShowMediaCacheTunes] = useState(false)
  const { status: resolverStatus, checked, features, refreshMediaResolverHealth } = useMediaResolverHealth()
  const [resolverMessage, setResolverMessage] = useState('Checking resolvers...')

  const refreshCacheStats = useCallback(function() {
    setCacheStatsLoading(true)
    return getAllMediaCacheStats().then(function(stats) {
      setCacheStats(stats)
      setCacheStatsLoading(false)
      return stats
    }).catch(function() {
      setCacheStatsLoading(false)
      return null
    })
  }, [])

  useEffect(function() {
    refreshCacheStats()
  }, [refreshCacheStats])

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

  function updateOfflineMediaSetting(key, checked) {
    const next = saveOfflineMediaSettings(Object.assign({}, offlineMediaSettings, {
      [key]: checked,
    }))
    setOfflineMediaSettings(next)
  }

  useEffect(function() {
    if (!recordingAction) return undefined
    function onKeyDown(event) {
      event.preventDefault()
      event.stopPropagation()
      const key = event.key
      if (!key || key === 'Shift' || key === 'Control' || key === 'Alt' || key === 'Meta') return
      const next = setPerformanceBindingKeys(recordingAction, [key])
      setPerformanceBindingsState(next)
      setRecordingAction(null)
    }
    window.addEventListener('keydown', onKeyDown, true)
    return function() {
      window.removeEventListener('keydown', onKeyDown, true)
    }
  }, [recordingAction])

  function updateScrollStepFraction(value) {
    const fraction = parseFloat(value)
    if (!Number.isFinite(fraction)) return
    const next = setPerformanceBindings(Object.assign({}, performanceBindings, {
      scrollStepFraction: Math.min(1, Math.max(0.2, fraction)),
    }))
    setPerformanceBindingsState(next)
  }

  function handleColorSchemeChange(schemeId) {
    const next = setColorScheme(schemeId)
    setColorSchemeState(next)
  }

  function handleClearCache(clearFn, successMessage) {
    const lockedTuneIds = getLockedTuneIdSet(tunes)
    Promise.resolve(clearFn(lockedTuneIds)).then(function() {
      toast.success(successMessage)
      refreshCacheStats()
    }).catch(function() {
      toast.error('Could not clear cache.')
    })
  }

  function handleCleanupHalfAudioCache() {
    const lockedTuneIds = getLockedTuneIdSet(tunes)
    Promise.resolve(tunebook.utils.cleanupHalfDownloadedAudioCache(lockedTuneIds)).then(function(result) {
      const removed = result && result.removed != null ? result.removed : 0
      const remaining = result && result.remaining != null ? result.remaining : 0
      if (removed > 0) {
        toast.success('Removed ' + removed + ' audio cache entr' + (removed === 1 ? 'y' : 'ies') + ' (' + remaining + ' remaining).')
      }
      refreshCacheStats()
    }).catch(function() {
      toast.error('Could not clean up audio cache.')
    })
  }

  async function handleCheckMergeNow() {
    if (!props.token || !props.token.access_token) {
      toast.warning('Log in with Google to check Drive and source URL updates.')
      return
    }
    setMergeCheckBusy(true)
    try {
      const checkFn = typeof props.onCheckMergeNow === 'function' ? props.onCheckMergeNow : runMergeChecksNow
      const ran = await checkFn()
      if (!ran) {
        toast.warning('Merge check is not available right now.')
      }
    } catch (e) {
      toast.error(e.message || 'Merge check failed.')
    } finally {
      setMergeCheckBusy(false)
    }
  }

  return <>
  <div className="App-settings">
    <div className="App-settings-toolbar">
      <h1 style={{ margin: 0, flex: '1 1 auto' }}>Settings</h1>
      <Button variant="success" title="Download" onClick={function() { props.tunebook.downloadTuneBookAbc() }}>
        {props.tunebook.icons.save} Download Tunebook
      </Button>
      <Button variant="danger" onClick={function() {
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
    }}>Delete All Tunes</Button>
    </div>

    <div className="app-surface-panel App-settings-section">
      <h2>
        Appearance
        <FormFieldHelp title={SETTINGS_FIELD_HELP.colorScheme.title} body={SETTINGS_FIELD_HELP.colorScheme.body} />
      </h2>
      <p className="app-text-muted" style={{ marginBottom: 0 }}>
        Pick an accent color for buttons, links, and highlights. Night mode uses a dark background with light text.
      </p>
      <div className="App-settings-color-schemes" role="radiogroup" aria-label="Color scheme">
        {COLOR_SCHEMES.map(function(scheme) {
          const selected = colorScheme === scheme.id
          return (
            <button
              key={scheme.id}
              type="button"
              role="radio"
              aria-checked={selected}
              className={'App-settings-color-scheme-option' + (selected ? ' is-selected' : '')}
              onClick={function() { handleColorSchemeChange(scheme.id) }}
            >
              <span
                className="App-settings-color-scheme-swatch"
                style={{ background: scheme.swatchColor }}
                aria-hidden="true"
              />
              <span className="App-settings-color-scheme-label">{scheme.label}</span>
              <span className="App-settings-color-scheme-description">{scheme.description}</span>
            </button>
          )
        })}
      </div>
    </div>

    <div className="app-surface-panel App-settings-section">
      <h2>Sync &amp; merge</h2>
      <p className="app-text-muted">
        Check Google Drive and source URLs for updates now instead of waiting for the next automatic poll.
      </p>
      <div className="App-settings-actions">
        <Button variant="primary" disabled={mergeCheckBusy} onClick={handleCheckMergeNow}>
          {mergeCheckBusy ? 'Checking…' : 'Check for updates now'}
        </Button>
      </div>
    </div>

    <div className="app-surface-panel App-settings-section">
      <h2>Media resolver / proxy</h2>
      <p className="app-text-muted">
        Optional base URL for pitch/tempo playback, lyrics transcription, and chord discovery.
        Leave blank to try localhost, then shared public resolvers.
      </p>
      <Form.Group className="mb-2">
        <Form.Label htmlFor="media-proxy-url">
          Resolver URL
          <FormFieldHelp title={SETTINGS_FIELD_HELP.resolverUrl.title} body={SETTINGS_FIELD_HELP.resolverUrl.body} />
        </Form.Label>
        <Form.Control
          id="media-proxy-url"
          type="url"
          value={mediaProxyUrl}
          placeholder={DEFAULT_PUBLIC_MEDIA_PROXY}
          onChange={function(e) { setMediaProxyUrl(e.target.value) }}
        />
      </Form.Group>
      <div className="App-settings-actions">
        <Button variant="primary" onClick={saveMediaProxy}>Save resolver</Button>
        <Button variant="outline-secondary" onClick={clearMediaProxy}>Use defaults</Button>
        <Button variant="outline-secondary" onClick={refreshResolverStatus}>Refresh status</Button>
      </div>
      <p className="app-text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
        Order when blank: {getLocalMediaProxyCandidates()[0]}, then {DEFAULT_PUBLIC_MEDIA_PROXY}
      </p>
      <div className="App-settings-resolver-status">
        <strong>{resolverMessage}</strong>
      </div>
      {resolverStatus && resolverStatus.candidates.length > 0 && (
        <ul className="App-settings-resolver-list">
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
        <p className="app-text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
          Log in with Google if the shared resolver requires an authorized account.
        </p>
      )}
    </div>

    <div className="app-surface-panel App-settings-section">
      <div className="settings-offline-media-row">
        <span className="settings-offline-media-heading">Audio Cache</span>
        <input
          id="offline-autocache-on-play"
          type="checkbox"
          className="settings-offline-media-check-input"
          checked={offlineMediaSettings.autocacheOnPlay}
          onChange={function(e) { updateOfflineMediaSetting('autocacheOnPlay', e.target.checked) }}
        />
        <label htmlFor="offline-autocache-on-play" className="settings-offline-media-label">
          Automatically cache media after playback starts
        </label>
        <FormFieldHelp
          title={SETTINGS_FIELD_HELP.offlineMedia.title}
          body={SETTINGS_FIELD_HELP.offlineMedia.body}
        />
      </div>
      <div className="settings-cache-stats" aria-live="polite">
        {cacheStatsLoading && !cacheStats ? (
          <p className="app-text-muted settings-cache-stats-loading">Measuring cache storage…</p>
        ) : cacheStats ? (
          <>
            <ul className="settings-cache-stats-list">
              {cacheStats.caches.map(function(cache) {
                return (
                  <li key={cache.id}>
                    <span className="settings-cache-stats-label">{cache.label}</span>
                    <span className="settings-cache-stats-value">
                      {formatBytes(cache.bytes)}
                      <span className="settings-cache-stats-meta">
                        {' · '}{cache.entries} entr{cache.entries === 1 ? 'y' : 'ies'}
                      </span>
                    </span>
                  </li>
                )
              })}
              <li className="settings-cache-stats-total">
                <span className="settings-cache-stats-label">Total</span>
                <span className="settings-cache-stats-value">{formatBytes(cacheStats.totalBytes)}</span>
              </li>
            </ul>
            <p className="settings-cache-details-text">
              {(cacheStats.audio && cacheStats.audio.tuneCount) || 0} of {totalTuneCount} tune{totalTuneCount === 1 ? '' : 's'} have downloaded audio cache
              {(cacheStats.audio && cacheStats.audio.entries)
                ? ' (' + cacheStats.audio.entries + ' cached link' + (cacheStats.audio.entries === 1 ? '' : 's') + ')'
                : ''}
              {lockedCacheTuneCount > 0
                ? ' · ' + lockedCacheTuneCount + ' locked'
                : ''}
              .
            </p>
            <Button
              variant="outline-secondary"
              className="settings-cache-details-toggle"
              onClick={function() { setShowMediaCacheTunes(true) }}
            >
              Show tunes with media cache
            </Button>
          </>
        ) : (
          <p className="app-text-muted">Could not measure cache storage.</p>
        )}
      </div>
      <div className="App-settings-actions">
        <Button
          variant="info"
          onClick={handleCleanupHalfAudioCache}
          title="Clear the oldest cached half of the audio cache"
        >
          Cleanup Audio Cache
        </Button>
        <Button
          variant="warning"
          onClick={function() {
            handleClearCache(tunebook.utils.clearDownloadedAudioCache, 'Downloaded audio cache cleared.')
          }}
        >
          Clear Audio Cache
        </Button>
        <Button
          variant="warning"
          onClick={function() {
            handleClearCache(tunebook.utils.clearMidiCache, 'MIDI playback cache cleared.')
          }}
        >
          Clear Midi Cache
        </Button>
        <Button
          variant="warning"
          onClick={function() {
            handleClearCache(tunebook.utils.clearStemsCache, 'Stem cache cleared.')
          }}
        >
          Clear Stems
        </Button>
      </div>
    </div>

    <BackgroundJobsSettingsSection
      tunes={tunes}
      mediaController={props.mediaController}
    />

    <div className="app-surface-panel App-settings-section">
      <h2>Foot pedal / page turn</h2>
      <p className="app-text-muted">
        Bluetooth foot pedals (AirTurn, PageFlip, etc.) usually send <strong>Page Down</strong> and <strong>Page Up</strong>.
        The pedal scrolls through the chart first; only when you reach the top or bottom does the next press go to the previous or next tune.
        Pair the pedal in your device Bluetooth settings before use.
      </p>
      <div className="mb-2">
        <strong>Scroll down key:</strong>{' '}
        {(performanceBindings.scrollDown || []).join(', ') || 'none'}
        <Button
          size="sm"
          variant="outline-primary"
          className="ms-2"
          onClick={function() { setRecordingAction('scrollDown') }}
        >
          {recordingAction === 'scrollDown' ? 'Press a key…' : 'Change'}
        </Button>
      </div>
      <div className="mb-2">
        <strong>Scroll up key:</strong>{' '}
        {(performanceBindings.scrollUp || []).join(', ') || 'none'}
        <Button
          size="sm"
          variant="outline-primary"
          className="ms-2"
          onClick={function() { setRecordingAction('scrollUp') }}
        >
          {recordingAction === 'scrollUp' ? 'Press a key…' : 'Change'}
        </Button>
      </div>
      <Form.Group className="mb-2">
        <Form.Label htmlFor="performance-scroll-step">
          Scroll step ({Math.round((performanceBindings.scrollStepFraction || 0.8) * 100)}% of viewport)
        </Form.Label>
        <Form.Range
          id="performance-scroll-step"
          min={0.2}
          max={1}
          step={0.05}
          value={performanceBindings.scrollStepFraction || 0.8}
          onChange={function(e) { updateScrollStepFraction(e.target.value) }}
        />
      </Form.Group>
      <Button
        variant="outline-secondary"
        onClick={function() {
          const next = resetPerformanceBindings()
          setPerformanceBindingsState(next)
        }}
      >
        Reset to defaults
      </Button>
    </div>
  </div>
  <MediaCacheTunesModal
    show={showMediaCacheTunes}
    onHide={function() { setShowMediaCacheTunes(false) }}
    tunebook={tunebook}
    tunes={tunes}
    deletedTunes={deletedTunes}
    token={token}
    login={props.login}
    forceRefresh={props.forceRefresh}
    onCacheChanged={refreshCacheStats}
  />
  </>
}
