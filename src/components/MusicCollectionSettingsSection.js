import { useCallback, useEffect, useRef, useState } from 'react'
import { Alert, Button, Spinner } from 'react-bootstrap'
import useMediaResolverHealth from '../useMediaResolverHealth'
import { resolverHasFeature } from '../resolverFeatures'
import {
  fetchMusicCollectionStats,
  getMusicCollectionStatusFromHealth,
  rebuildMusicCollectionIndex,
} from '../musicCollectionAdminClient'

function formatPercent(value) {
  if (typeof value !== 'number' || Number.isNaN(value)) return '—'
  return value.toFixed(1) + '%'
}

function formatTopList(items, limit) {
  if (!Array.isArray(items) || items.length === 0) return '—'
  return items.slice(0, limit).map(function(item) {
    return item.value + ' (' + item.count + ')'
  }).join(', ')
}

function formatBuiltAt(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString()
}

function isBuildActive(progress, buildRunning) {
  if (buildRunning) return true
  if (!progress || !progress.phase) return false
  return progress.phase === 'starting' || progress.phase === 'scanning' || progress.phase === 'writing'
}

export default function MusicCollectionSettingsSection(props) {
  const accessToken = props.accessToken || null
  const { status, checked, refreshMediaResolverHealth } = useMediaResolverHealth()
  const [busy, setBusy] = useState(false)
  const [statsBusy, setStatsBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [summary, setSummary] = useState(function() {
    return getMusicCollectionStatusFromHealth(status)
  })
  const [collectionStats, setCollectionStats] = useState(null)
  const [progress, setProgress] = useState(null)
  const [buildRunning, setBuildRunning] = useState(false)
  const [recentErrors, setRecentErrors] = useState([])
  const pollRef = useRef(null)

  const featureAvailable = checked
    && !!(status && status.available)
    && resolverHasFeature(status, 'musicCollection')

  const loadStats = useCallback(async function() {
    if (!accessToken || !featureAvailable) return null
    setStatsBusy(true)
    try {
      const result = await fetchMusicCollectionStats({ accessToken: accessToken })
      setCollectionStats(result.stats || null)
      setProgress(result.progress || null)
      setBuildRunning(!!result.buildRunning)
      setRecentErrors(result.recentErrors || [])
      if (result.summary) {
        setSummary(function(prev) {
          return Object.assign({}, prev, { summary: result.summary, builtAt: result.builtAt })
        })
      }
      return result
    } catch (e) {
      setError(e && e.message ? e.message : 'Could not load collection stats')
      return null
    } finally {
      setStatsBusy(false)
    }
  }, [accessToken, featureAvailable])

  useEffect(function() {
    setSummary(getMusicCollectionStatusFromHealth(status))
  }, [status])

  useEffect(function() {
    if (featureAvailable) {
      loadStats()
    }
  }, [featureAvailable, loadStats])

  useEffect(function() {
    if (!featureAvailable) return undefined
    const active = isBuildActive(progress, buildRunning)
    if (!active) {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
      return undefined
    }
    if (!pollRef.current) {
      pollRef.current = setInterval(function() {
        loadStats()
      }, 5000)
    }
    return function() {
      if (pollRef.current) {
        clearInterval(pollRef.current)
        pollRef.current = null
      }
    }
  }, [featureAvailable, progress, buildRunning, loadStats])

  if (!featureAvailable) {
    return null
  }

  const healthSummary = summary.summary || {}
  const metadata = (collectionStats && collectionStats.metadata) || {}
  const playback = (collectionStats && collectionStats.playback) || {}
  const duplicates = (collectionStats && collectionStats.duplicates) || {}
  const exactDupes = duplicates.exact || {}
  const metadataDupes = duplicates.metadata || {}
  const buildActive = isBuildActive(progress, buildRunning)

  async function handleRebuild() {
    if (!accessToken) {
      setError('Log in with Google to rebuild the music collection index.')
      return
    }
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const result = await rebuildMusicCollectionIndex({
        accessToken: accessToken,
        extractArt: false,
        background: true,
      })
      if (result.started) {
        setMessage('Index rebuild started in background.')
        setBuildRunning(true)
      } else {
        setMessage('Index rebuilt: ' + result.count + ' track' + (result.count === 1 ? '' : 's') + '.')
      }
      await refreshMediaResolverHealth(accessToken)
      await loadStats()
    } catch (e) {
      setError(e && e.message ? e.message : 'Rebuild failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-surface-panel App-settings-section">
      <h2>Music collection</h2>
      <p className="app-text-muted">
        Personal audio library hosted on your connected resolver. Tunebook searches this collection before YouTube when adding links.
      </p>

      {buildActive ? (
        <Alert variant="info" className="mt-3">
          Index build in progress: {progress && progress.processed ? progress.processed : 0}
          {progress && progress.total ? ' / ' + progress.total : ''} files scanned.
          {progress && typeof progress.errors === 'number' ? ' · ' + progress.errors + ' errors' : ''}
          {progress && typeof progress.skipped === 'number' && progress.skipped > 0
            ? ' · ' + progress.skipped + ' skipped (resume)'
            : ''}
          {progress && typeof progress.etaSeconds === 'number'
            ? ' · ~' + Math.max(1, Math.round(progress.etaSeconds / 60)) + ' min remaining'
            : ''}
        </Alert>
      ) : null}

      {progress && progress.phase === 'failed' ? (
        <Alert variant="danger" className="mt-3">
          Index build failed{progress.error ? ': ' + progress.error : '.'}
        </Alert>
      ) : null}

      <ul className="settings-cache-stats-list">
        <li>
          <span className="settings-cache-stats-label">Indexed tracks</span>
          <span className="settings-cache-stats-value">{summary.count}</span>
        </li>
        <li>
          <span className="settings-cache-stats-label">Last built</span>
          <span className="settings-cache-stats-value">{formatBuiltAt(summary.builtAt)}</span>
        </li>
        {summary.dir ? (
          <li>
            <span className="settings-cache-stats-label">Library folder</span>
            <span className="settings-cache-stats-value settings-music-collection-path">{summary.dir}</span>
          </li>
        ) : null}
        {summary.indexPath ? (
          <li>
            <span className="settings-cache-stats-label">Index file</span>
            <span className="settings-cache-stats-value settings-music-collection-path">{summary.indexPath}</span>
          </li>
        ) : null}
      </ul>

      {collectionStats ? (
        <>
          <h3 className="h5 mt-4">Metadata coverage</h3>
          <ul className="settings-cache-stats-list">
            <li>
              <span className="settings-cache-stats-label">Tagged title</span>
              <span className="settings-cache-stats-value">
                {metadata.taggedTitle || 0} ({formatPercent(healthSummary.taggedTitlePct)})
              </span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Tagged artist</span>
              <span className="settings-cache-stats-value">
                {metadata.taggedArtist || 0} ({formatPercent(healthSummary.taggedArtistPct)})
              </span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Tagged album</span>
              <span className="settings-cache-stats-value">{metadata.taggedAlbum || 0}</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Tagged genre</span>
              <span className="settings-cache-stats-value">{metadata.taggedGenre || 0}</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">With album art</span>
              <span className="settings-cache-stats-value">{metadata.withArt || 0}</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Core metadata complete</span>
              <span className="settings-cache-stats-value">{metadata.completeCore || 0}</span>
            </li>
            {typeof collectionStats.readErrors === 'number' ? (
              <li>
                <span className="settings-cache-stats-label">Read errors (last build)</span>
                <span className="settings-cache-stats-value">{collectionStats.readErrors}</span>
              </li>
            ) : null}
          </ul>

          <h3 className="h5 mt-4">Playback &amp; history</h3>
          <ul className="settings-cache-stats-list">
            <li>
              <span className="settings-cache-stats-label">Tracks with play count tags</span>
              <span className="settings-cache-stats-value">{playback.withPlayCount || 0}</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Tracks with last-played tags</span>
              <span className="settings-cache-stats-value">{playback.withLastPlayed || 0}</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Total tagged plays</span>
              <span className="settings-cache-stats-value">{playback.totalPlayCount || 0}</span>
            </li>
          </ul>

          <h3 className="h5 mt-4">Duplication</h3>
          <ul className="settings-cache-stats-list">
            <li>
              <span className="settings-cache-stats-label">Exact file duplicates</span>
              <span className="settings-cache-stats-value">{exactDupes.extraCopies || 0} extra copies</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Title/artist/duration duplicates</span>
              <span className="settings-cache-stats-value">{metadataDupes.extraCopies || 0} extra copies</span>
            </li>
          </ul>

          <h3 className="h5 mt-4">Widely used tags</h3>
          <ul className="settings-cache-stats-list">
            <li>
              <span className="settings-cache-stats-label">Top genres</span>
              <span className="settings-cache-stats-value">{formatTopList(collectionStats.genres, 8)}</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Top artists</span>
              <span className="settings-cache-stats-value">{formatTopList(collectionStats.artists, 6)}</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Top folders</span>
              <span className="settings-cache-stats-value">{formatTopList(collectionStats.categories, 8)}</span>
            </li>
            <li>
              <span className="settings-cache-stats-label">Formats</span>
              <span className="settings-cache-stats-value">{formatTopList(collectionStats.formats, 8)}</span>
            </li>
          </ul>
        </>
      ) : null}

      {recentErrors.length > 0 ? (
        <>
          <h3 className="h5 mt-4">Recent index errors</h3>
          <ul className="settings-cache-stats-list">
            {recentErrors.slice(-5).map(function(item, idx) {
              return (
                <li key={idx}>
                  <span className="settings-cache-stats-label">{item.stage || 'error'}</span>
                  <span className="settings-cache-stats-value settings-music-collection-path">
                    {(item.path || '') + (item.message ? ' — ' + item.message : '')}
                  </span>
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {error ? <Alert variant="danger" className="mt-3 mb-0">{error}</Alert> : null}
      {message ? <Alert variant="success" className="mt-3 mb-0">{message}</Alert> : null}

      <div className="App-settings-actions">
        <Button variant="primary" disabled={busy || buildActive} onClick={handleRebuild}>
          {busy ? (
            <>
              <Spinner animation="border" size="sm" className="me-2" aria-hidden="true" />
              Starting rebuild…
            </>
          ) : buildActive ? 'Rebuild running…' : 'Rebuild index'}
        </Button>
        <Button
          variant="outline-secondary"
          disabled={busy || statsBusy}
          onClick={function() {
            refreshMediaResolverHealth(accessToken)
            loadStats()
          }}
        >
          {statsBusy ? 'Refreshing…' : 'Refresh summary'}
        </Button>
      </div>
      <p className="app-text-muted small mt-3 mb-0">
        Rebuild runs in the background with per-file timeouts and error isolation. Bad files are logged and skipped without stopping the build.
      </p>
    </div>
  )
}
