import { useEffect, useMemo, useState } from 'react'
import { Alert, Button, Form, ListGroup, Modal } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { parseChordSheetText, exportTuneToChordPro } from '../chordProFormatUtils'
import { buildMeterMergeOptions } from '../applyChordSheetToTune'
import { buildChordKeyMergeOptions } from '../chordKeyMergeOptions'
import {
  buildTuneSectionsFromPaste,
  listPasteChordSections,
  matchPasteSectionToTune,
  rebuildChordGridFromSections,
  firstSectionMeter,
  stripMeterMarkers,
} from '../chordsEditorSections'
import { hasChordLines } from '../chordSheetUtils'
import './PasteChordSheetModal.css'

const PASTE_CHORD_SHEET_PLACEHOLDER = [
  '[Verse 1]',
  'Am              F',
  'The language of love',
  'Dm                    G',
  'Slips from my lover\'s tongue',
  '',
  '[Chorus]',
  'C        G           Am       F',
  'Who\'s that girl running around with you',
  'C        G           F',
  'Who\'s that girl, what can I do',
].join('\n')

function normalizeChartForCompare(chart) {
  return stripMeterMarkers(chart || '')
    .replace(/\s+/g, ' ')
    .replace(/\s*\|\s*/g, '|')
    .trim()
    .toLowerCase()
}

function chartsAreIdentical(a, b) {
  return normalizeChartForCompare(a) === normalizeChartForCompare(b)
}

/**
 * Paste a chord sheet. Always replaces existing ABC notation with a scaffold
 * from the paste. Optional checkbox also replaces plain + note-aligned lyrics
 * unless forceUpdateLyrics is set (lyrics tab), which always updates lyrics.
 */
