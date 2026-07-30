import { useCallback, useEffect, useState } from 'react'
import { Button } from 'react-bootstrap'
import {
  getAndroidLocalAudioStats,
  openAndroidAudioPermissionSettings,
  requestAndroidAudioPermission,
} from '../androidLocalMediaSearchClient'
import { isAndroidApp } from '../platformUtils'

function formatScanTime(value) {
  if (!value) return '—'
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return '—'
  return date.toLocaleString()
}

export default function AndroidLocalMediaSettingsSection() {
  const [busy, setBusy] = useState(false)
  const [stats, setStats] = useState({ granted: false, trackCount: 0, lastScanAt: 0 })

  const refreshStats = useCallback(async function() {
    if (!isAndroidApp()) return
    setBusy(true)
    try {
      const next = await getAndroidLocalAudioStats()
      setStats(next || { granted: false, trackCount: 0, lastScanAt: 0 })
    } finally {
      setBusy(false)
    }
  }, [])

  useEffect(function() {
    refreshStats()
  }, [refreshStats])

  if (!isAndroidApp()) return null

  async function handleRequestPermission() {
    setBusy(true)
    try {
      await requestAndroidAudioPermission()
      await refreshStats()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="app-surface-panel App-settings-section">
      <h2>Device audio library</h2>
      <p className="app-text-muted">
        Search your phone&apos;s music library alongside tunebook results on the main search page.
        Grant audio access to include device tracks when you type a search query.
      </p>
      <p className="app-text-muted">
        Permission: {stats.granted ? 'granted' : 'not granted'}
        {' · '}
        Tracks indexed: {stats.trackCount || 0}
        {' · '}
        Last scan: {formatScanTime(stats.lastScanAt)}
      </p>
      <div className="App-settings-actions" style={{ marginTop: '0.75rem' }}>
        <Button variant="outline-secondary" disabled={busy} onClick={handleRequestPermission}>
          {stats.granted ? 'Refresh library stats' : 'Grant audio access'}
        </Button>
        <Button variant="outline-secondary" disabled={busy} onClick={refreshStats}>
          Scan now
        </Button>
        <Button variant="outline-secondary" disabled={busy} onClick={openAndroidAudioPermissionSettings}>
          Open permission settings
        </Button>
      </div>
    </div>
  )
}
