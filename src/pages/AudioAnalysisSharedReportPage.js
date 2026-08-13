import React, { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Card, Col, Container, ProgressBar, Row, Spinner, Table } from 'react-bootstrap'
import { Link, useParams, useSearchParams } from 'react-router-dom'
import useGoogleDocument from '../useGoogleDocument'
import AudioAnalysisCompare from '../components/AudioAnalysisCompare'
import { useDocumentTitle } from '../pageTitle'
import { TUNER_INSTRUMENT_LABELS } from '../instrumentTuningPresets'
import { sequencePresetLabel } from '../audioAnalysisSequences'
import { summarizeSetFeatures } from '../soundpostAnalysis'
import { importSharedAudioAnalysisSet, importSharedAudioAnalysisGroup, copyImportedAudioAnalysisToDrive, importedSetsNeedDriveCopy } from '../audioAnalysisShare'
import { audioAnalysisProgressPercent } from '../audioAnalysisShareUtils'

async function loadManifestBlob(driveApi, manifestFileId) {
  if (!manifestFileId) return null
  let blob = await driveApi.getPublicDocumentBlob(manifestFileId)
  if (blob && !blob.error) return blob
  if (typeof driveApi.getDocumentBlob === 'function') {
    blob = await driveApi.getDocumentBlob(manifestFileId)
    if (blob && !blob.error) return blob
  }
  return null
}

function fmt(n, digits) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits != null ? digits : 1)
}

function WorkProgressAlert(props) {
  const progress = props.progress
  const title = props.title
  const pct = audioAnalysisProgressPercent(progress)
  return (
    <Alert variant="secondary" className="py-2">
      <div className="d-flex align-items-center gap-2 mb-2">
        <Spinner animation="border" size="sm" />
        <span>{title || ((progress && progress.message) || 'Working…')}</span>
      </div>
      {progress && progress.message && title ? (
        <div className="small mb-2">{progress.message}</div>
      ) : null}
      {pct != null ? (
        <ProgressBar now={pct} label={
          (progress.current != null && progress.total != null)
            ? (progress.current + '/' + progress.total)
            : (pct + '%')
        } />
      ) : (
        <ProgressBar animated now={100} />
      )}
    </Alert>
  )
}

function SharedSetView(props) {
  const recordingSet = props.recordingSet
  const driveApi = props.driveApi
  const summary = useMemo(function() {
    return recordingSet ? summarizeSetFeatures(recordingSet.notes) : null
  }, [recordingSet])
  const notes = (recordingSet && recordingSet.notes) || []
  const [playingId, setPlayingId] = useState(null)

  async function playNote(note) {
    if (!note || !note.driveFileId || !driveApi) return
    const playKey = note.id || note.targetNote
    setPlayingId(playKey)
    try {
      let blob = await driveApi.getPublicDocumentBlob(note.driveFileId)
      if ((!blob || blob.error) && typeof driveApi.getDocumentBlob === 'function') {
        blob = await driveApi.getDocumentBlob(note.driveFileId)
      }
      if (!blob || blob.error) {
        setPlayingId(null)
        return
      }
      const url = URL.createObjectURL(blob)
      const audio = new Audio(url)
      audio.onended = function() {
        URL.revokeObjectURL(url)
        setPlayingId(null)
      }
      audio.onerror = function() {
        URL.revokeObjectURL(url)
        setPlayingId(null)
      }
      await audio.play()
    } catch (err) {
      setPlayingId(null)
    }
  }

  useEffect(function() {
    const autoNote = props.autoPlayNote
    if (!autoNote || !notes.length) return
    const match = notes.find(function(n) {
      return n && (n.targetNote === autoNote || n.id === autoNote)
    })
    if (match) playNote(match)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.autoPlayNote, recordingSet])

  if (!recordingSet) return null

  return (
    <>
      <Card body className="mb-3">
        <div className="fw-semibold h5 mb-1">{recordingSet.label || 'Untitled set'}</div>
        <div className="small text-muted">
          {TUNER_INSTRUMENT_LABELS[recordingSet.instrument] || recordingSet.instrument || 'Unknown instrument'}
          {recordingSet.tuningPresetId ? ' · ' + recordingSet.tuningPresetId : ''}
          {recordingSet.measurementMode === 'tap' ? ' · tap' : ' · bowed'}
          {' · '}
          {sequencePresetLabel(recordingSet.sequencePresetId)}
          {' · '}
          {notes.length} {recordingSet.measurementMode === 'tap' ? 'taps' : 'notes'}
        </div>
      </Card>

      {summary ? (
        <Row className="g-2 mb-3">
          <Col sm={6} md={3}><Card body className="small"><div className="text-muted">Level</div><strong>{fmt(summary.rmsDb)} dB</strong></Card></Col>
          <Col sm={6} md={3}><Card body className="small"><div className="text-muted">Centroid</div><strong>{fmt(summary.centroidHz)} Hz</strong></Card></Col>
          <Col sm={6} md={3}><Card body className="small"><div className="text-muted">Richness</div><strong>{fmt(summary.richness, 2)}</strong></Card></Col>
          <Col sm={6} md={3}><Card body className="small"><div className="text-muted">In-tune</div><strong>{summary.inTuneRatio != null ? fmt(summary.inTuneRatio * 100, 0) + '%' : '—'}</strong></Card></Col>
        </Row>
      ) : null}

      <Table responsive size="sm" bordered hover>
        <thead>
          <tr>
            <th>{recordingSet.measurementMode === 'tap' ? 'Tap' : 'Note'}</th>
            <th>Level</th>
            <th>Centroid</th>
            <th>Richness</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {notes.map(function(note, idx) {
            const feat = (note && note.features) || {}
            const playKey = note.id || note.targetNote || String(idx)
            return (
              <tr key={playKey + '-' + idx}>
                <td>{note.targetNote || ('#' + (idx + 1))}</td>
                <td>{fmt(feat.rmsDb)} dB</td>
                <td>{fmt(feat.centroidHz)} Hz</td>
                <td>{fmt(feat.richness, 2)}</td>
                <td>
                  <Button
                    size="sm"
                    variant="outline-secondary"
                    className="audio-analysis-play-btn"
                    disabled={!note.driveFileId || playingId === playKey}
                    onClick={function() { playNote(note) }}
                    aria-label={playingId === playKey ? 'Playing' : 'Play'}
                  >
                    <span className="audio-analysis-play-btn-label">
                      {playingId === playKey ? 'Playing…' : 'Play'}
                    </span>
                  </Button>
                </td>
              </tr>
            )
          })}
        </tbody>
      </Table>
    </>
  )
}