export default function PasteChordSheetModal(props) {
  const show = !!props.show
  const tune = props.tune || {}
  const tuneSections = Array.isArray(props.tuneSections) ? props.tuneSections : []
  const forceUpdateLyrics = !!props.forceUpdateLyrics
  const [pasteText, setPasteText] = useState('')
  const [pasteError, setPasteError] = useState('')
  const [meterAssumedNotice, setMeterAssumedNotice] = useState('')
  const [parsed, setParsed] = useState(null)
  const [pending, setPending] = useState(null)
  const [meterMergeOptions, setMeterMergeOptions] = useState([])
  const [keyMergeOptions, setKeyMergeOptions] = useState([])
  const [pendingAction, setPendingAction] = useState(null)
  const [updateLyrics, setUpdateLyrics] = useState(false)
  const [clipboardBusy, setClipboardBusy] = useState(false)

  useEffect(function() {
    if (!show) return
    setPasteError('')
    setMeterAssumedNotice('')
    setParsed(null)
    setPending(null)
    setMeterMergeOptions([])
    setKeyMergeOptions([])
    setPendingAction(null)
    setUpdateLyrics(forceUpdateLyrics || !!props.initialUpdateLyrics)
    setClipboardBusy(false)
    if (props.initialText != null && String(props.initialText).trim()) {
      setPasteText(String(props.initialText))
      return
    }
    try {
      const exported = exportTuneToChordPro(tune)
      // Prefer empty textarea (shows chord+lyric placeholder) when the export
      // is only stanza headers / lyrics with no chord symbols.
      setPasteText(exported && hasChordLines(String(exported).split(/\r?\n/)) ? exported : '')
    } catch (e) {
      setPasteText('')
    }
  }, [show])

  const pasteSections = useMemo(function() {
    if (!parsed) return []
    return listPasteChordSections(parsed)
  }, [parsed])

  function detectSections() {
    setPasteError('')
    setMeterAssumedNotice('')
    try {
      const next = parseChordSheetText(pasteText, { fallbackTitle: tune.name })
      setParsed(next)
      const meterDecision = buildMeterMergeOptions(next.meter, tune.meter)
      if (meterDecision.assumedDefault && meterDecision.options[0]) {
        setMeterAssumedNotice(meterDecision.options[0].rationale || 'Assumed 4/4')
      }
    } catch (e) {
      setParsed(null)
      setPasteError(e && e.message ? e.message : 'Could not parse chord sheet')
    }
  }

  useEffect(function() {
    if (!show || !String(pasteText || '').trim()) {
      setParsed(null)
      return
    }
    const handle = window.setTimeout(detectSections, 300)
    return function() { window.clearTimeout(handle) }
  }, [pasteText, show])

  function buildMeta(source) {
    return {
      title: source.title,
      name: source.title,
      composer: source.composer,
      key: source.key,
      capo: source.capo,
      tempo: source.tempo,
      meter: source.meter,
      chordProSource: source.chordProSource,
    }
  }

  function effectiveUpdateLyrics() {
    return forceUpdateLyrics || updateLyrics
  }

  function buildKeyOptions(chordGridText, sheetKey, capo) {
    return buildChordKeyMergeOptions({
      chordGridText: chordGridText,
      notationKey: tune.key,
      sheetKey: sheetKey,
      capo: capo,
      noteLines: tune.voices && Object.keys(tune.voices).length
        ? (tune.voices[Object.keys(tune.voices)[0]].notes || [])
        : [],
    })
  }

  function lyricLinesFromSource(source) {
    if (!source) return []
    if (Array.isArray(source.lyricLines) && source.lyricLines.length) {
      return source.lyricLines.slice()
    }
    const sections = listPasteChordSections(source)
    const lines = []
    sections.forEach(function(section, index) {
      if (section.header) lines.push(section.header)
      ;(section.lyricLines || []).forEach(function(line) { lines.push(line) })
      if (index < sections.length - 1) lines.push('')
    })
    return lines
  }

  function commitSections(nextSections, source, overrides) {
    const opts = overrides || {}
    const grid = rebuildChordGridFromSections(nextSections)
    const meter = firstSectionMeter(nextSections, tune.meter)
    const doLyrics = opts.updateLyrics != null ? opts.updateLyrics : effectiveUpdateLyrics()
    if (typeof props.onSaveSections === 'function') {
      props.onSaveSections({
        sections: nextSections,
        chordGridText: grid,
        meta: buildMeta(source),
        chordSheetAlignment: source.chordSheetAlignment,
        chordProSource: source.chordProSource,
        selectedMeterOption: opts.selectedMeterOption || { meter: meter, id: 'first-section' },
        selectedKeyOption: opts.selectedKeyOption || null,
        historyLabel: opts.historyLabel
          || (doLyrics ? 'Paste chords and lyrics' : 'Paste chords'),
        wipeNotation: true,
        updateLyrics: !!doLyrics,
        lyricLines: doLyrics ? lyricLinesFromSource(source) : undefined,
      })
    }
    if (typeof props.onHide === 'function') props.onHide()
  }

  function startCommit(nextSections, source, historyLabel) {
    const meterDecision = buildMeterMergeOptions(source.meter, tune.meter)
    const keyOptions = buildKeyOptions(
      rebuildChordGridFromSections(nextSections),
      source.key,
      source.capo
    )
    const payload = {
      nextSections: nextSections,
      source: source,
      historyLabel: historyLabel,
      selectedMeterOption: meterDecision.options[0] || { meter: firstSectionMeter(nextSections, tune.meter) },
      selectedKeyOption: keyOptions[0] || null,
      updateLyrics: effectiveUpdateLyrics(),
    }
    if (meterDecision.options.length > 1) {
      setPending(payload)
      setPendingAction('commit')
      setMeterMergeOptions(meterDecision.options)
      setKeyMergeOptions(keyOptions.length > 1 ? keyOptions : [])
      return
    }
    if (keyOptions.length > 1) {
      setPending(payload)
      setPendingAction('commit')
      setKeyMergeOptions(keyOptions)
      return
    }
    commitSections(nextSections, source, {
      selectedMeterOption: payload.selectedMeterOption,
      selectedKeyOption: payload.selectedKeyOption,
      historyLabel: historyLabel,
      updateLyrics: effectiveUpdateLyrics(),
    })
  }

  function importAll() {
    if (!parsed || pasteSections.length === 0) return
    // Wipe import: replace editor sections from the paste (do not merge into
    // leftover Intro/Outro slots, which used to keep wrong leftover chords).
    const next = buildTuneSectionsFromPaste(
      pasteSections,
      firstSectionMeter(pasteSections, tune.meter || parsed.meter || '4/4')
    )
    startCommit(
      next,
      parsed,
      effectiveUpdateLyrics() ? 'Paste chords and lyrics' : 'Paste chords'
    )
  }

  function pasteFromClipboard() {
    if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
      toast.warning('Clipboard paste is not available in this browser. Use Ctrl+V / Cmd+V in the text box.')
      return
    }
    setClipboardBusy(true)
    navigator.clipboard.readText().then(function(text) {
      setPasteText(String(text || ''))
      setPasteError('')
      setClipboardBusy(false)
    }).catch(function() {
      setClipboardBusy(false)
      toast.warning('Could not read the clipboard. Check permission, or paste with Ctrl+V / Cmd+V.')
    })
  }

  function applyMeterMergeOption(option) {
    if (!pending) return
    const next = Object.assign({}, pending, { selectedMeterOption: option })
    setPending(next)
    setMeterMergeOptions([])
    if (keyMergeOptions.length > 1) return
    commitSections(next.nextSections, next.source, {
      selectedMeterOption: option,
      selectedKeyOption: next.selectedKeyOption,
      historyLabel: next.historyLabel,
      updateLyrics: next.updateLyrics,
    })
    setPending(null)
    setPendingAction(null)
  }

  function applyKeyMergeOption(option) {
    if (!pending) return
    commitSections(pending.nextSections, pending.source, {
      selectedMeterOption: pending.selectedMeterOption,
      selectedKeyOption: option,
      historyLabel: pending.historyLabel,
      updateLyrics: pending.updateLyrics,
    })
    setPending(null)
    setKeyMergeOptions([])
    setPendingAction(null)
  }

  const canImport = pasteSections.length > 0 && !pasteError

  return (
    <>
      <Modal
        show={show}
        onHide={props.onHide}
        fullscreen
        className="paste-chord-sheet-modal"
        dialogClassName="paste-chord-sheet-modal"
        contentClassName="paste-chord-sheet-modal-content"
      >
        <Modal.Header className="paste-chord-sheet-modal-header">
          <Modal.Title>Paste lyrics and chords</Modal.Title>
          <div className="paste-chord-sheet-modal-header-actions">
            {!forceUpdateLyrics ? (
              <Form.Check
                type="checkbox"
                id="paste-update-lyrics"
                className="paste-chord-sheet-update-lyrics"
                label="Update lyrics too"
                checked={updateLyrics}
                onChange={function(e) { setUpdateLyrics(!!e.target.checked) }}
              />
            ) : null}
            <Button
              variant="success"
              onClick={importAll}
              disabled={!canImport}
            >
              Import
            </Button>
            <Button variant="secondary" onClick={props.onHide}>
              Close
            </Button>
          </div>
        </Modal.Header>
        <Modal.Body className="paste-chord-sheet-modal-body">
          {props.externalUrl ? (
            <Alert variant="info" className="mb-3">
              <div className="mb-2">
                {props.externalHelpText
                  || 'Open the chord page, copy the lyrics and chords, then paste them below.'}
              </div>
              <Button
                variant="outline-primary"
                size="sm"
                as="a"
                href={props.externalUrl}
                target="_blank"
                rel="noopener noreferrer"
                data-testid="paste-chord-external-link"
              >
                {props.externalLinkLabel || 'Open Ultimate Guitar'}
              </Button>
              {props.externalSourceTitle ? (
                <div className="text-muted small mt-2">{props.externalSourceTitle}</div>
              ) : null}
            </Alert>
          ) : null}
          <Alert variant="warning" className="mb-3">
            Applying this paste <strong>replaces all existing ABC notation</strong>
            {' '}(melody and chord symbols) with a new scaffold from the pasted chord sheet.
            Existing pitched notes are not preserved.
            {forceUpdateLyrics
              ? <> Plain and note-aligned lyrics are also replaced from the paste.</>
              : null}
          </Alert>
          <p className="text-muted small">
            Paste a chord sheet with section labels, then Import.
            {forceUpdateLyrics
              ? null
              : (updateLyrics
                ? ' Plain and note-aligned lyrics will also be replaced from the paste.'
                : ' Lyrics in the paste are used only for matching unless you check Update lyrics too.')}
          </p>
          <div className="paste-chord-sheet-textarea-toolbar">
            <Button
              size="sm"
              variant="outline-primary"
              onClick={pasteFromClipboard}
              disabled={clipboardBusy}
            >
              {clipboardBusy ? 'Reading…' : 'Paste'}
            </Button>
          </div>
          <Form.Control
            as="textarea"
            className="paste-chord-sheet-textarea"
            placeholder={PASTE_CHORD_SHEET_PLACEHOLDER}
            value={pasteText}
            onChange={function(e) { setPasteText(e.target.value); setPasteError('') }}
          />
          {pasteError ? <Alert className="mt-2 mb-0" variant="danger">{pasteError}</Alert> : null}
          {meterAssumedNotice ? (
            <Alert className="mt-2 mb-0" variant="warning">{meterAssumedNotice}</Alert>
          ) : null}

          {pasteSections.length > 0 ? (
            <div className="mt-3 paste-chord-sheet-sections">
              <strong className="d-block mb-2">Detected sections</strong>
              <ListGroup>
                {pasteSections.map(function(section) {
                  const match = matchPasteSectionToTune(section, tuneSections)
                  const unchanged = !!(match && chartsAreIdentical(section.chart, match.chart))
                  return (
                    <ListGroup.Item key={section.key}>
                      <strong>{section.title}</strong>
                      <div className="text-muted small">
                        {match
                          ? (unchanged
                            ? ('Same as existing · ' + match.title)
                            : ('Match: ' + match.title + ' (chords differ)'))
                          : 'New section'}
                      </div>
                      {unchanged ? (
                        <div className="text-muted small mt-1 mb-0">
                          Chords are identical to the matched section — not shown again.
                        </div>
                      ) : (
                        <pre className="paste-chord-sheet-section-chart mt-1 mb-0">
                          {String(section.chart || '').trim() || '(no chords)'}
                        </pre>
                      )}
                    </ListGroup.Item>
                  )
                })}
              </ListGroup>
            </div>
          ) : null}
        </Modal.Body>
      </Modal>

      <Modal show={meterMergeOptions.length > 1} onHide={function() {
        setMeterMergeOptions([])
        setKeyMergeOptions([])
        setPending(null)
        setPendingAction(null)
      }}>
        <Modal.Header closeButton>
          <Modal.Title>Time signature options</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            The chord sheet meter may not match this tune&apos;s notation meter
            ({tune.meter || 'unknown'}). Pick which meter to use for chord placement.
          </p>
          <ListGroup>
            {meterMergeOptions.map(function(option) {
              return (
                <ListGroup.Item
                  key={option.id || option.label}
                  action
                  onClick={function() { applyMeterMergeOption(option) }}
                >
                  <strong>{option.label}</strong>
                  {option.rationale ? (
                    <div className="text-muted small">{option.rationale}</div>
                  ) : null}
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        </Modal.Body>
      </Modal>

      <Modal show={keyMergeOptions.length > 1 && meterMergeOptions.length === 0 && pendingAction === 'commit'} onHide={function() {
        setKeyMergeOptions([])
        setPending(null)
        setPendingAction(null)
      }}>
        <Modal.Header closeButton>
          <Modal.Title>Chord key options</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p>
            The chord sheet key may not match this tune&apos;s notation key
            ({tune.key || 'unknown'}). Pick how to merge — your tune key field is not changed.
          </p>
          <ListGroup>
            {keyMergeOptions.map(function(option) {
              return (
                <ListGroup.Item
                  key={option.id || option.label}
                  action
                  onClick={function() { applyKeyMergeOption(option) }}
                >
                  <strong>{option.label}</strong>
                  {option.rationale ? (
                    <div className="text-muted small">{option.rationale}</div>
                  ) : null}
                  <pre style={{ marginBottom: 0, whiteSpace: 'pre-wrap', fontSize: '0.85em' }}>
                    {String(option.chordGridText || '').split('\n').slice(0, 4).join('\n')}
                  </pre>
                </ListGroup.Item>
              )
            })}
          </ListGroup>
        </Modal.Body>
      </Modal>
    </>
  )
}
