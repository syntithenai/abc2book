import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom'
import { Button, ButtonGroup, Form, Nav } from 'react-bootstrap'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useDocumentTitle } from '../pageTitle'
import { toast } from 'react-toastify'
import {
  formatBytes,
  getAllMediaCacheStats,
} from '../mediaCacheStorage'
import { getLockedTuneIdSet } from '../mediaCacheLock'
import MediaCacheTunesModal from '../components/MediaCacheTunesModal'
import BackgroundJobsSettingsSection from '../components/backgroundJobs/BackgroundJobsSettingsSection'
import {
  DEFAULT_PUBLIC_MEDIA_PROXY,
  getSavedMediaProxyBase,
  normalizeMediaProxyBase,
  notifyMediaProxySettingsChanged,
  setSavedMediaProxyBase,
} from '../mediaProxyConfig'
import { describeResolverAuthReason } from '../mediaProxyClient'
import { OFFLINE_MESSAGE, isNavigatorOffline } from '../offlineNetwork'
import { clearUserData } from '../clearUserData'
import useMediaResolverHealth from '../useMediaResolverHealth'
import FormFieldHelp from '../components/FormFieldHelp'
import { SETTINGS_FIELD_HELP } from '../formFieldHelpText'
import ProvidersSettingsSection from '../components/ProvidersSettingsSection'
import BackupSettingsSection from '../components/BackupSettingsSection'
import ClearMyDataConfirmModal from '../components/ClearMyDataConfirmModal'
import SourcesSettingsSection from '../components/SourcesSettingsSection'
import DuplicateManagerSettingsSection from '../components/DuplicateManagerSettingsSection'
import CleanupSettingsSection from '../components/CleanupSettingsSection'
import LibraryScaleSettingsSection from '../components/LibraryScaleSettingsSection'
import BookTaxonomySettingsSection from '../components/BookTaxonomySettingsSection'
import { isMusicCollectionSettingsAvailable } from '../musicCollectionAdminClient'
import { isBillingAdminAvailable } from '../creditAdminClient'
import { isMusicGenerationAdmin } from '../musicGenerationAdmin'
import MusicCollectionSettingsSection from '../components/MusicCollectionSettingsSection'
import BillingAdminSettingsSection from '../components/BillingAdminSettingsSection'
import VoiceSettingsSection from '../components/VoiceSettingsSection'
import {
  AUDIO_COMPRESS_FORMAT_OPTIONS,
  loadAudioCompressSettings,
  saveAudioCompressSettings,
} from '../audioCompressSettings'
import {
  loadMediaCacheDriveBackupSettings,
  saveMediaCacheDriveBackupSettings,
} from '../mediaCacheDriveBackupSettings'
import {
  loadOfflineMediaSettings,
  saveOfflineMediaSettings,
} from '../offlineMediaSettings'
import { icons } from '../Icons'
import {
  CACHED_MEDIA_BACKUP_CHANGED_EVENT,
  getMediaCacheDriveBackupStatus,
  syncOutstandingCachedMediaBackup,
} from '../mediaCacheDriveBackup'
import {
  coerceAudioCompressFormat,
  getAudioCompressCapabilities,
} from '../audioCompressEncode'
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
import {
  DEFAULT_MAX_ENTRIES,
  loadConfiguredMaxEntries,
  MAX_ENTRIES_HARD_CAP,
  saveConfiguredMaxEntries,
} from '../tuneEditHistory'
import {
  LIBRARY_TAB_LIBRARY,
  TAB_BACKGROUND_JOBS,
  TAB_BACKUP,
  TAB_BILLING_ADMIN,
  TAB_CLEANUP,
  TAB_DUPLICATES,
  TAB_LIBRARY,
  TAB_MEDIA,
  TAB_PERSONALISATION,
  TAB_PROVIDERS,
  TAB_SOURCES,
  buildSettingsPath,
  isTopLevelSettingsTab,
  legacySettingsRedirect,
  parseSettingsSplat,
} from '../settingsPageTabs'

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
    let suffix = reason || 'not available to this account'
    if (candidate.musicCollectionAccess) {
      suffix += '; music collection allowed'
    }
    if (candidate.resolverAccess === false && candidate.authReason === 'resolver_access_denied') {
      suffix = 'resolver access denied' + (candidate.musicCollectionAccess ? '; music collection allowed' : '')
    }
    return candidate.base + ' — reachable, ' + suffix
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
  useDocumentTitle('Settings')
  const navigate = useNavigate()
  const location = useLocation()
  const [searchParams] = useSearchParams()
  const splat = String(location.pathname || '').replace(/^\/settings\/?/, '').replace(/\/$/, '')
  const parsed = parseSettingsSplat(splat)
  const activeTab = parsed.tab
  const libraryTab = parsed.libraryTab
  const tunebook = props.tunebook
  const token = props.token
  const accessToken = token && token.access_token ? token.access_token : null
  const tunes = props.tunes || {}
  const tunesHash = props.tunesHash || {}
  const deletedTunes = props.deletedTunes || {}
  const totalTuneCount = Object.keys(tunes).length
  const [mediaProxyUrl, setMediaProxyUrl] = useState(getSavedMediaProxyBase())
  const [audioCompressSettings, setAudioCompressSettings] = useState(loadAudioCompressSettings())
  const [audioCompressCapabilities, setAudioCompressCapabilities] = useState(null)
  const [performanceBindings, setPerformanceBindingsState] = useState(getPerformanceBindings())
  const [colorScheme, setColorSchemeState] = useState(getColorScheme())
  const [undoHistoryMaxEntries, setUndoHistoryMaxEntries] = useState(loadConfiguredMaxEntries())
  const [recordingAction, setRecordingAction] = useState(null)
  const [mergeCheckBusy, setMergeCheckBusy] = useState(false)
  const pendingMergeCheckAfterLoginRef = useRef(false)
  const [cacheStats, setCacheStats] = useState(null)
  const [cacheStatsLoading, setCacheStatsLoading] = useState(true)
  const [showMediaCacheTunes, setShowMediaCacheTunes] = useState(false)
  const [driveBackupCachedMedia, setDriveBackupCachedMedia] = useState(function() {
    return loadMediaCacheDriveBackupSettings().driveBackupCachedMedia
  })
  const [cachePlayedMedia, setCachePlayedMedia] = useState(function() {
    return loadOfflineMediaSettings().autocacheOnPlay
  })
  const [driveBackupStatus, setDriveBackupStatus] = useState(getMediaCacheDriveBackupStatus)
  const { status: resolverStatus, checked, authBase, authBaseChecked, refreshMediaResolverHealth } = useMediaResolverHealth()
  const showMusicCollectionTab = checked
    && isMusicCollectionSettingsAvailable(resolverStatus)
    && isMusicGenerationAdmin(props.user)
  const showDuplicatesTab = isMusicGenerationAdmin(props.user)
  const showCleanupTab = isMusicGenerationAdmin(props.user)
  const showBillingAdminTab = checked && isBillingAdminAvailable(resolverStatus, props.user)
  const [showClearMyData, setShowClearMyData] = useState(false)
  const [clearMyDataBusy, setClearMyDataBusy] = useState(false)
  const [resolverMessage, setResolverMessage] = useState('Checking resolvers...')

  useEffect(function() {
    if (accessToken) {
      refreshMediaResolverHealth(accessToken)
    }
  }, [accessToken, refreshMediaResolverHealth])
  const mediaProxyUrlSkipDebounceRef = useRef(true)

  useEffect(function() {
    function onBackupChanged() {
      setDriveBackupCachedMedia(loadMediaCacheDriveBackupSettings().driveBackupCachedMedia)
      setDriveBackupStatus(getMediaCacheDriveBackupStatus())
    }
    window.addEventListener(CACHED_MEDIA_BACKUP_CHANGED_EVENT, onBackupChanged)
    window.addEventListener('mediaCacheDriveBackupSettingsChanged', onBackupChanged)
    return function() {
      window.removeEventListener(CACHED_MEDIA_BACKUP_CHANGED_EVENT, onBackupChanged)
      window.removeEventListener('mediaCacheDriveBackupSettingsChanged', onBackupChanged)
    }
  }, [])

  useEffect(function() {
    if (mediaProxyUrlSkipDebounceRef.current) {
      mediaProxyUrlSkipDebounceRef.current = false
      return undefined
    }
    const timeoutId = setTimeout(function() {
      const trimmed = mediaProxyUrl.trim()
      const normalized = normalizeMediaProxyBase(mediaProxyUrl)
      if (trimmed && !normalized) {
        setResolverMessage('Enter a valid http:// or https:// URL')
        return
      }
      if (normalized === getSavedMediaProxyBase()) return
      setSavedMediaProxyBase(normalized)
      if (mediaProxyUrl !== normalized) setMediaProxyUrl(normalized)
      notifyMediaProxySettingsChanged()
    }, 500)
    return function() { clearTimeout(timeoutId) }
  }, [mediaProxyUrl])

  const refreshCacheStats = useCallback(function() {
    setCacheStatsLoading(true)
    const lockedTuneIds = getLockedTuneIdSet(tunes)
    return getAllMediaCacheStats({ lockedTuneIds: lockedTuneIds }).then(function(stats) {
      setCacheStats(stats)
      setCacheStatsLoading(false)
      return stats
    }).catch(function() {
      setCacheStatsLoading(false)
      return null
    })
  }, [tunes])

  useEffect(function() {
    refreshCacheStats()
  }, [refreshCacheStats])

  useEffect(function() {
    let cancelled = false
    getAudioCompressCapabilities().then(function(capabilities) {
      if (cancelled) return
      setAudioCompressCapabilities(capabilities)
      const current = loadAudioCompressSettings()
      const coerced = coerceAudioCompressFormat(current.format, capabilities)
      if (coerced !== current.format) {
        setAudioCompressSettings(saveAudioCompressSettings({ format: coerced }))
      }
    })
    return function() { cancelled = true }
  }, [])

  useEffect(function() {
    setResolverMessage(getResolverMessage(resolverStatus, checked))
  }, [resolverStatus, checked])

  useEffect(function() {
    const creditFlag = searchParams.get('credit')
    const checkoutFlag = searchParams.get('checkout')
    if (creditFlag === 'success' || checkoutFlag === 'success') {
      navigate('/billing/success' + (searchParams.get('session_id')
        ? ('?session_id=' + encodeURIComponent(searchParams.get('session_id')))
        : ''), { replace: true })
      return undefined
    }
    if (creditFlag === 'cancel' || checkoutFlag === 'cancel') {
      navigate('/billing/cancel', { replace: true })
      return undefined
    }
    if (activeTab === TAB_PROVIDERS && creditFlag === '1') {
      const timerId = setTimeout(function() {
        window.dispatchEvent(new CustomEvent('tunebook-open-credit-settings'))
      }, 100)
      return function() { clearTimeout(timerId) }
    }
    return undefined
  }, [activeTab, searchParams, navigate])

  function refreshResolverStatus() {
    setResolverMessage('Checking resolvers...')
    return refreshMediaResolverHealth()
  }

  function clearMediaProxy() {
    setSavedMediaProxyBase('')
    setMediaProxyUrl('')
    notifyMediaProxySettingsChanged()
  }

  function updateAudioCompressFormat(format) {
    if (audioCompressCapabilities && !audioCompressCapabilities[format]) {
      return
    }
    const next = saveAudioCompressSettings({ format: format })
    setAudioCompressSettings(next)
  }

  function compressAudioCommentary() {
    if (!audioCompressCapabilities) {
      return 'Checking which formats this browser supports…'
    }
    if (!audioCompressCapabilities.aac) {
      return 'Compressed AAC is not available in this browser, so only WAV and MP3 are offered.'
    }
    return ''
  }

  useEffect(function() {
    if (!recordingAction) return undefined
    function onKeyDown(event) {
      event.preventDefault()
      event.stopPropagation()
      const labels = []
      if (event.key) labels.push(event.key)
      if (event.code && event.code !== event.key) labels.push(event.code)
      const key = labels.find(function(label) {
        return label && label !== 'Shift' && label !== 'Control' && label !== 'Alt' && label !== 'Meta'
      })
      if (!key) return
      const next = setPerformanceBindingKeys(recordingAction, labels.filter(function(label) {
        return label && label !== 'Shift' && label !== 'Control' && label !== 'Alt' && label !== 'Meta'
      }))
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

  function handleUndoHistoryMaxChange(event) {
    const raw = event && event.target ? event.target.value : ''
    const parsed = parseInt(raw, 10)
    const next = isFinite(parsed) && parsed >= 1
      ? saveConfiguredMaxEntries(parsed)
      : saveConfiguredMaxEntries(DEFAULT_MAX_ENTRIES)
    setUndoHistoryMaxEntries(next)
    toast.info('Undo history depth saved. Reload the page for the new limit to apply.')
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
        toast.success('Removed ' + removed + ' cache entr' + (removed === 1 ? 'y' : 'ies') + ' (' + remaining + ' remaining).')
      }
      refreshCacheStats()
    }).catch(function() {
      toast.error('Could not clean up cache.')
    })
  }

  async function runMergeCheckNow() {
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

  async function handleCheckMergeNow() {
    if (isNavigatorOffline()) {
      toast.info(OFFLINE_MESSAGE)
      return
    }
    if (!props.token || !props.token.access_token) {
      if (typeof props.login === 'function') {
        pendingMergeCheckAfterLoginRef.current = true
        props.login()
        return
      }
      toast.warning('Log in with Google to check Drive and source URL updates.')
      return
    }
    await runMergeCheckNow()
  }

  async function handleConfirmClearMyData() {
    setClearMyDataBusy(true)
    try {
      const result = await clearUserData({
        tunebook: tunebook,
        token: token,
        driveApi: props.driveApi,
        updateSheet: props.updateSheet,
        flushTunesPersistence: props.flushTunesPersistence,
        isLoggedIn: !!(token && token.access_token),
      })
      setShowClearMyData(false)
      if (result && result.pendingDriveClear) {
        toast.success('Local data cleared. Google Drive will be wiped the next time you are signed in online.')
      } else {
        toast.success('Your data has been cleared.')
      }
      navigate('/books')
    } catch (e) {
      console.log('clear my data failed', e)
      toast.error((e && e.message) || 'Could not clear data.')
    } finally {
      setClearMyDataBusy(false)
    }
  }

  useEffect(function() {
    if (!pendingMergeCheckAfterLoginRef.current) return
    if (!props.token || !props.token.access_token) return
    pendingMergeCheckAfterLoginRef.current = false
    // Defer so App/SyncSourcesHost can re-register merge handlers with the new token.
    var timeoutId = setTimeout(function() {
      runMergeCheckNow()
    }, 0)
    return function() { clearTimeout(timeoutId) }
  }, [props.token])

  const compressCommentary = compressAudioCommentary()
  const keptSearch = new URLSearchParams()
  if (activeTab === TAB_PROVIDERS && searchParams.get('credit') === '1') {
    keptSearch.set('credit', '1')
  }
  if (activeTab === TAB_BACKGROUND_JOBS && searchParams.get('jobsTab')) {
    keptSearch.set('jobsTab', searchParams.get('jobsTab'))
  }
  const billingOutcome = searchParams.get('credit') === 'success'
    || searchParams.get('credit') === 'cancel'
    || searchParams.get('checkout') === 'success'
    || searchParams.get('checkout') === 'cancel'
  const legacyPath = legacySettingsRedirect(splat, searchParams)
  if (legacyPath) {
    return <Navigate to={legacyPath} replace />
  }
  if (!isTopLevelSettingsTab(activeTab)) {
    return <Navigate to={buildSettingsPath(TAB_BACKGROUND_JOBS)} replace />
  }
  if (activeTab === TAB_BILLING_ADMIN && checked && !showBillingAdminTab) {
    return <Navigate to={buildSettingsPath(TAB_BACKGROUND_JOBS)} replace />
  }
  if (activeTab === TAB_LIBRARY && libraryTab === TAB_CLEANUP && !showCleanupTab) {
    return <Navigate to={buildSettingsPath(TAB_LIBRARY, LIBRARY_TAB_LIBRARY)} replace />
  }
  if (activeTab === TAB_LIBRARY && libraryTab === TAB_DUPLICATES && !showDuplicatesTab) {
    return <Navigate to={buildSettingsPath(TAB_LIBRARY, LIBRARY_TAB_LIBRARY)} replace />
  }
  if (!billingOutcome) {
    const canonicalPath = buildSettingsPath(activeTab, libraryTab, keptSearch)
    const currentPath = '/settings' + (splat ? '/' + splat : '')
    const currentSearch = searchParams.toString()
    const canonicalSearch = keptSearch.toString()
    if (currentPath !== canonicalPath.split('?')[0] || currentSearch !== canonicalSearch) {
      return <Navigate to={canonicalPath} replace />
    }
  }

  return <>
  <div className="App-settings">
    <div className="App-settings-toolbar">
      <h1 style={{ margin: 0, flex: '1 1 auto' }}>Settings</h1>
      <Button
        variant="outline-danger"
        onClick={function() { setShowClearMyData(true) }}
        title="Permanently delete your songbook and related data"
      >
        Clear my data
      </Button>
    </div>

    <ClearMyDataConfirmModal
      show={showClearMyData}
      busy={clearMyDataBusy}
      signedIn={!!(token && token.access_token)}
      online={!isNavigatorOffline()}
      onCancel={function() { if (!clearMyDataBusy) setShowClearMyData(false) }}
      onConfirm={handleConfirmClearMyData}
    />

    <Nav variant="tabs" className="App-settings-tabs">
      <Nav.Item>
        <Nav.Link as={Link} to={buildSettingsPath(TAB_BACKGROUND_JOBS)} active={activeTab === TAB_BACKGROUND_JOBS}>
          Background jobs
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link as={Link} to={buildSettingsPath(TAB_PERSONALISATION)} active={activeTab === TAB_PERSONALISATION}>
          Personalisation
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link as={Link} to={buildSettingsPath(TAB_PROVIDERS)} active={activeTab === TAB_PROVIDERS}>
          Providers
        </Nav.Link>
      </Nav.Item>
      <Nav.Item>
        <Nav.Link as={Link} to={buildSettingsPath(TAB_LIBRARY, LIBRARY_TAB_LIBRARY)} active={activeTab === TAB_LIBRARY}>
          Library
        </Nav.Link>
      </Nav.Item>
      {showBillingAdminTab ? (
        <Nav.Item>
          <Nav.Link as={Link} to={buildSettingsPath(TAB_BILLING_ADMIN)} active={activeTab === TAB_BILLING_ADMIN}>
            Billing admin
          </Nav.Link>
        </Nav.Item>
      ) : null}
    </Nav>

    <div className="App-settings-tab-content">
        {activeTab === TAB_BACKGROUND_JOBS ? (
          <>
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
          <BackgroundJobsSettingsSection
            tunes={tunes}
            mediaController={props.mediaController}
            initialJobsTab={searchParams.get('jobsTab')}
            user={props.user}
            token={token}
            driveApi={props.driveApi}
          />
          </>
        ) : null}

        {activeTab === TAB_PERSONALISATION ? (
          <>
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
            <h2>
              Undo history
              <FormFieldHelp title={SETTINGS_FIELD_HELP.undoHistoryDepth.title} body={SETTINGS_FIELD_HELP.undoHistoryDepth.body} />
            </h2>
            <p className="app-text-muted" style={{ marginBottom: '0.75rem' }}>
              Steps kept per tune on this device (default {DEFAULT_MAX_ENTRIES}, max {MAX_ENTRIES_HARD_CAP}). Each step stores full tune snapshots in browser storage.
            </p>
            <Form.Group controlId="settings-undo-history-max" style={{ maxWidth: '12rem' }}>
              <Form.Label className="visually-hidden">Undo history depth</Form.Label>
              <Form.Control
                type="number"
                min={1}
                max={MAX_ENTRIES_HARD_CAP}
                value={undoHistoryMaxEntries}
                onChange={handleUndoHistoryMaxChange}
              />
            </Form.Group>
          </div>
          <VoiceSettingsSection accessToken={accessToken} />
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
                Scroll step ({Math.round((performanceBindings.scrollStepFraction || 1) * 100)}% of viewport)
              </Form.Label>
              <Form.Range
                id="performance-scroll-step"
                min={0.2}
                max={1}
                step={0.05}
                value={performanceBindings.scrollStepFraction || 1}
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
          </>
        ) : null}

        {activeTab === TAB_PROVIDERS ? (
          <ProvidersSettingsSection
            resolverStatus={resolverStatus}
            mediaProxyUrl={mediaProxyUrl}
            setMediaProxyUrl={setMediaProxyUrl}
            clearMediaProxy={clearMediaProxy}
            refreshResolverStatus={refreshResolverStatus}
            resolverMessage={resolverMessage}
            accessToken={accessToken}
            formatCandidateStatus={formatCandidateStatus}
            login={props.login}
            logout={props.logout}
            refresh={props.refresh}
            requestGoogleScopes={props.requestGoogleScopes}
            user={props.user}
            token={props.token}
            authMode={props.authMode}
            authBase={authBase}
            authBaseChecked={authBaseChecked}
          />
        ) : null}

        {activeTab === TAB_LIBRARY ? (
          <>
            <Nav variant="tabs" className="App-settings-nested-tabs">
              <Nav.Item>
                <Nav.Link as={Link} to={buildSettingsPath(TAB_LIBRARY, LIBRARY_TAB_LIBRARY)} active={libraryTab === LIBRARY_TAB_LIBRARY}>
                  Library
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link as={Link} to={buildSettingsPath(TAB_LIBRARY, TAB_BACKUP)} active={libraryTab === TAB_BACKUP}>
                  Backup
                </Nav.Link>
              </Nav.Item>
              {showCleanupTab ? (
                <Nav.Item>
                  <Nav.Link as={Link} to={buildSettingsPath(TAB_LIBRARY, TAB_CLEANUP)} active={libraryTab === TAB_CLEANUP}>
                    Cleanup
                  </Nav.Link>
                </Nav.Item>
              ) : null}
              {showDuplicatesTab ? (
                <Nav.Item>
                  <Nav.Link as={Link} to={buildSettingsPath(TAB_LIBRARY, TAB_DUPLICATES)} active={libraryTab === TAB_DUPLICATES}>
                    Duplicates
                  </Nav.Link>
                </Nav.Item>
              ) : null}
              <Nav.Item>
                <Nav.Link as={Link} to={buildSettingsPath(TAB_LIBRARY, TAB_MEDIA)} active={libraryTab === TAB_MEDIA}>
                  Media
                </Nav.Link>
              </Nav.Item>
              <Nav.Item>
                <Nav.Link as={Link} to={buildSettingsPath(TAB_LIBRARY, TAB_SOURCES)} active={libraryTab === TAB_SOURCES}>
                  Sources
                </Nav.Link>
              </Nav.Item>
            </Nav>
            {libraryTab === LIBRARY_TAB_LIBRARY ? (
              <>
                <LibraryScaleSettingsSection
                  tunes={tunes}
                  indexes={props.indexes}
                  tunesContentRevision={props.tunesContentRevision}
                  forceRefresh={props.forceRefresh}
                />
                <BookTaxonomySettingsSection
                  tunes={tunes}
                  tunebook={tunebook}
                  indexes={props.indexes}
                  token={token}
                  user={props.user}
                  forceRefresh={props.forceRefresh}
                />
              </>
            ) : null}
            {libraryTab === TAB_BACKUP ? (
              <BackupSettingsSection
                tunebook={tunebook}
                tunes={tunes}
                token={token}
                login={props.login}
                googleDocumentId={props.googleDocumentId}
                overrideTuneBook={props.overrideTuneBook}
                forceRefresh={props.forceRefresh}
                navigate={navigate}
              />
            ) : null}
            {showCleanupTab && libraryTab === TAB_CLEANUP ? (
              <CleanupSettingsSection
                tunes={tunes}
                tunebook={tunebook}
                indexes={props.indexes}
                currentTuneBook={props.currentTuneBook}
                forceRefresh={props.forceRefresh}
              />
            ) : null}
            {showDuplicatesTab && libraryTab === TAB_DUPLICATES ? (
              <DuplicateManagerSettingsSection
                tunes={tunes}
                tunesHash={tunesHash}
                tunebook={tunebook}
                indexes={props.indexes}
                currentTuneBook={props.currentTuneBook}
              />
            ) : null}
            {libraryTab === TAB_MEDIA ? (
              <>
                <div className="app-surface-panel App-settings-section">
                  <h2>
                    Compress Audio
                    <FormFieldHelp
                      title={SETTINGS_FIELD_HELP.compressAudio.title}
                      body={SETTINGS_FIELD_HELP.compressAudio.body}
                    />
                  </h2>
                  <ButtonGroup className="settings-compress-audio-buttons" aria-label="Compress Audio format">
                    {AUDIO_COMPRESS_FORMAT_OPTIONS.map(function(option) {
                      const available = !audioCompressCapabilities || !!audioCompressCapabilities[option.value]
                      const selected = audioCompressSettings.format === option.value
                      return (
                        <Button
                          key={option.value}
                          variant={selected ? 'primary' : 'outline-primary'}
                          disabled={!available}
                          title={!available ? option.label + ' is not available in this browser' : undefined}
                          onClick={function() { updateAudioCompressFormat(option.value) }}
                        >
                          {option.label}
                        </Button>
                      )
                    })}
                  </ButtonGroup>
                  {compressCommentary ? (
                    <p className="app-text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                      {compressCommentary}
                    </p>
                  ) : null}
                </div>
                <div className="app-surface-panel App-settings-section">
                  <div className="settings-offline-media-row">
                    <span className="settings-offline-media-heading">Cache</span>
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
                                <span className="settings-cache-stats-label">
                                  {cache.label}
                                  {cache.id === 'audio' ? (
                                    <Button
                                      type="button"
                                      variant="outline-secondary"
                                      size="sm"
                                      className="settings-cache-file-info-btn"
                                      onClick={function() { setShowMediaCacheTunes(true) }}
                                      title="Show tunes with media cache"
                                      aria-label="Show tunes with media cache"
                                    >
                                      {icons.info}
                                    </Button>
                                  ) : null}
                                </span>
                                <span className="settings-cache-stats-value">
                                  {formatBytes(cache.bytes)}
                                  <span className="settings-cache-stats-meta">
                                    {' · '}{cache.entries} entr{cache.entries === 1 ? 'y' : 'ies'}
                                    {cache.id === 'audio' && cache.lockedEntries > 0 ? (
                                      <>
                                        {' · '}{cache.lockedEntries} locked ({formatBytes(cache.lockedBytes)})
                                      </>
                                    ) : null}
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
                          {(cacheStats.audio && cacheStats.audio.tuneCount) || 0} of {totalTuneCount} tune{totalTuneCount === 1 ? '' : 's'} have downloaded cache
                          {(cacheStats.audio && cacheStats.audio.entries)
                            ? ' (' + cacheStats.audio.entries + ' cached link' + (cacheStats.audio.entries === 1 ? '' : 's') + ')'
                            : ''}
                          .
                        </p>
                      </>
                    ) : (
                      <p className="app-text-muted">Could not measure cache storage.</p>
                    )}
                  </div>
                  <Form.Group className="mb-3">
                    <Form.Check
                      type="switch"
                      id="cache-played-media"
                      label="Cache played media"
                      checked={cachePlayedMedia}
                      onChange={function(e) {
                        const enabled = e.target.checked
                        saveOfflineMediaSettings({ autocacheOnPlay: enabled })
                        setCachePlayedMedia(enabled)
                      }}
                    />
                    <Form.Check
                      type="switch"
                      id="drive-backup-cached-media"
                      label="Back up cached media to Google Drive"
                      checked={driveBackupCachedMedia}
                      onChange={function(e) {
                        const enabled = e.target.checked
                        saveMediaCacheDriveBackupSettings({ driveBackupCachedMedia: enabled })
                        setDriveBackupCachedMedia(enabled)
                        setDriveBackupStatus(getMediaCacheDriveBackupStatus())
                        if (enabled && token && token.access_token && props.driveApi) {
                          syncOutstandingCachedMediaBackup({
                            token: token,
                            driveApi: props.driveApi,
                          }).catch(function() {})
                        }
                      }}
                    />
                    <p className="app-text-muted settings-cache-details-text">
                      {!accessToken
                        ? 'Log in with Google to sync cached media to Drive.'
                        : driveBackupStatus.syncing
                          ? 'Syncing cached media with Google Drive…'
                          : driveBackupStatus.lastError
                            ? driveBackupStatus.lastError
                            : (driveBackupStatus.backedUpCount
                              ? driveBackupStatus.backedUpCount + ' file' + (driveBackupStatus.backedUpCount === 1 ? '' : 's') + ' backed up on Drive.'
                              : 'When on, downloaded File Cache (not stems or MIDI) is copied to your Drive.')}
                    </p>
                  </Form.Group>
                  <div className="App-settings-actions">
                    <Button
                      variant="info"
                      onClick={handleCleanupHalfAudioCache}
                      title="Clear the oldest cached half of the cache"
                    >
                      Cleanup Cache
                    </Button>
                    <Button
                      variant="warning"
                      onClick={function() {
                        handleClearCache(tunebook.utils.clearDownloadedAudioCache, 'Downloaded cache cleared.')
                      }}
                    >
                      Clear Cache
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
              </>
            ) : null}
            {libraryTab === TAB_SOURCES ? (
              <>
                <SourcesSettingsSection
                  tunes={tunes}
                  token={token}
                  login={props.login}
                  googleDocumentId={props.googleDocumentId}
                  onCheckMergeNow={handleCheckMergeNow}
                  mergeCheckBusy={mergeCheckBusy}
                />
                {showMusicCollectionTab ? (
                  <MusicCollectionSettingsSection accessToken={accessToken} />
                ) : null}
              </>
            ) : null}
          </>
        ) : null}

        {activeTab === TAB_BILLING_ADMIN && showBillingAdminTab ? (
          <BillingAdminSettingsSection
            accessToken={accessToken}
            billingEnabled={!!(resolverStatus && resolverStatus.billingEnabled)}
          />
        ) : null}
    </div>
  </div>
  <MediaCacheTunesModal
    show={showMediaCacheTunes}
    onHide={function() { setShowMediaCacheTunes(false) }}
    tunebook={tunebook}
    tunes={tunes}
    deletedTunes={deletedTunes}
    token={token}
    driveApi={props.driveApi}
    saveTune={tunebook && tunebook.saveTune ? tunebook.saveTune.bind(tunebook) : null}
    login={props.login}
    forceRefresh={props.forceRefresh}
    onCacheChanged={refreshCacheStats}
  />
  </>
}
