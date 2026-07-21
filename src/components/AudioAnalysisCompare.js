import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react'
import { Alert, Button, Form, Table, Card, Row, Col, Spinner, Badge, Nav } from 'react-bootstrap'
import { listGroups, listSets, getNoteAudioBlob } from '../soundpostSetStore'
import {
  summarizeSetFeatures,
  deltaSummary,
  recommendSoundpostMoves,
  timbreChipsFromDelta,
  playingQcWarnings,
  averageMelBands,
  mfccDistance
} from '../soundpostAnalysis'
import { TUNER_INSTRUMENT_LABELS } from '../instrumentTuningPresets'
import { downloadAudioAnalysisComparePdf } from '../generateAudioAnalysisComparePdf'
import ShareAudioAnalysisCompareModal from './ShareAudioAnalysisCompareModal'
import { labelLikelyModes, tapPeakShifts } from '../audioAnalysisTapCapture'
import { drawSpectrum, drawSaunders, drawPerNoteHighlights } from '../audioAnalysisCompareCharts'

const ALL_GROUPS = '__all__'
const UNGROUPED = '__ungrouped__'

function fmt(n, digits) {
  if (n == null || !Number.isFinite(n)) return '—'
  return n.toFixed(digits != null ? digits : 1)
}

function fmtDelta(n, digits, unit) {
  if (n == null || !Number.isFinite(n)) return '—'
  const sign = n > 0 ? '+' : ''
  return sign + n.toFixed(digits != null ? digits : 1) + (unit || '')
}

function DeltaHint(props) {
  return (
    <p className="small text-muted mb-3">
      All numbers are <strong>B − A</strong> (candidate minus baseline). Positive means B is higher or has more of that quality.
      {props.extra ? ' ' + props.extra : ''}
    </p>
  )
}

