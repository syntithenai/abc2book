import { useCallback, useEffect, useState } from 'react'
import { Alert, Button, Form, Spinner } from 'react-bootstrap'
import { getRepositoryTuneCount } from '../tuneRepository'
import { rebuildIndexesFromTunes } from '../tuneIndexRebuilder'
import { migrateMonolithToCatalog, getCatalogCount, getMigrationStatus } from '../tuneCatalogStore'
import {
  isCatalogStorageEnabled,
  setCatalogStorageEnabled,
  isShardedSyncEnabled,
  setShardedSyncEnabled,
  getSchemaVersion,
} from '../tuneStorageFlags'
import { LARGE_LIST_WARNING_THRESHOLD, CURRENT_SCHEMA_VERSION } from '../tuneScaleConstants'
import { rebuildTextSearchIndexFromTunes } from '../tuneTextSearchIndex'
import { yieldToMain } from '../tuneListFilter'

export default function LibraryScaleSettingsSection(props) {
  const tunes = props.tunes || {}
  const indexes = props.indexes
  const [tuneCount, setTuneCount] = useState(0)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [useCatalog, setUseCatalog] = useState(isCatalogStorageEnabled())
  const [useShardedSync, setUseShardedSync] = useState(isShardedSyncEnabled())
  const [migrationStatus, setMigrationStatus] = useState('none')

  const refreshStats = useCallback(async function() {
    const count = await getRepositoryTuneCount()
    setTuneCount(count || Object.keys(tunes).length)
    setMigrationStatus(await getMigrationStatus())
  }, [tunes])

  useEffect(function() {
    refreshStats()
  }, [refreshStats, props.tunesContentRevision])

  async function handleRebuildIndexes() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await rebuildIndexesFromTunes(tunes, {
        onProgress: function(done, total) {
          setMessage('Rebuilding indexes… ' + done + ' / ' + total)
        },
        yieldToMain: yieldToMain,
      })
      if (indexes && indexes.reloadFromStore) await indexes.reloadFromStore()
      await rebuildTextSearchIndexFromTunes(tunes)
      setMessage('Indexes rebuilt.')
    } catch (e) {
      setError(e && e.message ? e.message : 'Rebuild failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleMigrateCatalog() {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      await migrateMonolithToCatalog(tunes, {
        onProgress: function(done, total) {
          setMessage('Migrating to catalog storage… ' + done + ' / ' + total)
        },
        yieldToMain: yieldToMain,
      })
      setCatalogStorageEnabled(true)
      setUseCatalog(true)
      setMessage('Catalog migration complete. Enable catalog mode to use paged storage.')
      await refreshStats()
    } catch (e) {
      setError(e && e.message ? e.message : 'Migration failed')
    } finally {
      setBusy(false)
    }
  }

  function handleCatalogToggle(e) {
    const next = !!e.target.checked
    setUseCatalog(next)
    setCatalogStorageEnabled(next)
    setMessage(next ? 'Catalog storage enabled.' : 'Catalog storage disabled (using monolith).')
  }

  function handleShardedSyncToggle(e) {
    const next = !!e.target.checked
    setUseShardedSync(next)
    setShardedSyncEnabled(next)
    setMessage(next ? 'Sharded sync enabled.' : 'Sharded sync disabled.')
  }

  const largeLibrary = tuneCount > LARGE_LIST_WARNING_THRESHOLD

  return (
    <div className="app-surface-panel App-settings-section">
      <h2>Large library</h2>
      <p className="app-text-muted">
        Tools for tunebooks with thousands of entries. Schema version {getSchemaVersion()} (target {CURRENT_SCHEMA_VERSION}).
      </p>

      {error ? <Alert variant="danger" onClose={function() { setError('') }} dismissible>{error}</Alert> : null}
      {message ? <Alert variant="info" onClose={function() { setMessage('') }} dismissible>{message}</Alert> : null}

      <dl className="row mb-3">
        <dt className="col-sm-4">Tunes in library</dt>
        <dd className="col-sm-8">{tuneCount}</dd>
        <dt className="col-sm-4">Catalog migration</dt>
        <dd className="col-sm-8">{migrationStatus}</dd>
        {largeLibrary ? (
          <>
            <dt className="col-sm-4">Recommendation</dt>
            <dd className="col-sm-8">Use books under ~20k tunes each; filter by book for best performance.</dd>
          </>
        ) : null}
      </dl>

      <div className="d-flex flex-wrap gap-2 mb-3">
        <Button variant="outline-primary" size="sm" disabled={busy} onClick={handleRebuildIndexes}>
          {busy ? <Spinner animation="border" size="sm" className="me-1" /> : null}
          Rebuild indexes
        </Button>
        <Button variant="outline-secondary" size="sm" disabled={busy} onClick={handleMigrateCatalog}>
          Migrate to catalog storage
        </Button>
        <Button variant="outline-secondary" size="sm" disabled={busy} onClick={refreshStats}>
          Refresh stats
        </Button>
      </div>

      <Form.Check
        type="switch"
        id="library-use-catalog"
        className="mb-2"
        label="Use catalog storage (paged list, lazy tune bodies)"
        checked={useCatalog}
        onChange={handleCatalogToggle}
      />
      <Form.Check
        type="switch"
        id="library-use-sharded-sync"
        label="Use sharded ABC sync (large libraries)"
        checked={useShardedSync}
        onChange={handleShardedSyncToggle}
      />
    </div>
  )
}
