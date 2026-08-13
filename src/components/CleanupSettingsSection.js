import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import { Badge, Button, Form, ProgressBar, Table } from 'react-bootstrap'
import { Link } from 'react-router-dom'
import {
  cancelAllJobs,
  enqueueChordReadinessJob,
  getState as getChordCleanupState,
  setChordReadinessCleanupQueueContext,
  subscribe as subscribeChordCleanup,
} from '../chordReadinessCleanupQueue'
import { buildWorkSessionKey } from '../chordReadinessWorkSession'
import { CHORD_READINESS_RECOMMENDED_QUEUE, CHORD_READINESS_STATUSES } from '../tuneChordReadinessAudit'
import { buildSearchFilterParams } from '../searchFilterParams'
import { icons } from '../Icons'
import CleanupHelpModal from './CleanupHelpModal'
import {
  loadChordReadinessCleanupSettings,
  resolveCleanupBook,
  saveChordReadinessCleanupSettings,
} from '../chordReadinessCleanupSettings'

const ALL_BOOKS = ''

function collectBooks(indexes) {
  const books = []
  if (indexes && indexes.bookIndex) {
    Object.keys(indexes.bookIndex).forEach(function(book) {
      if (book) books.push(book)
    })
  }
  books.sort(function(a, b) { return a.localeCompare(b) })
  return books
}

function formatPercent(rate) {
  if (!Number.isFinite(rate)) return '0%'
  return (rate * 100).toFixed(1) + '%'
}

function statusVariant(status) {
  if (status === CHORD_READINESS_STATUSES.READY) return 'success'
  if (status === CHORD_READINESS_STATUSES.INSTRUMENTAL) return 'secondary'
  return 'warning'
}

function buildJobSpec(action, options) {
  return {
    action: action,
    book: options.book || null,
    limit: options.limit,
    dryRun: options.dryRun,
    includeMelody: options.includeMelody,
    alwaysTag: options.alwaysTag,
  }
}

function tuneSearchHref(tag, bookName) {
  const params = buildSearchFilterParams({
    currentTuneBook: bookName || '',
    tagFilter: [tag],
  })
  const query = Object.keys(params)
    .filter(function(key) { return params[key] })
    .map(function(key) { return key + '=' + encodeURIComponent(params[key]) })
    .join('&')
  return '/tunes' + (query ? '?' + query : '')
}

function pendingCountForMode(workSession, jobOptions, mode) {
  const key = buildWorkSessionKey(jobOptions, mode)
  const sessions = workSession && workSession.sessions ? workSession.sessions : null
  if (!sessions || !Object.prototype.hasOwnProperty.call(sessions, key)) return null
  const ids = sessions[key]
  return Array.isArray(ids) ? ids.length : 0
}

function findLatestActivityJob(jobs) {
  let latest = null
  ;(jobs || []).forEach(function(job) {
    if (job.action !== 'audit' && job.action !== 'tagOnly' && job.action !== 'apply') return
    if (job.status !== 'done' && job.status !== 'error' && job.status !== 'running' && job.status !== 'pending') {
      return
    }
    const ts = job.completedAt || job.startedAt || 0
    const latestTs = latest ? (latest.completedAt || latest.startedAt || 0) : 0
    if (!latest || ts >= latestTs) latest = job
  })
  return latest
}

function ActionButton(props) {
  return (
    <Button
      variant={props.variant}
      disabled={props.disabled}
      onClick={props.onClick}
      className="d-inline-flex align-items-center gap-2"
    >
      <span>{props.label}</span>
      {props.pending != null ? (
        <Badge bg={props.badgeVariant || 'secondary'} pill>{props.pending}</Badge>
      ) : null}
    </Button>
  )
}