export default function AudioAnalysisSharedReportPage(props) {
  const params = useParams()
  const [searchParams] = useSearchParams()
  const manifestFileId = params.manifestFileId ? decodeURIComponent(params.manifestFileId) : ''
  const driveApi = useGoogleDocument(props.token, props.logout || function() {})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [manifest, setManifest] = useState(null)
  const [needsLogin, setNeedsLogin] = useState(false)
  const [importStatus, setImportStatus] = useState(null)
  const [importing, setImporting] = useState(false)
  const [loadProgress, setLoadProgress] = useState(null)
  const [importProgress, setImportProgress] = useState(null)
  const didImport = useRef(false)
  const pendingDriveCopy = useRef(false)
  const driveCopyInFlight = useRef(false)
  const loggedIn = !!(props.token && props.token.access_token)

  function buildImportStatus(result, opts) {
    const options = opts || {}
    const groupName = options.groupName || null
    const isGroup = !!options.isGroup
    const setCount = options.setCount || 0
    const parts = []
    if (result.alreadyImported) {
      parts.push(
        'Already in your Audio Analysis sets' +
          (groupName ? ' under group “' + groupName + '”' : '') +
          (isGroup
            ? (' (' + setCount + ' set' + (setCount === 1 ? '' : 's') + ')')
            : '')
      )
    } else if (isGroup) {
      parts.push(
        'Imported ' + (result.importedCount || 0) + ' of ' + setCount + ' set(s)' +
          (groupName ? ' under group “' + groupName + '”' : ' (Ungrouped)')
      )
    } else {
      parts.push(
        'Imported into your Audio Analysis sets' +
          (groupName ? ' under group “' + groupName + '”' : ' (Ungrouped)')
      )
    }
    if (result.notesWithAudio != null && !result.alreadyImported) {
      parts.push(result.notesWithAudio + '/' + result.notesImported + ' note audio file(s) saved locally')
    }
    if (result.notesCopiedToDrive) {
      parts.push(result.notesCopiedToDrive + ' audio file(s) copied to your Google Drive')
    }
    if (result.driveCopyError) {
      parts.push('Drive copy issue: ' + result.driveCopyError)
    }
    const needsDriveCopy = !!(
      result.needsLoginForDriveCopy ||
      (!result.notesCopiedToDrive && !result.alreadyImported && (result.notesWithAudio || 0) > 0 && !loggedIn)
    )
    let text = parts.join(' · ') + '.'
    if (needsDriveCopy && !loggedIn) {
      text += ' Sign in to copy audio into your Google Drive so it stays available if the sharer deletes theirs.'
    }
    return {
      variant: needsDriveCopy ? 'warning' : (result.alreadyImported ? 'info' : 'success'),
      text: text,
      needsDriveCopy: needsDriveCopy
    }
  }

  const isGroupShare = !!(manifest && manifest.kind === 'group' && Array.isArray(manifest.sets))
  const isSetShare = !isGroupShare && !!(manifest && (manifest.kind === 'set' || (manifest.set && !manifest.baseline)))

  useDocumentTitle(
    isGroupShare
      ? 'Shared Audio Analysis group'
      : (isSetShare ? 'Shared Audio Analysis set' : 'Shared Audio Analysis report')
  )

  useEffect(function() {
    didImport.current = false
    pendingDriveCopy.current = false
    driveCopyInFlight.current = false
    setImportStatus(null)
    setImportProgress(null)
    setLoadProgress(null)
  }, [manifestFileId])

  useEffect(function() {
    if (!manifestFileId) {
      setError('Missing shared report id')
      setLoading(false)
      return
    }

    let cancelled = false
    async function load() {
      setLoading(true)
      setError(null)
      setNeedsLogin(false)
      setLoadProgress({ phase: 'load', message: 'Fetching shared manifest from Google Drive…' })
      try {
        const blob = await loadManifestBlob(driveApi, manifestFileId)
        if (cancelled) return
        if (!blob) {
          if (!loggedIn) {
            setNeedsLogin(true)
            setError('Sign in with Google to open this shared Audio Analysis report.')
          } else {
            setError('Could not load shared report.')
          }
          setLoading(false)
          return
        }
        setLoadProgress({ phase: 'parse', message: 'Reading shared manifest…' })
        const text = await blob.text()
        if (cancelled) return
        const data = JSON.parse(text)
        const looksLikeGroup = data && data.kind === 'group' && Array.isArray(data.sets)
        const looksLikeSet = data && (data.kind === 'set' || (data.set && !data.baseline))
        const looksLikeCompare = data && data.baseline && data.candidate
        if (!looksLikeGroup && !looksLikeSet && !looksLikeCompare) {
          setError('Shared report is missing set, group, or comparison data.')
        } else {
          if (looksLikeGroup) {
            setLoadProgress({
              phase: 'parse',
              message: 'Loaded group with ' + ((data.sets && data.sets.length) || 0) + ' set(s)…'
            })
          }
          setManifest(data)
        }
      } catch (err) {
        if (!cancelled) setError((err && err.message) || String(err))
      } finally {
        if (!cancelled) {
          setLoading(false)
          setLoadProgress(null)
        }
      }
    }
    load()
    return function() { cancelled = true }
  }, [manifestFileId, props.token, driveApi, loggedIn])

  useEffect(function() {
    if (!isSetShare || !manifest || !manifest.set || !manifestFileId) return
    if (!loggedIn) return
    if (didImport.current) return
    didImport.current = true
    let cancelled = false
    async function runImport() {
      setImporting(true)
      setImportProgress({ phase: 'import-start', message: 'Starting import…' })
      try {
        const result = await importSharedAudioAnalysisSet(driveApi, {
          set: manifest.set,
          groupLabel: manifest.groupLabel,
          manifestFileId: manifestFileId,
          copyToDrive: true,
          onProgress: function(info) {
            if (!cancelled) setImportProgress(info || null)
          }
        })
        if (cancelled) return
        if (!result.ok) {
          setImportStatus({ variant: 'danger', text: result.error || 'Could not import set' })
          return
        }
        const groupName = manifest.groupLabel
          ? manifest.groupLabel
          : (result.group && result.group.label ? result.group.label : null)
        const status = buildImportStatus(result, { groupName: groupName, isGroup: false })
        const needs = await importedSetsNeedDriveCopy(manifestFileId)
        if (needs) {
          status.needsDriveCopy = true
          status.variant = 'warning'
          pendingDriveCopy.current = true
        }
        setImportStatus(status)
      } catch (err) {
        if (!cancelled) {
          setImportStatus({ variant: 'danger', text: (err && err.message) || String(err) })
        }
      } finally {
        if (!cancelled) {
          setImporting(false)
          setImportProgress(null)
        }
      }
    }
    runImport()
    return function() { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetShare, manifest, manifestFileId, driveApi, loggedIn])

  useEffect(function() {
    if (!isGroupShare || !manifest || !manifestFileId) return
    if (!loggedIn) return
    if (didImport.current) return
    didImport.current = true
    let cancelled = false
    async function runImport() {
      setImporting(true)
      setImportProgress({
        phase: 'import-start',
        message: 'Starting group import…',
        setTotal: (manifest.sets || []).length
      })
      try {
        const result = await importSharedAudioAnalysisGroup(driveApi, {
          sets: manifest.sets,
          groupLabel: manifest.groupLabel,
          manifestFileId: manifestFileId,
          copyToDrive: true,
          onProgress: function(info) {
            if (!cancelled) setImportProgress(info || null)
          }
        })
        if (cancelled) return
        if (!result.ok) {
          setImportStatus({ variant: 'danger', text: result.error || 'Could not import group' })
          return
        }
        const groupName = manifest.groupLabel
          ? manifest.groupLabel
          : (result.group && result.group.label ? result.group.label : null)
        const status = buildImportStatus(result, {
          groupName: groupName,
          isGroup: true,
          setCount: (manifest.sets || []).length
        })
        const needs = await importedSetsNeedDriveCopy(manifestFileId)
        if (needs || result.needsLoginForDriveCopy) {
          status.needsDriveCopy = true
          status.variant = 'warning'
          pendingDriveCopy.current = true
          if (needs && result.alreadyImported) {
            status.text = status.text.replace(/\.$/, '') +
              ' · Some note audio is not yet on your Google Drive.'
          }
        }
        setImportStatus(status)
      } catch (err) {
        if (!cancelled) {
          setImportStatus({ variant: 'danger', text: (err && err.message) || String(err) })
        }
      } finally {
        if (!cancelled) {
          setImporting(false)
          setImportProgress(null)
        }
      }
    }
    runImport()
    return function() { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGroupShare, manifest, manifestFileId, driveApi, loggedIn])

  useEffect(function() {
    if (!loggedIn || !manifestFileId) return
    if (!pendingDriveCopy.current) return
    if (driveCopyInFlight.current || importing) return
    let cancelled = false
    async function runAutoDriveCopy() {
      driveCopyInFlight.current = true
      setImporting(true)
      setImportProgress({ phase: 'import-drive-copy', message: 'Copying audio to your Google Drive…' })
      try {
        const result = await copyImportedAudioAnalysisToDrive(driveApi, {
          manifestFileId: manifestFileId,
          onProgress: function(info) {
            if (!cancelled) setImportProgress(info || null)
          }
        })
        if (cancelled) return
        pendingDriveCopy.current = false
        if (!result.ok) {
          setImportStatus({
            variant: 'warning',
            text: (result.error || 'Could not copy audio to your Google Drive') + '.',
            needsDriveCopy: true
          })
          return
        }
        setImportStatus({
          variant: 'success',
          text: 'Copied ' + (result.uploaded || 0) +
            ' note audio file(s) to your Google Drive. Your copy is independent of the sharer’s files.',
          needsDriveCopy: false
        })
      } catch (err) {
        if (!cancelled) {
          pendingDriveCopy.current = false
          setImportStatus({
            variant: 'danger',
            text: (err && err.message) || String(err),
            needsDriveCopy: true
          })
        }
      } finally {
        driveCopyInFlight.current = false
        if (!cancelled) {
          setImporting(false)
          setImportProgress(null)
        }
      }
    }
    runAutoDriveCopy()
    return function() { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loggedIn, manifestFileId, driveApi, importStatus && importStatus.needsDriveCopy])

  const autoPlay = useMemo(function() {
    return {
      side: searchParams.get('side'),
      note: searchParams.get('note')
    }
  }, [searchParams])

  const baseline = manifest && manifest.baseline
  const candidate = manifest && manifest.candidate
  const sharedSet = manifest && manifest.set
  const sharedSets = (manifest && manifest.sets) || []

  const createdLabel = useMemo(function() {
    if (!manifest || !manifest.createdAt) return null
    try {
      return new Date(manifest.createdAt).toLocaleString()
    } catch (e) {
      return manifest.createdAt
    }
  }, [manifest])

  const openAudioAnalysisHref =
    '/audioanalysis' +
    (manifest && manifest.groupLabel
      ? ('?group=' + encodeURIComponent(manifest.groupLabel))
      : '')

  async function handleCopyToDriveClick() {
    if (driveCopyInFlight.current) return
    pendingDriveCopy.current = true
    driveCopyInFlight.current = true
    setImporting(true)
    setImportProgress({ phase: 'import-drive-copy', message: 'Copying audio to your Google Drive…' })
    try {
      const result = await copyImportedAudioAnalysisToDrive(driveApi, {
        manifestFileId: manifestFileId,
        onProgress: function(info) { setImportProgress(info || null) }
      })
      pendingDriveCopy.current = false
      if (!result.ok) {
        setImportStatus({
          variant: 'warning',
          text: (result.error || 'Could not copy audio to your Google Drive') + '.',
          needsDriveCopy: true
        })
        return
      }
      setImportStatus({
        variant: 'success',
        text: 'Copied ' + (result.uploaded || 0) +
          ' note audio file(s) to your Google Drive. Your copy is independent of the sharer’s files.',
        needsDriveCopy: false
      })
    } catch (err) {
      pendingDriveCopy.current = false
      setImportStatus({
        variant: 'danger',
        text: (err && err.message) || String(err),
        needsDriveCopy: true
      })
    } finally {
      driveCopyInFlight.current = false
      setImporting(false)
      setImportProgress(null)
    }
  }

  function renderLoginToImportGate() {
    if (loggedIn || !(isGroupShare || isSetShare)) return null
    return (
      <Alert variant="warning" className="mb-3">
        <div className="fw-semibold mb-1">Sign in with Google to import</div>
        <p className="mb-2">
          Shared Audio Analysis links are marked readable by anyone with the link, but Google often
          still blocks anonymous downloads. Import also saves private copies of the note audio into
          {' '}<em>your</em> Google Drive so they remain available if the sharer deletes theirs.
        </p>
        {props.login ? (
          <Button variant="primary" onClick={props.login}>
            Sign in with Google to import
          </Button>
        ) : (
          <p className="mb-0 small text-muted">Google sign-in is not available in this session.</p>
        )}
      </Alert>
    )
  }

  function renderImportStatusAlert() {
    if (!importStatus) return null
    return (
      <Alert variant={importStatus.variant} className="py-2">
        {importStatus.text}{' '}
        {importStatus.needsDriveCopy && loggedIn ? (
          <Button
            size="sm"
            variant="primary"
            className="ms-2 me-2"
            disabled={importing}
            onClick={handleCopyToDriveClick}
          >
            Copy to my Google Drive
          </Button>
        ) : null}
        <Link to={openAudioAnalysisHref}>Open Audio Analysis</Link>
      </Alert>
    )
  }

  if (loading) {
    return (
      <Container className="py-4">
        <WorkProgressAlert
          title={
            'Loading shared Audio Analysis ' +
            (isGroupShare ? 'group' : (isSetShare ? 'set' : 'report')) +
            '…'
          }
          progress={loadProgress || { message: 'Fetching shared manifest from Google Drive…' }}
        />
      </Container>
    )
  }

  if (error && !manifest) {
    return (
      <Container className="py-4" style={{ maxWidth: '40rem' }}>
        <h1 className="h3 mb-3">Shared Audio Analysis</h1>
        <Alert variant={needsLogin ? 'warning' : 'danger'}>
          <div className="fw-semibold mb-1">
            {needsLogin ? 'Sign in with Google to continue' : 'Could not open shared report'}
          </div>
          <p className="mb-2">
            {needsLogin
              ? 'This shared report could not be loaded anonymously. Google often requires sign-in even for “anyone with the link” files. Sign in to open the report and import it into your Audio Analysis library.'
              : error}
          </p>
          {needsLogin ? <p className="mb-0 small text-muted">{error}</p> : null}
        </Alert>
        {needsLogin && props.login ? (
          <Button variant="primary" onClick={props.login}>Sign in with Google</Button>
        ) : null}
      </Container>
    )
  }

  if (isGroupShare) {
    return (
      <Container fluid className="py-3">
        <div className="mb-3">
          <h1 className="h3 mb-1">Shared Audio Analysis Group</h1>
          <p className="text-muted mb-0">
            {loggedIn
              ? <>These sets are imported into your Audio Analysis recording sets
                {manifest.groupLabel ? <> under group <strong>{manifest.groupLabel}</strong></> : null}.
                Note audio is copied into your Google Drive so your copy stays available if the sharer deletes theirs.</>
              : <>Preview of a shared recording group
                {manifest.groupLabel ? <> (<strong>{manifest.groupLabel}</strong>)</> : null}.
                Sign in to import it into your library.</>}
            {createdLabel ? ' Shared: ' + createdLabel + '.' : ''}
          </p>
        </div>
        {renderLoginToImportGate()}
        {importing ? (
          <WorkProgressAlert
            title="Importing into your recording sets…"
            progress={importProgress}
          />
        ) : null}
        {renderImportStatusAlert()}
        {sharedSets.map(function(setObj, idx) {
          return (
            <div key={(setObj && setObj.id) || ('shared-set-' + idx)} className="mb-4">
              <SharedSetView
                recordingSet={setObj}
                driveApi={driveApi}
                autoPlayNote={loggedIn && idx === 0 ? autoPlay.note : null}
              />
            </div>
          )
        })}
      </Container>
    )
  }

  if (isSetShare) {
    return (
      <Container fluid className="py-3">
        <div className="mb-3">
          <h1 className="h3 mb-1">Shared Audio Analysis Set</h1>
          <p className="text-muted mb-0">
            {loggedIn
              ? <>This set is imported into your Audio Analysis recording sets
                {manifest.groupLabel ? <> under group <strong>{manifest.groupLabel}</strong></> : null}.
                Note audio is copied into your Google Drive so your copy stays available if the sharer deletes theirs.</>
              : <>Preview of a shared recording set
                {manifest.groupLabel ? <> under group <strong>{manifest.groupLabel}</strong></> : null}.
                Sign in to import it into your library.</>}
            {createdLabel ? ' Shared: ' + createdLabel + '.' : ''}
          </p>
        </div>
        {renderLoginToImportGate()}
        {importing ? (
          <WorkProgressAlert
            title="Importing into your recording sets…"
            progress={importProgress}
          />
        ) : null}
        {renderImportStatusAlert()}
        <SharedSetView
          recordingSet={sharedSet}
          driveApi={driveApi}
          autoPlayNote={loggedIn ? autoPlay.note : null}
        />
      </Container>
    )
  }

  return (
    <Container fluid className="py-3">
      <div className="mb-3">
        <h1 className="h3 mb-1">Shared Audio Analysis Report</h1>
        <p className="text-muted mb-0">
          Standalone comparison report for baseline <strong>A</strong> and candidate <strong>B</strong>.
          Play buttons fetch note audio from Google Drive; sign in with Google if playback is blocked.
        </p>
      </div>

      <Row className="g-3 mb-3">
        <Col md={6}>
          <Card body>
            <div className="small text-muted">Baseline (A)</div>
            <div className="fw-semibold">{baseline && baseline.label ? baseline.label : 'Baseline'}</div>
            <div className="small text-muted">
              {baseline ? (TUNER_INSTRUMENT_LABELS[baseline.instrument] || baseline.instrument || 'Unknown instrument') : '—'}
              {baseline && baseline.tuningPresetId ? ' · ' + baseline.tuningPresetId : ''}
              {baseline && baseline.measurementMode === 'tap' ? ' · tap' : ' · bowed'}
            </div>
          </Card>
        </Col>
        <Col md={6}>
          <Card body>
            <div className="small text-muted">Candidate (B)</div>
            <div className="fw-semibold">{candidate && candidate.label ? candidate.label : 'Candidate'}</div>
            <div className="small text-muted">
              {candidate ? (TUNER_INSTRUMENT_LABELS[candidate.instrument] || candidate.instrument || 'Unknown instrument') : '—'}
              {candidate && candidate.tuningPresetId ? ' · ' + candidate.tuningPresetId : ''}
              {candidate && candidate.measurementMode === 'tap' ? ' · tap' : ' · bowed'}
            </div>
          </Card>
        </Col>
      </Row>

      <Alert variant="info" className="small">
        All deltas in this report are <strong>B - A</strong>. Positive values mean candidate B is higher or has more of that quality.
        Start with <strong>Overview</strong>, then use <strong>Timbre</strong> for tone colour, <strong>Playability</strong> for response under the bow,
        and <strong>QC</strong> to check whether setup or playing differences may have influenced the result.
        {createdLabel ? ' Report created: ' + createdLabel + '.' : ''}
      </Alert>

      <AudioAnalysisCompare
        sharedBaseline={baseline}
        sharedCandidate={candidate}
        sharedMode={true}
        driveApi={driveApi}
        token={props.token}
        login={props.login}
        autoPlayRequest={autoPlay}
      />
    </Container>
  )
}