export default function AudioAnalysisCompare(props) {
  const sharedMode = !!props.sharedMode
  const [groups, setGroups] = useState([])
  const [sets, setSets] = useState([])
  const [groupFilter, setGroupFilter] = useState(ALL_GROUPS)
  const [baselineId, setBaselineId] = useState('')
  const [candidateId, setCandidateId] = useState('')
  const spectrumRef = useRef(null)
  const saundersRef = useRef(null)
  const perNoteRef = useRef(null)
  const [pdfBusy, setPdfBusy] = useState(false)
  const [pdfError, setPdfError] = useState(null)
  const [tab, setTab] = useState('overview')

  useEffect(function() {
    if (sharedMode) return
    Promise.all([listGroups(), listSets()]).then(function(pair) {
      setGroups(pair[0])
      setSets(pair[1])
    })
  }, [props.refreshKey, sharedMode])

  const filteredSets = useMemo(function() {
    if (sharedMode) return []
    if (groupFilter === ALL_GROUPS) return sets
    if (groupFilter === UNGROUPED) return sets.filter(function(s) { return !s.groupId })
    return sets.filter(function(s) { return s.groupId === groupFilter })
  }, [sets, groupFilter, sharedMode])

  const baseline = useMemo(function() {
    if (sharedMode) return props.sharedBaseline || null
    return sets.find(function(s) { return s.id === baselineId }) || null
  }, [sets, baselineId, sharedMode, props.sharedBaseline])

  const candidate = useMemo(function() {
    if (sharedMode) return props.sharedCandidate || null
    return sets.find(function(s) { return s.id === candidateId }) || null
  }, [sets, candidateId, sharedMode, props.sharedCandidate])

  const bothTap = baseline && candidate &&
    baseline.measurementMode === 'tap' && candidate.measurementMode === 'tap'
  const bothBowed = baseline && candidate &&
    (baseline.measurementMode || 'bowed') === 'bowed' &&
    (candidate.measurementMode || 'bowed') === 'bowed'

  const baseSummary = useMemo(function() {
    return baseline ? summarizeSetFeatures(baseline.notes) : null
  }, [baseline])

  const candSummary = useMemo(function() {
    return candidate ? summarizeSetFeatures(candidate.notes) : null
  }, [candidate])

  const delta = useMemo(function() {
    if (!baseSummary || !candSummary) return null
    return deltaSummary(baseSummary, candSummary)
  }, [baseSummary, candSummary])

  const chips = useMemo(function() {
    return delta ? timbreChipsFromDelta(delta) : []
  }, [delta])

  const qc = useMemo(function() {
    return baseSummary && candSummary ? playingQcWarnings(baseSummary, candSummary) : []
  }, [baseSummary, candSummary])

  const timbreDist = useMemo(function() {
    if (!baseline || !candidate) return null
    return mfccDistance(averageMelBands(baseline.notes), averageMelBands(candidate.notes))
  }, [baseline, candidate])

  const tapShifts = useMemo(function() {
    if (!bothTap) return []
    const a = labelLikelyModes(baseline.tapPeaks || [])
    const b = labelLikelyModes(candidate.tapPeaks || [])
    return tapPeakShifts(a, b)
  }, [bothTap, baseline, candidate])

  const tapShiftsR = useMemo(function() {
    if (!bothTap) return []
    if (!(baseline.tapPeaksR || []).length && !(candidate.tapPeaksR || []).length) return []
    const a = labelLikelyModes(baseline.tapPeaksR || [])
    const b = labelLikelyModes(candidate.tapPeaksR || [])
    return tapPeakShifts(a, b)
  }, [bothTap, baseline, candidate])

  const hasStereoTap = bothTap && (
    baseline.channelCount === 2 || candidate.channelCount === 2 ||
    (baseline.tapPeaksR || []).length > 0 || (candidate.tapPeaksR || []).length > 0 ||
    (baseline.notes || []).some(function(n) { return n.featuresR }) ||
    (candidate.notes || []).some(function(n) { return n.featuresR })
  )

  const recommendations = useMemo(function() {
    if (!delta || !baseline || !candidate) return null
    if (!bothBowed) return null
    return recommendSoundpostMoves(delta, {
      instrumentA: baseline.instrument,
      instrumentB: candidate.instrument
    })
  }, [delta, baseline, candidate, bothBowed])

  const instrumentWarn = baseline && candidate && baseline.instrument !== candidate.instrument

  const redrawCharts = useCallback(function() {
    if (!baseline || !candidate) return
    drawSpectrum(spectrumRef.current, baseline, candidate, { fromSets: true })
    drawSaunders(saundersRef.current, baseline.notes, candidate.notes)
    drawPerNoteHighlights(perNoteRef.current, baseline.notes, candidate.notes)
  }, [baseline, candidate])

  useEffect(function() {
    redrawCharts()
  }, [redrawCharts])

  useEffect(function() {
    if (tab !== 'overview') return
    const id = requestAnimationFrame(redrawCharts)
    return function() { cancelAnimationFrame(id) }
  }, [tab, redrawCharts])

  async function playNoteFromDrive(note) {
    if (!note || !note.driveFileId || !props.driveApi) return false
    let blob = await props.driveApi.getPublicDocumentBlob(note.driveFileId)
    if (blob && blob.error) {
      if (props.login && (!props.token || !props.token.access_token)) {
        props.login()
        return false
      }
      if (typeof props.driveApi.getDocumentBlob === 'function') {
        blob = await props.driveApi.getDocumentBlob(note.driveFileId)
      }
    }
    if (!blob || blob.error) return false
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = function() { URL.revokeObjectURL(url) }
    await audio.play()
    return true
  }

  async function playNote(setObj, note) {
    if (!note) return
    if (note.driveFileId && props.driveApi) {
      const ok = await playNoteFromDrive(note)
      if (ok) return
    }
    if (!note.audioBlobKey) return
    const blob = await getNoteAudioBlob(note.audioBlobKey)
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const audio = new Audio(url)
    audio.onended = function() { URL.revokeObjectURL(url) }
    audio.play()
  }

  useEffect(function() {
    if (!sharedMode || !props.autoPlayRequest) return
    const side = props.autoPlayRequest.side
    const noteName = props.autoPlayRequest.note
    if (!side || !noteName || !baseline || !candidate) return
    const setObj = side === 'b' ? candidate : baseline
    const note = (setObj.notes || []).find(function(n) { return n && n.targetNote === noteName })
    if (note) playNote(setObj, note)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sharedMode, baseline, candidate, props.autoPlayRequest])

  const pairedNotes = useMemo(function() {
    if (!baseline || !candidate) return []
    const mapB = {}
    ;(candidate.notes || []).forEach(function(n) {
      mapB[n.targetNote] = n
    })
    return (baseline.notes || []).map(function(a) {
      return { a: a, b: mapB[a.targetNote] || null }
    })
  }, [baseline, candidate])

  return (
    <div className="audio-analysis-compare">
      {!sharedMode ? (
        <>
          <div className="d-flex flex-wrap gap-2 mb-3 align-items-end">
            <Form.Group>
              <Form.Label className="small mb-0">Group filter</Form.Label>
              <Form.Select
                value={groupFilter}
                onChange={function(e) { setGroupFilter(e.target.value) }}
                style={{ minWidth: '10rem' }}
              >
                <option value={ALL_GROUPS}>All groups</option>
                <option value={UNGROUPED}>Ungrouped</option>
                {groups.map(function(g) {
                  return <option key={g.id} value={g.id}>{g.label}</option>
                })}
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label className="small mb-0">Baseline (A)</Form.Label>
              <Form.Select
                value={baselineId}
                onChange={function(e) { setBaselineId(e.target.value) }}
                style={{ minWidth: '12rem' }}
              >
                <option value="">Select…</option>
                {filteredSets.map(function(s) {
                  const mode = s.measurementMode === 'tap' ? ' [tap]' : ''
                  return <option key={s.id} value={s.id}>{s.label}{mode}</option>
                })}
              </Form.Select>
            </Form.Group>
            <Form.Group>
              <Form.Label className="small mb-0">Candidate (B)</Form.Label>
              <Form.Select
                value={candidateId}
                onChange={function(e) { setCandidateId(e.target.value) }}
                style={{ minWidth: '12rem' }}
              >
                <option value="">Select…</option>
                {filteredSets.map(function(s) {
                  const mode = s.measurementMode === 'tap' ? ' [tap]' : ''
                  return <option key={s.id} value={s.id}>{s.label}{mode}</option>
                })}
              </Form.Select>
            </Form.Group>
            <Button variant="secondary" onClick={function() { if (props.onBack) props.onBack() }}>
              Back
            </Button>
            {baseline && candidate ? (
              <>
                <Button
                  variant="outline-primary"
                  disabled={pdfBusy}
                  onClick={async function() {
                    setPdfError(null)
                    setPdfBusy(true)
                    try {
                      await downloadAudioAnalysisComparePdf({
                        baseline: baseline,
                        candidate: candidate
                      })
                    } catch (err) {
                      setPdfError((err && err.message) || String(err))
                    } finally {
                      setPdfBusy(false)
                    }
                  }}
                >
                  {pdfBusy ? <span><Spinner animation="border" size="sm" className="me-1" /> PDF</span> : 'Download PDF'}
                </Button>
                <ShareAudioAnalysisCompareModal
                  baseline={baseline}
                  candidate={candidate}
                  driveApi={props.driveApi}
                  token={props.token}
                  login={props.login}
                  copyText={props.copyText}
                />
              </>
            ) : null}
          </div>
          {pdfError ? <Alert variant="danger" className="py-2">{pdfError}</Alert> : null}
        </>
      ) : null}

      {!baseline || !candidate || !delta ? (
        <p className="text-muted">Select two sets to compare.</p>
      ) : (
        <div>
          {instrumentWarn ? (
            <Alert variant="warning">
              Instruments differ ({TUNER_INSTRUMENT_LABELS[baseline.instrument] || baseline.instrument}
              {' vs '}
              {TUNER_INSTRUMENT_LABELS[candidate.instrument] || candidate.instrument}).
              Compare overlapping pitches only; treat results as relative tonality.
            </Alert>
          ) : null}
          <Alert variant="info" className="small">
            {bothTap
              ? 'Tap compare: look at body-mode peak shifts. Keep phone position and tap spot identical.'
              : 'Bow force and mic distance strongly affect brightness and level. Prefer matched playing conditions.'}
          </Alert>

          {chips.length ? (
            <div className="mb-3">
              <div className="small text-muted mb-1">
                Quick readout — each badge compares candidate <strong>B</strong> to baseline <strong>A</strong>:
              </div>
              <div className="d-flex flex-wrap gap-2">
                {chips.map(function(c) {
                  return <Badge key={c} bg="primary" className="fs-6">{c}</Badge>
                })}
                {timbreDist != null ? (
                  <Badge bg="secondary" className="fs-6">
                    Overall timbre distance {timbreDist.toFixed(1)}
                    {timbreDist < 3 ? ' (low change)' : timbreDist < 8 ? ' (moderate)' : ' (large change)'}
                  </Badge>
                ) : null}
              </div>
            </div>
          ) : null}

          <Nav variant="tabs" activeKey={tab} onSelect={function(k) { setTab(k || 'overview') }} className="mb-3">
            <Nav.Item><Nav.Link eventKey="overview">Overview</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="timbre">Timbre</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="playability">Playability</Nav.Link></Nav.Item>
            <Nav.Item><Nav.Link eventKey="qc">QC</Nav.Link></Nav.Item>
            {bothTap ? <Nav.Item><Nav.Link eventKey="modes">Body modes</Nav.Link></Nav.Item> : null}
          </Nav>

          {tab === 'timbre' ? (
            <Card className="mb-3">
              <Card.Body>
                <h6 className="mb-2">What is timbre?</h6>
                <p className="small mb-3">
                  Timbre is the <em>colour</em> of the sound — brightness, buzz, warmth — separate from loudness or pitch.
                  These metrics are averaged across all notes in each set, then compared as <strong>B − A</strong>.
                </p>
                <ul className="small text-muted mb-3">
                  <li><strong>Centroid</strong> — where most spectral energy sits. Higher = brighter, edgier tone.</li>
                  <li><strong>Rolloff</strong> — frequency below which most energy is contained. Higher = more open / extended highs.</li>
                  <li><strong>Flatness</strong> — noise-like vs tonal. Higher = scratchier, breathier, or less focused.</li>
                  <li><strong>Sharpness</strong> — emphasis on harsh high frequencies. Higher = more bite or glare.</li>
                  <li><strong>Spread</strong> — how wide energy is around the centroid. Higher = more diffuse tone.</li>
                  <li><strong>Richness</strong> — overtone strength vs fundamental. Higher = fuller, more complex tone.</li>
                </ul>
                <DeltaHint extra="A small change in centroid (±60 Hz) or richness (±0.12) is enough to show a summary badge above." />
                <Row className="g-2">
                  <Col md={4}><Card body><div className="small text-muted">Centroid Δ (brightness)</div><strong>{fmtDelta(delta.centroidHz, 0, ' Hz')}</strong><div className="small text-muted">+ = B brighter</div></Card></Col>
                  <Col md={4}><Card body><div className="small text-muted">Rolloff Δ</div><strong>{fmtDelta(delta.spectralRolloffHz, 0, ' Hz')}</strong><div className="small text-muted">+ = B more open</div></Card></Col>
                  <Col md={4}><Card body><div className="small text-muted">Flatness Δ</div><strong>{fmtDelta(delta.spectralFlatness, 3)}</strong><div className="small text-muted">+ = B noisier</div></Card></Col>
                  <Col md={4}><Card body><div className="small text-muted">Sharpness Δ</div><strong>{fmtDelta(delta.perceptualSharpness, 3)}</strong><div className="small text-muted">+ = B sharper</div></Card></Col>
                  <Col md={4}><Card body><div className="small text-muted">Spread Δ</div><strong>{fmtDelta(delta.spectralSpreadHz, 0, ' Hz')}</strong><div className="small text-muted">+ = B broader</div></Card></Col>
                  <Col md={4}><Card body><div className="small text-muted">Richness Δ</div><strong>{fmtDelta(delta.richness, 2)}</strong><div className="small text-muted">+ = B richer</div></Card></Col>
                </Row>
              </Card.Body>
            </Card>
          ) : null}

          {tab === 'playability' ? (
            <Card className="mb-3">
              <Card.Body>
                <h6 className="mb-2">What is playability?</h6>
                <p className="small mb-3">
                  Playability measures how <em>willingly</em> each note speaks under the bow — pitch steadiness, how long you
                  held in tune, and notes that fight back (wolves). Again, all deltas are <strong>B − A</strong>.
                </p>
                <ul className="small text-muted mb-3">
                  <li><strong>Stability (¢ std)</strong> — pitch wobble during the held note. Lower is steadier; positive Δ means B wobbles more.</li>
                  <li><strong>In-tune ratio</strong> — fraction of the capture within ±15¢ of target. Higher is better; positive Δ means B locked in tune more.</li>
                  <li><strong>Problem-note score</strong> — combines instability, noise, and wolf-like behaviour. Lower is better; positive Δ means B has more problem notes.</li>
                  <li><strong>Flux</strong> — how much the spectrum changes over the note. High flux can mean scratchiness or inconsistent bowing.</li>
                </ul>
                <DeltaHint />
                <Row className="g-2">
                  <Col md={4}><Card body><div className="small text-muted">Stability Δ (¢ std)</div><strong>{fmtDelta(delta.f0StdCents, 2, ' ¢')}</strong><div className="small text-muted">+ = B less steady</div></Card></Col>
                  <Col md={4}><Card body><div className="small text-muted">In-tune ratio Δ</div><strong>{fmtDelta(delta.inTuneRatio, 2)}</strong><div className="small text-muted">+ = B more in tune</div></Card></Col>
                  <Col md={4}><Card body><div className="small text-muted">Problem-note Δ</div><strong>{fmtDelta(delta.wolfMean, 2)}</strong><div className="small text-muted">+ = B more wolfy</div></Card></Col>
                  <Col md={4}><Card body><div className="small text-muted">Flux Δ</div><strong>{fmtDelta(delta.spectralFlux, 3)}</strong><div className="small text-muted">+ = B more variable</div></Card></Col>
                </Row>
              </Card.Body>
            </Card>
          ) : null}

          {tab === 'qc' ? (
            <Card className="mb-3">
              <Card.Body>
                <p className="small text-muted mb-3">
                  QC checks whether <em>playing conditions</em> might explain the difference rather than the soundpost move.
                  Large level or flux gaps suggest bow force, mic distance, or room noise differed between sets.
                </p>
                {qc.length ? (
                  <ul className="mb-0">{qc.map(function(w, i) { return <li key={i}>{w}</li> })}</ul>
                ) : (
                  <p className="mb-0 text-muted">No major playing-consistency warnings between these sets.</p>
                )}
              </Card.Body>
            </Card>
          ) : null}

          {tab === 'modes' && bothTap ? (
            <Card className="mb-3">
              <Card.Body>
                <p className="small text-muted">
                  Peaks clustered across taps. Labels (A0 / B1±) are educated guesses from typical violin ranges.
                  {hasStereoTap
                    ? ' Solid L = radiated mic; R = piezo/contact when stereo was recorded.'
                    : ''}
                </p>
                <h6 className="h6">{hasStereoTap ? 'Radiated mic (L)' : 'Peaks'}</h6>
                {!tapShifts.length ? (
                  <p className="text-muted">No matching peaks within tolerance — check tap consistency.</p>
                ) : (
                  <Table size="sm" bordered>
                    <thead><tr><th>Mode</th><th>A Hz</th><th>B Hz</th><th>Δ Hz</th></tr></thead>
                    <tbody>
                      {tapShifts.map(function(s, i) {
                        return (
                          <tr key={i}>
                            <td>{s.label}</td>
                            <td>{s.fromHz.toFixed(1)}</td>
                            <td>{s.toHz.toFixed(1)}</td>
                            <td>{fmtDelta(s.deltaHz, 1)}</td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </Table>
                )}
                {hasStereoTap ? (
                  <>
                    <h6 className="h6 mt-3">Piezo / contact (R)</h6>
                    {!tapShiftsR.length ? (
                      <p className="text-muted mb-0">No matching R-channel peaks within tolerance.</p>
                    ) : (
                      <Table size="sm" bordered className="mb-0">
                        <thead><tr><th>Mode</th><th>A Hz</th><th>B Hz</th><th>Δ Hz</th></tr></thead>
                        <tbody>
                          {tapShiftsR.map(function(s, i) {
                            return (
                              <tr key={i}>
                                <td>{s.label}</td>
                                <td>{s.fromHz.toFixed(1)}</td>
                                <td>{s.toHz.toFixed(1)}</td>
                                <td>{fmtDelta(s.deltaHz, 1)}</td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </Table>
                    )}
                  </>
                ) : null}
              </Card.Body>
            </Card>
          ) : null}

          {(tab === 'overview' || !tab) ? (
          <>
          <DeltaHint />
          <Row className="g-3 mb-3">
            <Col md={3}>
              <Card body>
                <div className="small text-muted">Bass Δ</div>
                <strong>{fmtDelta(delta.bandDb.bass, 1, ' dB')}</strong>
              </Card>
            </Col>
            <Col md={3}>
              <Card body>
                <div className="small text-muted">Body Δ</div>
                <strong>{fmtDelta(delta.bandDb.body, 1, ' dB')}</strong>
              </Card>
            </Col>
            <Col md={3}>
              <Card body>
                <div className="small text-muted">Presence Δ</div>
                <strong>{fmtDelta(delta.bandDb.presence, 1, ' dB')}</strong>
              </Card>
            </Col>
            <Col md={3}>
              <Card body>
                <div className="small text-muted">Richness Δ</div>
                <strong>{fmtDelta(delta.richness, 2)}</strong>
              </Card>
            </Col>
            <Col md={3}>
              <Card body>
                <div className="small text-muted">Level Δ</div>
                <strong>{fmtDelta(delta.rmsDb, 1, ' dB')}</strong>
              </Card>
            </Col>
            <Col md={3}>
              <Card body>
                <div className="small text-muted">Centroid Δ</div>
                <strong>{fmtDelta(delta.centroidHz, 0, ' Hz')}</strong>
              </Card>
            </Col>
            <Col md={3}>
              <Card body>
                <div className="small text-muted">Stability Δ (¢ std)</div>
                <strong>{fmtDelta(delta.f0StdCents, 2, ' ¢')}</strong>
              </Card>
            </Col>
            <Col md={3}>
              <Card body>
                <div className="small text-muted">Problem-note score Δ</div>
                <strong>{fmtDelta(delta.wolfMean, 2)}</strong>
              </Card>
            </Col>
          </Row>

          {recommendations ? (
            <Card className="mb-3 border-primary">
              <Card.Header>Soundpost recommendations</Card.Header>
              <Card.Body>
                <ul className="mb-2">
                  {recommendations.bullets.map(function(b, i) {
                    return <li key={i}>{b}</li>
                  })}
                </ul>
                <p className="small text-muted mb-0">{recommendations.disclaimer}</p>
              </Card.Body>
            </Card>
          ) : (
            <Alert variant="secondary" className="small">
              Soundpost positioning suggestions are shown only when both sets are violin, viola, cello, or double bass.
            </Alert>
          )}

          <div className={tab === 'overview' || !tab ? 'mb-3' : 'visually-hidden'} aria-hidden={tab !== 'overview' && !!tab}>
            <Row>
              <Col md={6}>
                <h6>Average spectrum (to 4 kHz)</h6>
                <p className="small text-muted">
                  Blue = baseline A (L), red = candidate B (L).
                  {hasStereoTap ? ' Dashed darker lines = piezo R when present.' : ''}
                  {' '}Higher curve = more energy at that frequency.
                </p>
                <canvas ref={spectrumRef} width={520} height={200} style={{ width: '100%', maxWidth: 520, border: '1px solid #dee2e6' }} />
              </Col>
              <Col md={6}>
                <h6>Saunders-style level curve</h6>
                <p className="small text-muted">Loudness at each note index. Look for evenness across the range — spikes or dips show uneven response.</p>
                <canvas ref={saundersRef} width={520} height={200} style={{ width: '100%', maxWidth: 520, border: '1px solid #dee2e6' }} />
              </Col>
            </Row>
            <Row>
              <Col md={12}>
                <h6>Per-note highlight graph</h6>
                <p className="small text-muted">
                  Each vertical bar shows per-note level change (<strong>B - A</strong>). Red upward bars mean B is louder;
                  blue downward bars mean A is louder. Black dots show richness change on the same note, scaled for visibility.
                  This is the fastest way to spot which individual notes improved, got weaker, or changed colour.
                </p>
                <canvas ref={perNoteRef} width={760} height={220} style={{ width: '100%', maxWidth: 760, border: '1px solid #dee2e6' }} />
              </Col>
            </Row>
          </div>

          <h6>Per-note comparison</h6>
          <div className="table-responsive">
            <Table striped bordered size="sm">
              <thead>
                <tr>
                  <th>Note</th>
                  <th>A level</th>
                  <th>B level</th>
                  <th>Δ dB</th>
                  <th>A rich</th>
                  <th>B rich</th>
                  <th>A stab ¢</th>
                  <th>B stab ¢</th>
                  <th>Wolf B</th>
                  <th>Play</th>
                </tr>
              </thead>
              <tbody>
                {pairedNotes.map(function(row) {
                  const fa = row.a && row.a.features
                  const fb = row.b && row.b.features
                  const dRms = fa && fb && fa.rmsDb != null && fb.rmsDb != null ? fb.rmsDb - fa.rmsDb : null
                  const problem = fb && fb.wolfScore != null && fb.wolfScore >= 0.35
                  return (
                    <tr key={row.a.targetNote} className={problem ? 'table-warning' : undefined}>
                      <td>{row.a.targetNote}</td>
                      <td>{fmt(fa && fa.rmsDb)}</td>
                      <td>{fmt(fb && fb.rmsDb)}</td>
                      <td>{fmtDelta(dRms, 1)}</td>
                      <td>{fmt(fa && fa.richness, 2)}</td>
                      <td>{fmt(fb && fb.richness, 2)}</td>
                      <td>{fmt(fa && fa.f0StdCents, 2)}</td>
                      <td>{fmt(fb && fb.f0StdCents, 2)}</td>
                      <td>{fmt(fb && fb.wolfScore, 2)}</td>
                      <td>
                        <Button size="sm" variant="outline-secondary" className="me-1" onClick={function() { playNote(baseline, row.a) }}>A</Button>
                        {row.b ? (
                          <Button size="sm" variant="outline-danger" onClick={function() { playNote(candidate, row.b) }}>B</Button>
                        ) : null}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </Table>
          </div>
          </>
          ) : null}
        </div>
      )}
    </div>
  )
}