export default function CleanupSettingsSection(props) {
  const indexes = props.indexes
  const tunebook = props.tunebook
  const tunes = props.tunes
  const forceRefresh = props.forceRefresh
  const books = useMemo(function() { return collectBooks(indexes) }, [indexes])
  const defaultBook = props.currentTuneBook && books.indexOf(props.currentTuneBook) >= 0
    ? props.currentTuneBook
    : ALL_BOOKS

  const savedSettingsRef = useRef(loadChordReadinessCleanupSettings())
  const savedSettings = savedSettingsRef.current
  const settingsHydratedRef = useRef(false)

  // Keep the background queue pointed at the live tunebook/tunes from this page.
  // App.js also wires refs; this covers HMR and cases where the App effect has not run yet.
  const tunebookRef = useRef(tunebook)
  const tunesRef = useRef(tunes)
  const forceRefreshRef = useRef(forceRefresh)
  tunebookRef.current = tunebook
  tunesRef.current = tunes
  forceRefreshRef.current = forceRefresh

  useEffect(function() {
    setChordReadinessCleanupQueueContext({
      getTunebook: function() { return tunebookRef.current },
      getTunes: function() { return tunesRef.current || {} },
      forceRefresh: function() {
        if (typeof forceRefreshRef.current === 'function') forceRefreshRef.current()
      },
    })
  }, [])

  const [book, setBook] = useState(function() {
    return resolveCleanupBook(savedSettings.book, books, defaultBook)
  })
  const [batchLimit, setBatchLimit] = useState(savedSettings.batchLimit)
  const [dryRun, setDryRun] = useState(savedSettings.dryRun)
  const [includeMelody, setIncludeMelody] = useState(savedSettings.includeMelody)
  const [alwaysTag, setAlwaysTag] = useState(savedSettings.alwaysTag)
  const [showHelp, setShowHelp] = useState(false)
  const [settingsHydrated, setSettingsHydrated] = useState(false)

  useEffect(function() {
    if (settingsHydratedRef.current) return
    if (savedSettings.book && books.length === 0) return
    setBook(resolveCleanupBook(savedSettings.book, books, defaultBook))
    settingsHydratedRef.current = true
    setSettingsHydrated(true)
  }, [books, defaultBook, savedSettings.book])

  useEffect(function() {
    if (!settingsHydrated) return
    saveChordReadinessCleanupSettings({
      book: book,
      batchLimit: batchLimit,
      dryRun: dryRun,
      includeMelody: includeMelody,
      alwaysTag: alwaysTag,
    })
  }, [book, batchLimit, dryRun, includeMelody, alwaysTag, settingsHydrated])

  const cleanupState = useSyncExternalStore(subscribeChordCleanup, getChordCleanupState, getChordCleanupState)
  const activeJobs = (cleanupState.jobs || []).filter(function(job) {
    return job.status === 'pending' || job.status === 'running'
  })
  const busy = activeJobs.length > 0 || cleanupState.running
  const currentJob = cleanupState.jobs.find(function(job) { return job.id === cleanupState.currentJobId })
  const summary = cleanupState.lastAuditReport && cleanupState.lastAuditReport.summary
    ? cleanupState.lastAuditReport.summary
    : null
  const auditBook = cleanupState.jobs.find(function(job) {
    return job.action === 'audit' && job.status === 'done' && job.auditReport
  })
  const tagSearchBook = (auditBook && auditBook.book) || book || null

  const jobOptions = {
    book: book || null,
    limit: batchLimit,
    dryRun: dryRun,
    includeMelody: includeMelody,
    alwaysTag: alwaysTag,
  }

  const tagPending = pendingCountForMode(cleanupState.workSession, jobOptions, 'tagOnly')
  const applyPending = pendingCountForMode(cleanupState.workSession, jobOptions, 'apply')

  function enqueueAction(action) {
    setChordReadinessCleanupQueueContext({
      getTunebook: function() { return tunebookRef.current },
      getTunes: function() { return tunesRef.current || {} },
      forceRefresh: function() {
        if (typeof forceRefreshRef.current === 'function') forceRefreshRef.current()
      },
    })
    if (action !== 'audit' && !dryRun) {
      const verb = action === 'tagOnly' ? 'tag' : 'fix'
      const confirmed = window.confirm(
        'Apply chord readiness ' + verb + 'es to up to ' + batchLimit + ' tune(s)' +
        (book ? ' in book "' + book + '"' : '') + '?'
      )
      if (!confirmed) return
    }
    enqueueChordReadinessJob(buildJobSpec(action, jobOptions))
  }

  const latestJob = findLatestActivityJob(cleanupState.jobs)
  const statusMessage = busy
    ? ((currentJob && currentJob.message) || 'Working…')
    : ((latestJob && latestJob.message) || '')

  return (
    <>
      <div className="app-surface-panel App-settings-section">
        <div className="d-flex align-items-center gap-2 mb-3">
          <h2 className="mb-0">Chord readiness cleanup</h2>
          <Button
            type="button"
            variant="outline-secondary"
            size="sm"
            className="form-field-help-btn"
            title="Help: chord readiness cleanup"
            aria-label="Help: chord readiness cleanup"
            onClick={function() { setShowHelp(true) }}
          >
            {icons.question}
          </Button>
        </div>

        <Form.Group className="mb-3" controlId="cleanup-book">
          <Form.Label>Book scope</Form.Label>
          <Form.Select value={book} onChange={function(e) { setBook(e.target.value) }} disabled={busy}>
            <option value={ALL_BOOKS}>All tunes</option>
            {books.map(function(bookName) {
              return <option key={bookName} value={bookName}>{bookName}</option>
            })}
          </Form.Select>
        </Form.Group>

        <div className="row g-3 mb-3">
          <div className="col-sm-4">
            <Form.Group controlId="cleanup-batch-limit">
              <Form.Label>Batch size</Form.Label>
              <Form.Control
                type="number"
                min={1}
                max={500}
                value={batchLimit}
                disabled={busy}
                onChange={function(e) {
                  const parsed = parseInt(e.target.value, 10)
                  setBatchLimit(Number.isFinite(parsed) && parsed > 0 ? parsed : 25)
                }}
              />
            </Form.Group>
          </div>
          <div className="col-sm-8 d-flex flex-wrap align-items-end gap-3">
            <Form.Check
              type="switch"
              id="cleanup-dry-run"
              label="Dry run"
              checked={dryRun}
              disabled={busy}
              onChange={function(e) { setDryRun(e.target.checked) }}
            />
            <Form.Check
              type="switch"
              id="cleanup-include-melody"
              label="Include melody fixes"
              checked={includeMelody}
              disabled={busy}
              onChange={function(e) { setIncludeMelody(e.target.checked) }}
            />
            <Form.Check
              type="switch"
              id="cleanup-always-tag"
              label="Always re-tag after apply"
              checked={alwaysTag}
              disabled={busy}
              onChange={function(e) { setAlwaysTag(e.target.checked) }}
            />
          </div>
        </div>

        <div className="App-settings-actions d-flex flex-wrap gap-2">
          <Button variant="outline-primary" disabled={busy} onClick={function() { enqueueAction('audit') }}>
            Audit
          </Button>
          <ActionButton
            label="Tag only"
            variant="outline-secondary"
            disabled={busy}
            pending={tagPending}
            onClick={function() { enqueueAction('tagOnly') }}
          />
          <ActionButton
            label="Apply fixes"
            variant={dryRun ? 'outline-warning' : 'warning'}
            disabled={busy}
            pending={applyPending}
            badgeVariant="warning"
            onClick={function() { enqueueAction('apply') }}
          />
        </div>

        {busy ? (
          <div className="background-jobs-queue-progress mt-3">
            {currentJob && currentJob.progressTotal > 0 ? (
              <ProgressBar
                now={currentJob.progress || 0}
                label={(currentJob.progress || 0) + '%'}
                animated
                striped
                variant="info"
              />
            ) : null}
            <div className="d-flex align-items-start justify-content-between gap-2 background-jobs-queue-progress-meta">
              <span className="flex-grow-1" aria-live="polite">
                {statusMessage || 'Working…'}
              </span>
              <Button
                variant="outline-danger"
                size="sm"
                className="flex-shrink-0"
                onClick={cancelAllJobs}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : statusMessage ? (
          <p className="app-text-muted mt-3 mb-0" aria-live="polite">
            {statusMessage}
          </p>
        ) : null}
      </div>

      {summary ? (
        <div className="app-surface-panel App-settings-section">
          <h3>Audit summary</h3>
          <p className="app-text-muted">Restored from the most recent completed audit job.</p>
          <dl className="row mb-3">
            <dt className="col-sm-4">Total songs</dt>
            <dd className="col-sm-8">{summary.totalTunes}</dd>
            <dt className="col-sm-4">Ready</dt>
            <dd className="col-sm-8">{summary.readyCount} ({formatPercent(summary.readyRate)})</dd>
            <dt className="col-sm-4">Display ready</dt>
            <dd className="col-sm-8">
              {(summary.displayReadyCount != null ? summary.displayReadyCount : 0)}
              {' '}({formatPercent(summary.displayReadyRate)})
            </dd>
            <dt className="col-sm-4">Needs work</dt>
            <dd className="col-sm-8">{summary.needsWorkCount}</dd>
          </dl>
          <h4 className="h6">By status</h4>
          <div className="d-flex flex-wrap gap-2 mb-3">
            {Object.keys(summary.byStatus || {}).sort().map(function(status) {
              return (
                <Badge key={status} bg={statusVariant(status)} text={status === CHORD_READINESS_STATUSES.READY ? 'dark' : undefined}>
                  {status}: {summary.byStatus[status]}
                </Badge>
              )
            })}
          </div>
          {Object.keys(summary.byRenderMode || {}).length > 0 ? (
            <>
              <h4 className="h6">By render mode</h4>
              <div className="d-flex flex-wrap gap-2 mb-3">
                {Object.keys(summary.byRenderMode).sort().map(function(mode) {
                  return (
                    <Badge key={mode} bg="info" text="dark">
                      {mode}: {summary.byRenderMode[mode]}
                    </Badge>
                  )
                })}
              </div>
            </>
          ) : null}
          <h4 className="h6">Recommended queue</h4>
          <ol className="app-text-muted small mb-3">
            {CHORD_READINESS_RECOMMENDED_QUEUE.map(function(item) {
              return <li key={item}>{item}</li>
            })}
          </ol>
          {Object.keys(summary.byTag || {}).length > 0 ? (
            <>
              <h4 className="h6">By tag</h4>
              <Table responsive size="sm" className="mb-0">
                <thead>
                  <tr>
                    <th>Tag</th>
                    <th>Count</th>
                  </tr>
                </thead>
                <tbody>
                  {Object.keys(summary.byTag).sort().map(function(tag) {
                    return (
                      <tr key={tag}>
                        <td>
                          <Link to={tuneSearchHref(tag, tagSearchBook)}>{tag}</Link>
                        </td>
                        <td>{summary.byTag[tag]}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </Table>
            </>
          ) : null}
        </div>
      ) : null}

      <CleanupHelpModal show={showHelp} onHide={function() { setShowHelp(false) }} />
    </>
  )
}
