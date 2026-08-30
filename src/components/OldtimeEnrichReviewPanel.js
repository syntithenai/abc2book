/**
 * Source-only oldtime enrich review: PDF | notation | ABC tools (eurosession-style).
 * No library/internet search; convert from MIDI or OMR PDF only.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Badge, Button, ButtonGroup, Form, ListGroup, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import Abc from './Abc'
import NotationIssuesPanel from './NotationIssuesPanel'
import './BookImportReviewPanel.css'
import './OldtimeEnrichReviewPanel.css'
import {
  getOldtimeEnrichSet,
  updateOldtimeEnrichSet,
  updateOldtimeTune,
  downloadEnrichPackage,
  filterOldtimeTunes,
  computeTallies,
} from '../oldtimeEnrichReviewStore'
import { isOmrSource } from '../bookImportAbcLookup'
import {
  convertMidiForTune,
  omrPdfForTune,
  convertSourceForTune,
  fetchRemoteBytes,
} from '../oldtimeEnrichActions'
import {
  transposeAbcText,
  scaleAbcNoteLengths,
  setAbcMeter,
  readAbcMeter,
  rewrapAbcBarsPerLine,
} from '../bookImportAbcTransforms'
import { safeAutofixMidiAbc } from '../midiImportFinalize'
import { runNotationChecks } from '../useNotationCheck'
import { buildNotationCheckTune } from '../notationCheckSnapshot'

function selectedCandidate(tune) {
  if (!tune) return null
  const list = Array.isArray(tune.candidates) ? tune.candidates : []
  if (tune.selectedCandidateId) {
    const hit = list.find(function(c) { return c && c.id === tune.selectedCandidateId })
    if (hit) return hit
  }
  if (tune.abc) {
    return { id: 'current', source: tune.abcSource || 'selected', abc: tune.abc }
  }
  return null
}

function sourceLabel(tune) {
  if (!tune) return ''
  if (String(tune.convertPrefer || '').toLowerCase() === 'omr') return 'OMR PDF'
  if (tune.midiUrl) return 'MIDI'
  if (tune.pdfUrl) return 'OMR PDF'
  return '—'
}

const METER_OPTIONS = ['2/2', '2/4', '3/4', '4/4', '6/8', '9/8', '12/8']

export default function OldtimeEnrichReviewPanel(props) {
  const setId = props.setId
  const tunebook = props.tunebook
  const abcTools = tunebook && tunebook.abcTools
  const accessToken = props.token && props.token.access_token
    ? props.token.access_token
    : props.token
  const [reviewSet, setReviewSet] = useState(null)
  const [activeId, setActiveId] = useState('')
  const [nameQuery, setNameQuery] = useState('')
  const [statusFilter, setStatusFilter] = useState('all')
  const [busy, setBusy] = useState(false)
  const [abcDraft, setAbcDraft] = useState('')
  const [undoStack, setUndoStack] = useState([])
  const [pdfBlobUrl, setPdfBlobUrl] = useState('')
  const [pdfError, setPdfError] = useState('')
  const [pdfLoading, setPdfLoading] = useState(false)
  const abcTimer = useRef(null)
  const pdfUrlRef = useRef('')

  const loadSet = useCallback(async function() {
    const set = await getOldtimeEnrichSet(setId)
    setReviewSet(set)
    if (set && Array.isArray(set.tunes) && set.tunes.length && !activeId) {
      setActiveId(set.tunes[0].id)
    }
    return set
  }, [setId, activeId])

  useEffect(function() {
    loadSet()
  }, [setId]) // eslint-disable-line react-hooks/exhaustive-deps

  const tunes = useMemo(function() {
    return (reviewSet && reviewSet.tunes) || []
  }, [reviewSet])

  const tallies = useMemo(function() {
    return (reviewSet && reviewSet.tallies) || computeTallies(tunes)
  }, [reviewSet, tunes])

  const visibleTunes = useMemo(function() {
    return filterOldtimeTunes(tunes, { nameQuery: nameQuery, statusFilter: statusFilter })
  }, [tunes, nameQuery, statusFilter])

  const activeTune = useMemo(function() {
    return visibleTunes.find(function(t) { return t && t.id === activeId })
      || visibleTunes[0]
      || null
  }, [visibleTunes, activeId])

  useEffect(function() {
    if (activeTune && activeTune.id !== activeId) setActiveId(activeTune.id)
  }, [activeTune, activeId])

  useEffect(function() {
    const sel = selectedCandidate(activeTune)
    setAbcDraft(sel && sel.abc ? sel.abc : (activeTune && activeTune.abc) || '')
    setUndoStack([])
  }, [activeTune && activeTune.id, activeTune && activeTune.selectedCandidateId, activeTune && activeTune.abc]) // eslint-disable-line react-hooks/exhaustive-deps

  // Load PDF as blob URL (auth proxy needs fetch, not bare iframe).
  useEffect(function() {
    let cancelled = false
    const url = String(activeTune && activeTune.pdfUrl || '').trim()
    if (pdfUrlRef.current) {
      URL.revokeObjectURL(pdfUrlRef.current)
      pdfUrlRef.current = ''
    }
    setPdfBlobUrl('')
    setPdfError('')
    if (!url) return undefined
    if (!accessToken) {
      setPdfError('Sign in to load the source PDF')
      return undefined
    }
    setPdfLoading(true)
    fetchRemoteBytes(url, accessToken, (activeTune.slug || 'tune') + '.pdf')
      .then(function(fetched) {
        if (cancelled) return
        const blob = new Blob([fetched.bytes], { type: 'application/pdf' })
        const objectUrl = URL.createObjectURL(blob)
        pdfUrlRef.current = objectUrl
        setPdfBlobUrl(objectUrl)
      })
      .catch(function(err) {
        if (cancelled) return
        setPdfError((err && err.message) || String(err))
      })
      .finally(function() {
        if (!cancelled) setPdfLoading(false)
      })
    return function() {
      cancelled = true
      if (pdfUrlRef.current) {
        URL.revokeObjectURL(pdfUrlRef.current)
        pdfUrlRef.current = ''
      }
    }
  }, [activeTune && activeTune.id, activeTune && activeTune.pdfUrl, accessToken]) // eslint-disable-line react-hooks/exhaustive-deps

  async function patchActive(patch) {
    if (!activeTune) return
    const updated = await updateOldtimeTune(setId, activeTune.id, patch)
    setReviewSet(updated)
  }

  function pushUndo(prevAbc) {
    const text = String(prevAbc || '')
    if (!text) return
    setUndoStack(function(stack) {
      return stack.concat([text]).slice(-30)
    })
  }

  function applyAbcTransform(transformFn) {
    const prev = abcDraft
    const next = transformFn(prev)
    if (next == null || String(next) === String(prev)) return
    pushUndo(prev)
    setAbcDraft(String(next))
    patchActive({
      abc: String(next),
      abcSource: 'edited',
      reviewed: false,
      status: 'has_candidates',
    })
  }

  function handleUndoAbc() {
    if (!undoStack.length) return
    const prev = undoStack[undoStack.length - 1]
    setUndoStack(undoStack.slice(0, -1))
    setAbcDraft(prev)
    patchActive({ abc: prev, abcSource: 'edited', reviewed: false })
  }

  function handleSelectCandidate(cand) {
    if (!cand) return
    pushUndo(abcDraft)
    patchActive({
      selectedCandidateId: cand.id,
      abc: cand.abc,
      abcSource: cand.source,
      reviewed: true,
      status: 'has_candidates',
    })
  }

  function handleClearNotation() {
    pushUndo(abcDraft)
    patchActive({ selectedCandidateId: '', abc: '', abcSource: '', reviewed: true })
  }

  function handleAbcChange(text) {
    setAbcDraft(text)
    if (abcTimer.current) clearTimeout(abcTimer.current)
    abcTimer.current = setTimeout(function() {
      patchActive({ abc: text, abcSource: 'edited', reviewed: false, status: 'has_candidates' })
    }, 500)
  }

  async function runAction(label, fn) {
    if (!activeTune) return
    if (!accessToken) {
      toast.error('Sign in required for MIDI/OMR via the resolver')
      return
    }
    setBusy(true)
    try {
      const patch = await fn(activeTune)
      await patchActive(Object.assign({}, patch, { reviewed: false }))
      toast.success(label + ' done')
    } catch (err) {
      toast.error((err && err.message) || String(err))
    } finally {
      setBusy(false)
    }
  }

  async function convertAllMissing() {
    if (!accessToken) {
      toast.error('Sign in required')
      return
    }
    const pending = tunes.filter(function(t) {
      return !(t.selectedCandidateId || String(t.abc || '').trim())
        && (t.midiUrl || t.pdfUrl)
    })
    if (!pending.length) {
      toast.info('All tunes already have ABC')
      return
    }
    setBusy(true)
    let ok = 0
    let fail = 0
    try {
      let nextTunes = tunes.slice()
      for (let i = 0; i < pending.length; i += 1) {
        const tune = pending[i]
        try {
          const patch = await convertSourceForTune(tune, accessToken)
          nextTunes = nextTunes.map(function(t) {
            return t.id === tune.id ? Object.assign({}, t, patch, { reviewed: false }) : t
          })
          ok += 1
          setReviewSet(Object.assign({}, reviewSet, {
            tunes: nextTunes,
            tallies: computeTallies(nextTunes),
          }))
        } catch (err) {
          fail += 1
          console.warn('convert failed', tune.slug, err)
        }
      }
      const updated = await updateOldtimeEnrichSet(Object.assign({}, reviewSet, {
        tunes: nextTunes,
        tallies: computeTallies(nextTunes),
      }))
      setReviewSet(updated)
      toast.success('Converted ' + ok + (fail ? (' (' + fail + ' failed)') : ''))
    } finally {
      setBusy(false)
    }
  }

  const candidates = (activeTune && activeTune.candidates) || []
  const currentMeter = readAbcMeter(abcDraft) || '4/4'
  const policy = (reviewSet && reviewSet.policy) || {}

  const checkTune = useMemo(function() {
    if (!abcDraft || !abcTools) return null
    try {
      const parsed = abcTools.abc2json(abcDraft)
      if (!parsed) return null
      parsed.id = (activeTune && activeTune.id) || 'oldtime-preview'
      parsed.name = (activeTune && activeTune.title) || 'Untitled'
      return buildNotationCheckTune(parsed)
    } catch (e) {
      return null
    }
  }, [abcDraft, abcTools, activeTune])

  const checkResults = useMemo(function() {
    if (!checkTune) {
      return { issues: [], completenessIssues: [], metadataIssues: [] }
    }
    return runNotationChecks(checkTune, {
      abcTools: abcTools,
      abcText: abcDraft,
      skipRenderAbc: true,
    })
  }, [checkTune, abcTools, abcDraft])

  const issues = checkResults.issues || []

  async function handleTuneSavedFromIssues(nextTune) {
    if (!nextTune || !abcTools || !activeTune) return
    try {
      let abc = abcTools.json2abc(nextTune)
      abc = rewrapAbcBarsPerLine(abc, 8)
      abc = safeAutofixMidiAbc(abc)
      pushUndo(abcDraft)
      setAbcDraft(abc)
      await patchActive({ abc: abc, abcSource: 'edited', reviewed: false, status: 'has_candidates' })
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    }
  }

  return (
    <div className="book-import-review-panel oldtime-enrich-review" data-testid="oldtime-enrich-review">
      <div className="bir-filter-bar oldtime-enrich-review-toolbar">
        <div className="bir-progress oldtime-enrich-review-tallies">
          <Badge bg="secondary">{tallies.total || 0} tunes</Badge>{' '}
          <Badge bg="success">{tallies.has_selection || 0} converted</Badge>{' '}
          <Badge bg="warning" text="dark">{tallies.needs_notation || 0} need convert</Badge>{' '}
          <Badge bg="info">{tallies.midi_available || 0} midi</Badge>{' '}
          <Badge bg="dark">{tallies.pdf_available || 0} pdf</Badge>
          {reviewSet && reviewSet.proof ? <Badge bg="primary" className="ms-1">proof</Badge> : null}
        </div>
        <ButtonGroup size="sm">
          <Button variant="outline-primary" disabled={busy} onClick={convertAllMissing}>
            Convert all missing
          </Button>
          <Button
            variant="outline-secondary"
            disabled={busy || !reviewSet}
            onClick={function() { downloadEnrichPackage(reviewSet) }}
          >
            Export package JSON
          </Button>
        </ButtonGroup>
      </div>

      <Alert variant="light" className="py-2 mb-2 small">
        Source versions only: convert from MIDI when present, otherwise OMR the PDF.
        No library or internet search. Duplicate titles (e.g. Dusty Miller settings) are kept.
        {policy.convert ? ' Policy: ' + policy.convert + '.' : null}
      </Alert>

      <div className="bir-body oldtime-enrich-review-layout">
        <div className="bir-tune-list oldtime-enrich-review-list">
          <Form.Control
            size="sm"
            className="mb-2 bir-name-filter"
            placeholder="Filter by title…"
            value={nameQuery}
            onChange={function(e) { setNameQuery(e.target.value) }}
          />
          <Form.Select
            size="sm"
            className="mb-2"
            value={statusFilter}
            onChange={function(e) { setStatusFilter(e.target.value) }}
          >
            <option value="all">All</option>
            <option value="needs_notation">Needs convert</option>
            <option value="has_candidates">Converted</option>
            <option value="unreviewed">Unreviewed</option>
            <option value="reviewed">Reviewed</option>
            <option value="midi_available">No ABC + MIDI</option>
            <option value="pdf_available">No ABC + PDF</option>
          </Form.Select>
          <ListGroup variant="flush" className="oldtime-enrich-review-tune-list">
            {visibleTunes.map(function(t) {
              const has = !!(t.selectedCandidateId || String(t.abc || '').trim())
              return (
                <ListGroup.Item
                  key={t.id}
                  action
                  active={activeTune && activeTune.id === t.id}
                  className={has ? 'complete' : ''}
                  onClick={function() { setActiveId(t.id) }}
                >
                  <div className="d-flex justify-content-between gap-2">
                    <span className="text-truncate">{t.title}</span>
                    <span className="oldtime-enrich-review-flags">
                      {has ? <Badge bg="success">ABC</Badge> : <Badge bg="warning" text="dark">—</Badge>}
                      {t.midiUrl ? <Badge bg="info">M</Badge> : null}
                      {t.pdfUrl ? <Badge bg="dark">P</Badge> : null}
                      {t.reviewed ? <Badge bg="secondary">✓</Badge> : null}
                    </span>
                  </div>
                  <small className="text-muted text-truncate d-block">
                    {sourceLabel(t)} · {t.section || t.slug}
                  </small>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        </div>

        <div className="bir-active oldtime-enrich-review-detail">
          {!activeTune ? (
            <p className="text-muted">Select a tune</p>
          ) : (
            <>
              <div className="d-flex flex-wrap align-items-start justify-content-between gap-2 mb-2">
                <div>
                  <h5 className="mb-1">{activeTune.title}</h5>
                  <p className="text-muted small mb-0">
                    {activeTune.notes || '—'}
                    {activeTune.key ? ' · K:' + activeTune.key : ''}
                    {' · prefer '}{sourceLabel(activeTune)}
                  </p>
                </div>
                <div className="d-flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="primary"
                    disabled={busy || !(activeTune.midiUrl || activeTune.pdfUrl)}
                    onClick={function() {
                      runAction('Convert source', function(t) {
                        return convertSourceForTune(t, accessToken)
                      })
                    }}
                  >
                    Convert source
                  </Button>
                  {activeTune.midiUrl ? (
                    <Button
                      size="sm"
                      variant="outline-primary"
                      disabled={busy}
                      onClick={function() {
                        runAction('MIDI', function(t) {
                          return convertMidiForTune(t, accessToken)
                        })
                      }}
                    >
                      MIDI
                    </Button>
                  ) : null}
                  {activeTune.pdfUrl ? (
                    <Button
                      size="sm"
                      variant="outline-dark"
                      disabled={busy}
                      onClick={function() {
                        runAction('OMR', function(t) {
                          return omrPdfForTune(t, accessToken, { forceSelect: true })
                        })
                      }}
                    >
                      OMR PDF
                    </Button>
                  ) : null}
                  <Button size="sm" variant="outline-warning" disabled={busy} onClick={handleClearNotation}>
                    Clear
                  </Button>
                  <Button
                    size="sm"
                    variant="success"
                    disabled={busy}
                    onClick={function() { patchActive({ reviewed: true }) }}
                  >
                    Mark reviewed
                  </Button>
                  {busy ? <Spinner animation="border" size="sm" /> : null}
                </div>
              </div>

              <div className="bir-cols oldtime-enrich-cols">
                <div className="oldtime-enrich-col">
                  <div className="oldtime-enrich-col-label">Source PDF</div>
                  <div className="oldtime-enrich-pdf-wrap">
                    {pdfLoading ? (
                      <div className="text-muted p-3"><Spinner size="sm" /> Loading PDF…</div>
                    ) : pdfError ? (
                      <div className="text-danger p-3 small">{pdfError}</div>
                    ) : pdfBlobUrl ? (
                      <iframe
                        title={'PDF ' + (activeTune.title || '')}
                        src={pdfBlobUrl}
                        className="oldtime-enrich-pdf-frame"
                      />
                    ) : (
                      <div className="text-muted p-3">No PDF URL</div>
                    )}
                  </div>
                </div>

                <div className="oldtime-enrich-col">
                  <div className="oldtime-enrich-col-label">Notation</div>
                  <div className="oldtime-enrich-preview">
                    {abcDraft && tunebook ? (
                      <Abc
                        tunebook={tunebook}
                        abc={abcDraft}
                        repeat={1}
                        hidePlayer={true}
                        staffwidth={720}
                      />
                    ) : (
                      <p className="text-muted p-2 mb-0">Convert source to see notation</p>
                    )}
                  </div>
                </div>

                <div className="oldtime-enrich-col">
                  <div className="oldtime-enrich-col-label">ABC tools</div>

                  {candidates.length > 1 ? (
                    <ListGroup className="mb-2 oldtime-enrich-review-cands">
                      {candidates.map(function(c) {
                        const active = activeTune.selectedCandidateId === c.id
                        return (
                          <ListGroup.Item
                            key={c.id}
                            action
                            active={active}
                            className="py-1 small"
                            onClick={function() { handleSelectCandidate(c) }}
                          >
                            <Badge bg={isOmrSource(c) ? 'dark' : 'primary'} className="me-1">
                              {c.source}
                            </Badge>
                            {Math.round((Number(c.score) || 0) * 100)}%
                          </ListGroup.Item>
                        )
                      })}
                    </ListGroup>
                  ) : null}

                  <ButtonGroup size="sm" className="flex-wrap mb-2">
                    <Button
                      variant="outline-secondary"
                      disabled={!abcDraft}
                      onClick={function() {
                        applyAbcTransform(function(abc) { return safeAutofixMidiAbc(abc) })
                      }}
                    >
                      Safe autofix
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!abcDraft}
                      onClick={function() {
                        applyAbcTransform(function(abc) { return transposeAbcText(abc, 1) })
                      }}
                    >
                      Trans +1
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!abcDraft}
                      onClick={function() {
                        applyAbcTransform(function(abc) { return transposeAbcText(abc, -1) })
                      }}
                    >
                      Trans −1
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!abcDraft || !abcTools}
                      onClick={function() {
                        applyAbcTransform(function(abc) {
                          return scaleAbcNoteLengths(abc, 0.5, abcTools)
                        })
                      }}
                    >
                      Halve
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!abcDraft || !abcTools}
                      onClick={function() {
                        applyAbcTransform(function(abc) {
                          return scaleAbcNoteLengths(abc, 2, abcTools)
                        })
                      }}
                    >
                      Double
                    </Button>
                    <Button
                      variant="outline-secondary"
                      disabled={!undoStack.length}
                      onClick={handleUndoAbc}
                    >
                      Undo
                    </Button>
                  </ButtonGroup>

                  <Form.Group className="mb-2" style={{ maxWidth: '8rem' }}>
                    <Form.Label className="small mb-0">Meter</Form.Label>
                    <Form.Select
                      size="sm"
                      value={currentMeter}
                      disabled={!abcDraft}
                      onChange={function(e) {
                        const meter = e.target.value
                        applyAbcTransform(function(abc) { return setAbcMeter(abc, meter) })
                      }}
                    >
                      {METER_OPTIONS.indexOf(currentMeter) < 0 ? (
                        <option value={currentMeter}>{currentMeter}</option>
                      ) : null}
                      {METER_OPTIONS.map(function(m) {
                        return <option key={m} value={m}>{m}</option>
                      })}
                    </Form.Select>
                  </Form.Group>

                  <Form.Control
                    as="textarea"
                    className="oldtime-enrich-abc-textarea mb-2"
                    rows={12}
                    value={abcDraft}
                    onChange={function(e) { handleAbcChange(e.target.value) }}
                    spellCheck={false}
                  />

                  {checkTune ? (
                    <NotationIssuesPanel
                      inline
                      tune={checkTune}
                      tunebook={tunebook}
                      issues={issues}
                      checkResults={checkResults}
                      onTuneSaved={handleTuneSavedFromIssues}
                    />
                  ) : null}
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}
