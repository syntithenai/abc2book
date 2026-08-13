import { useRef, useState } from 'react'
import { Button, ListGroup, Modal, Spinner, Tab, Tabs } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { summarizeBackupDiff } from '../backupDiffSummary'
import useGoogleDocument from '../useGoogleDocument'
import DiffModal from './DiffModal'

function formatRevisionDate(modifiedTime) {
  if (!modifiedTime) return 'Unknown date'
  var date = new Date(modifiedTime)
  if (isNaN(date.getTime())) return modifiedTime
  return date.toLocaleString()
}

function formatRevisionSize(size) {
  var bytes = parseInt(size, 10)
  if (!Number.isFinite(bytes)) return null
  if (bytes < 1024) return bytes + ' B'
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
  return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
}

function revisionFileName(modifiedTime) {
  var date = modifiedTime ? new Date(modifiedTime) : new Date()
  if (isNaN(date.getTime())) date = new Date()
  var pad = function(n) { return String(n).padStart(2, '0') }
  return 'tunebook-' + date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate())
    + '-' + pad(date.getHours()) + pad(date.getMinutes()) + '.abc'
}

function countLabel(n, singular, plural) {
  return n + ' ' + (n === 1 ? singular : (plural || singular + 's'))
}

export default function BackupSettingsSection(props) {
  const tunebook = props.tunebook
  const googleDocumentId = props.googleDocumentId
  const signedIn = !!(props.token && props.token.access_token)
  const currentTuneCount = Object.keys(props.tunes || {}).length
  const driveApi = useGoogleDocument(props.token, function() {}, props.forceRefresh)

  const [revisions, setRevisions] = useState(null)
  const [loadingRevisions, setLoadingRevisions] = useState(false)
  const [busyRevisionId, setBusyRevisionId] = useState(null)
  const [busyAction, setBusyAction] = useState(null)
  const [fileBusy, setFileBusy] = useState(false)
  const [pendingRestore, setPendingRestore] = useState(null)
  const [restoring, setRestoring] = useState(false)
  const [pendingDiff, setPendingDiff] = useState(null)
  const fileInputRef = useRef(null)

  function parseTuneList(abcText) {
    if (!abcText || typeof abcText !== 'string') return null
    try {
      var parsed = tunebook.abcTools.abc2Tunebook(abcText)
      if (!Array.isArray(parsed)) return null
      return parsed.filter(function(tune) { return tune && tune.id })
    } catch (e) {
      console.log('backup parse failed', e)
      return null
    }
  }

  function loadRevisions() {
    setLoadingRevisions(true)
    driveApi.listRevisions(googleDocumentId).then(function(result) {
      setLoadingRevisions(false)
      if (!result) {
        toast.error('Could not load versions from Google Drive.')
        return
      }
      var sorted = result.slice().sort(function(a, b) {
        return String(b.modifiedTime || '').localeCompare(String(a.modifiedTime || ''))
      })
      setRevisions(sorted)
      if (sorted.length === 0) toast.info('Google Drive has no saved versions for your songbook yet.')
    })
  }

  function fetchRevisionAbc(revision) {
    return driveApi.getRevisionData(googleDocumentId, revision.id, revision.exportLinks).then(function(abcText) {
      if (!abcText || typeof abcText !== 'string') {
        toast.error('Could not fetch that version from Google Drive.')
        return null
      }
      return abcText
    })
  }

  function downloadRevision(revision) {
    setBusyRevisionId(revision.id)
    setBusyAction('download')
    fetchRevisionAbc(revision).then(function(abcText) {
      setBusyRevisionId(null)
      setBusyAction(null)
      if (!abcText) return
      tunebook.utils.download(revisionFileName(revision.modifiedTime), abcText)
    })
  }

  function requestRevisionRestore(revision) {
    setBusyRevisionId(revision.id)
    setBusyAction('restore')
    fetchRevisionAbc(revision).then(function(abcText) {
      setBusyRevisionId(null)
      setBusyAction(null)
      if (!abcText) return
      var tunes = parseTuneList(abcText)
      if (!tunes) {
        toast.error('That version could not be read as a tunebook.')
        return
      }
      setPendingRestore({
        abcText: abcText,
        tuneCount: tunes.length,
        label: 'the version from ' + formatRevisionDate(revision.modifiedTime),
      })
    })
  }

  function showRevisionChanges(revision) {
    setBusyRevisionId(revision.id)
    setBusyAction('changes')
    fetchRevisionAbc(revision).then(function(abcText) {
      setBusyRevisionId(null)
      setBusyAction(null)
      if (!abcText) return
      var versionTunes = parseTuneList(abcText)
      if (!versionTunes) {
        toast.error('That version could not be read as a tunebook.')
        return
      }
      setPendingDiff({
        label: formatRevisionDate(revision.modifiedTime),
        versionTuneCount: versionTunes.length,
        summary: summarizeBackupDiff(props.tunes, versionTunes),
        revision: revision,
      })
    })
  }

  function onRestoreFileSelected(event) {
    var file = event.target.files && event.target.files[0]
    // allow re-selecting the same file later
    event.target.value = ''
    if (!file) return
    setFileBusy(true)
    file.text().then(function(abcText) {
      setFileBusy(false)
      var tunes = parseTuneList(abcText)
      if (!tunes || tunes.length === 0) {
        toast.error('"' + file.name + '" does not look like a tunebook backup (no tunes found).')
        return
      }
      setPendingRestore({
        abcText: abcText,
        tuneCount: tunes.length,
        label: '"' + file.name + '"',
      })
    }).catch(function() {
      setFileBusy(false)
      toast.error('Could not read "' + file.name + '".')
    })
  }

  function confirmRestore() {
    if (!pendingRestore) return
    setRestoring(true)
    try {
      props.overrideTuneBook(pendingRestore.abcText)
      toast.success('Songbook restored (' + pendingRestore.tuneCount + ' tune' + (pendingRestore.tuneCount === 1 ? '' : 's') + ').')
    } catch (e) {
      console.log('restore failed', e)
      toast.error('Restore failed: ' + (e.message || 'unknown error'))
    }
    setRestoring(false)
    setPendingRestore(null)
  }

  var diffSummary = pendingDiff && pendingDiff.summary
  var recoveryCandidate = !!(pendingDiff && diffSummary
    && pendingDiff.versionTuneCount > currentTuneCount
    && (diffSummary.onlyInVersion || []).length > 0
    && (diffSummary.onlyInVersion || []).length >= Math.max(10, (diffSummary.onlyInCurrent || []).length))
  var defaultDiffTab = diffSummary
    ? ((recoveryCandidate ? ['onlyInVersion', 'changed', 'onlyInCurrent'] : ['changed', 'onlyInVersion', 'onlyInCurrent']).find(function(key) {
      return (diffSummary[key] || []).length > 0
    }) || 'changed')
    : 'changed'

  function handleDeleteAllTunes() {
    if (signedIn) {
      if (window.confirm('Are you REALLY sure you want to delete all of your tunes from this device and all other devices? Logout if you only want to reset this device')) {
        if (window.confirm('Are you REALLY sure you want to delete all of your tunes on all your devices?')) {
          tunebook.deleteAll()
          if (typeof props.navigate === 'function') props.navigate('/books')
        }
      }
    } else if (window.confirm('Are you sure you want to delete all of your tunes on this device? Login to delete tunes from all your devices.')) {
      if (window.confirm('Are you REALLY sure you want to delete all of your tunes from this device?')) {
        tunebook.deleteAll()
        if (typeof props.navigate === 'function') props.navigate('/books')
      }
    }
  }

  return <>
    <div className="app-surface-panel App-settings-section">
      <h2>Your songbook</h2>
      <p className="app-text-muted">
        Download a backup of your current songbook, or delete all tunes from this device
        {signedIn ? ' and every device where you are logged in' : ''}.
        ABC is the restore format; JSON keeps full tune data for offline analysis (e.g. chord readiness audit).
      </p>
      <div className="App-settings-actions">
        <Button variant="success" title="Download ABC backup (use for restore)" onClick={function() { tunebook.downloadTuneBookAbc() }}>
          {tunebook.icons.save} Download ABC
        </Button>
        <Button variant="outline-success" title="Download JSON for analysis tools" onClick={function() { tunebook.downloadTuneBookJson() }}>
          {tunebook.icons.stack || tunebook.icons.save} Download JSON
        </Button>
        <Button variant="danger" onClick={handleDeleteAllTunes}>
          Delete All Tunes
        </Button>
      </div>
    </div>

    <div className="app-surface-panel App-settings-section">
      <h2>Google Drive versions</h2>
      <p className="app-text-muted">
        Google Drive keeps a history of your songbook file. Restore an earlier version, or download it as a backup file.
        Drive usually keeps versions for around 30 days.
      </p>
      {!signedIn ? (
        <div className="App-settings-actions">
          <span className="app-text-muted">Log in with Google to see saved versions.</span>
          {typeof props.login === 'function' ? (
            <Button variant="primary" onClick={function() { props.login() }}>Log in with Google</Button>
          ) : null}
        </div>
      ) : !googleDocumentId ? (
        <p className="app-text-muted">
          Your songbook has not synced to Google Drive yet. Once it has synced, versions will show here.
        </p>
      ) : (
        <>
          <div className="App-settings-actions">
            <Button variant="primary" disabled={loadingRevisions} onClick={loadRevisions}>
              {loadingRevisions ? <><Spinner animation="border" size="sm" /> Loading…</> : (revisions === null ? 'Load versions' : 'Refresh versions')}
            </Button>
          </div>
          {revisions !== null && revisions.length > 0 ? (
            <>
              <p className="app-text-muted" style={{ marginTop: '0.75rem', marginBottom: 0 }}>
                Prefer a large version (megabytes) from before any sudden drop to tens of KB — that drop is usually an emptied songbook.
                Use <strong>Restore</strong> on that version to bring tunes back. <strong>Changes</strong> only compares; it does not restore.
              </p>
              <ul className="settings-backup-revision-list" style={{ listStyle: 'none', padding: 0, marginTop: '1rem', marginBottom: 0 }}>
                {revisions.map(function(revision) {
                  var sizeBytes = parseInt(revision.size, 10)
                  var size = formatRevisionSize(revision.size)
                  var looksEmptied = Number.isFinite(sizeBytes) && sizeBytes > 0 && sizeBytes < 200 * 1024
                  var looksFull = Number.isFinite(sizeBytes) && sizeBytes >= 1024 * 1024
                  var user = revision.lastModifyingUser && revision.lastModifyingUser.displayName
                  var busy = busyRevisionId === revision.id
                  return (
                    <li key={revision.id} style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', padding: '0.4rem 0', borderTop: '1px solid var(--bs-border-color, #dee2e6)' }}>
                      <span style={{ flex: '1 1 auto' }}>
                        <strong>{formatRevisionDate(revision.modifiedTime)}</strong>
                        <span className="app-text-muted">
                          {size ? ' · ' + size : ''}
                          {user ? ' · ' + user : ''}
                        </span>
                        {looksEmptied ? (
                          <span className="text-danger" style={{ display: 'block', fontSize: '0.85em' }}>
                            Looks emptied — avoid restoring this unless you intend to wipe the book
                          </span>
                        ) : null}
                        {looksFull ? (
                          <span className="text-success" style={{ display: 'block', fontSize: '0.85em' }}>
                            Full-size backup — good restore candidate
                          </span>
                        ) : null}
                      </span>
                      <Button size="sm" variant="outline-primary" disabled={busy} onClick={function() { showRevisionChanges(revision) }}>
                        {busy && busyAction === 'changes' ? 'Comparing…' : 'Changes'}
                      </Button>
                      <Button size="sm" variant="outline-secondary" disabled={busy} onClick={function() { downloadRevision(revision) }}>
                        {busy && busyAction === 'download' ? 'Working…' : 'Download'}
                      </Button>
                      <Button
                        size="sm"
                        variant={looksFull ? 'danger' : 'outline-danger'}
                        disabled={busy || looksEmptied}
                        title={looksEmptied ? 'This version looks emptied' : 'Replace current songbook with this version'}
                        onClick={function() { requestRevisionRestore(revision) }}
                      >
                        {busy && busyAction === 'restore' ? 'Working…' : 'Restore'}
                      </Button>
                    </li>
                  )
                })}
              </ul>
            </>
          ) : null}
        </>
      )}
    </div>

    <div className="app-surface-panel App-settings-section">
      <h2>Restore from file</h2>
      <p className="app-text-muted">
        Replace your songbook with an ABC backup file you downloaded earlier (via "Download ABC" or the Download button above).
        {!signedIn ? ' You are not logged in, so the restored songbook will only be saved on this device until you log in with Google.' : ''}
      </p>
      <div className="App-settings-actions">
        <Button variant="primary" disabled={fileBusy} onClick={function() {
          if (fileInputRef.current) fileInputRef.current.click()
        }}>
          {fileBusy ? 'Reading…' : 'Choose backup file'}
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".abc,.txt,text/plain"
          style={{ display: 'none' }}
          onChange={onRestoreFileSelected}
        />
      </div>
    </div>

    <Modal show={!!pendingRestore} onHide={function() { if (!restoring) setPendingRestore(null) }}>
      <Modal.Header closeButton>
        <Modal.Title>Restore songbook?</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {pendingRestore ? (
          <>
            <p>
              Restore {pendingRestore.label}? It contains <strong>{pendingRestore.tuneCount}</strong> tune{pendingRestore.tuneCount === 1 ? '' : 's'} and
              will replace your current songbook of <strong>{currentTuneCount}</strong> tune{currentTuneCount === 1 ? '' : 's'}.
            </p>
            <p className="app-text-muted">
              Not sure?{' '}
              <Button variant="link" size="sm" style={{ padding: 0, verticalAlign: 'baseline' }} onClick={function() { tunebook.downloadTuneBookAbc() }}>
                Download your current songbook first
              </Button>
              {' '}so you can get back to it.
            </p>
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" disabled={restoring} onClick={function() { setPendingRestore(null) }}>
          Cancel
        </Button>
        <Button variant="danger" disabled={restoring} onClick={confirmRestore}>
          {restoring ? 'Restoring…' : 'Restore'}
        </Button>
      </Modal.Footer>
    </Modal>

    <Modal show={!!pendingDiff} onHide={function() { setPendingDiff(null) }} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Changes vs current</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {pendingDiff && diffSummary ? (
          <>
            <p>
              Comparing the version from <strong>{pendingDiff.label}</strong>
              {' '}({countLabel(pendingDiff.versionTuneCount, 'tune')})
              {' '}to your current songbook ({countLabel(currentTuneCount, 'tune')}).
            </p>
            {recoveryCandidate ? (
              <p>
                This looks like a recovery: the Drive version has many tunes that are missing from your current songbook.
                That is expected after a wipe. Click <strong>Restore this version</strong> to bring them back — you are not
                importing duplicates into a full book.
              </p>
            ) : null}
            {diffSummary.totalChanges === 0 ? (
              <p className="app-text-muted">This version matches your current songbook.</p>
            ) : (
              <>
                <div style={{ marginBottom: '0.75rem' }}>
                  {diffSummary.changed.length ? <div><strong>{diffSummary.changed.length}</strong> tune{diffSummary.changed.length === 1 ? '' : 's'} changed</div> : null}
                  {diffSummary.onlyInVersion.length ? <div><strong>{diffSummary.onlyInVersion.length}</strong> only in this version (would be restored)</div> : null}
                  {diffSummary.onlyInCurrent.length ? <div><strong>{diffSummary.onlyInCurrent.length}</strong> only in your current songbook (would be removed on restore)</div> : null}
                </div>
                <Tabs key={defaultDiffTab} defaultActiveKey={defaultDiffTab}>
                  {diffSummary.changed.length > 0 ? (
                    <Tab eventKey="changed" title={'Changed (' + diffSummary.changed.length + ')'}>
                      <p className="app-text-muted" style={{ marginTop: '0.75rem' }}>
                        Same tune id, but content differs between this version and your current songbook.
                      </p>
                      <ListGroup>
                        {diffSummary.changed.map(function(entry, index) {
                          return (
                            <ListGroup.Item key={entry.id} className={index % 2 === 0 ? 'even' : 'odd'}>
                              <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', justifyContent: 'space-between' }}>
                                <div>
                                  <div style={{ fontWeight: 600 }}>{entry.name}</div>
                                  {entry.fields && entry.fields.length ? (
                                    <div className="app-text-muted small">{entry.fields.join(' · ')}</div>
                                  ) : null}
                                </div>
                                {entry.currentTune && entry.versionTune ? (
                                  <DiffModal
                                    label="Show Differences"
                                    original={tunebook.abcTools.json2abc(entry.versionTune)}
                                    modified={tunebook.abcTools.json2abc(entry.currentTune)}
                                  />
                                ) : null}
                              </div>
                            </ListGroup.Item>
                          )
                        })}
                      </ListGroup>
                    </Tab>
                  ) : null}
                  {diffSummary.onlyInVersion.length > 0 ? (
                    <Tab eventKey="onlyInVersion" title={'Only in version (' + diffSummary.onlyInVersion.length + ')'}>
                      <p className="app-text-muted" style={{ marginTop: '0.75rem' }}>
                        Present in this version but not in your current songbook. Restoring would bring these back.
                      </p>
                      <ListGroup>
                        {diffSummary.onlyInVersion.map(function(entry, index) {
                          return (
                            <ListGroup.Item key={entry.id} className={index % 2 === 0 ? 'even' : 'odd'}>
                              <div style={{ fontWeight: 600 }}>{entry.name}</div>
                            </ListGroup.Item>
                          )
                        })}
                      </ListGroup>
                    </Tab>
                  ) : null}
                  {diffSummary.onlyInCurrent.length > 0 ? (
                    <Tab eventKey="onlyInCurrent" title={'Only in current (' + diffSummary.onlyInCurrent.length + ')'}>
                      <p className="app-text-muted" style={{ marginTop: '0.75rem' }}>
                        In your current songbook but not in this version. Restoring would remove these.
                      </p>
                      <ListGroup>
                        {diffSummary.onlyInCurrent.map(function(entry, index) {
                          return (
                            <ListGroup.Item key={entry.id} className={index % 2 === 0 ? 'even' : 'odd'}>
                              <div style={{ fontWeight: 600 }}>{entry.name}</div>
                            </ListGroup.Item>
                          )
                        })}
                      </ListGroup>
                    </Tab>
                  ) : null}
                </Tabs>
              </>
            )}
          </>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={function() { setPendingDiff(null) }}>
          Close
        </Button>
        {recoveryCandidate && pendingDiff && pendingDiff.revision ? (
          <Button
            variant="danger"
            disabled={!!busyRevisionId}
            onClick={function() {
              var revision = pendingDiff.revision
              setPendingDiff(null)
              requestRevisionRestore(revision)
            }}
          >
            Restore this version
          </Button>
        ) : null}
      </Modal.Footer>
    </Modal>
  </>
}
