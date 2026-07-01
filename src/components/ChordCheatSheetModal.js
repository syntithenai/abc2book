import React, { useEffect, useRef, useMemo } from 'react'
import { Modal, Button } from 'react-bootstrap'
import { draw } from 'vexchords'
import chordLib from '../chordlib.json'
import {
  CHORD_LETTERS,
  INSTRUMENT_LABELS,
  INSTRUMENT_TUNINGS
} from '../chordLibConfig'
import {
  canonicalChordLetter,
  chordLabelFromQuality,
  stringsFromInstrument,
  primaryDiagramFromChordEntry,
  vexchordsTuningFromDiagram
} from '../chordLibUtils'
import { chordParserFactory } from 'chord-symbol'

const CHEAT_QUALITIES = ['major', 'minor']

const diagramDefaults = {
  defaultColor: 'black',
  bgColor: '#FFF',
  strokeColor: 'black',
  textColor: 'black',
  stringColor: 'black',
  fretColor: 'black',
  labelColor: 'white',
  fretWidth: 1,
  stringWidth: 1,
  showTuning: true
}

function calcFrets(chordData) {
  var max = 3
  if (chordData && Array.isArray(chordData.chord)) {
    chordData.chord.forEach(function(dataRow) {
      if (dataRow.length > 1) {
        var val = parseInt(dataRow[1], 10)
        if (!isNaN(val) && val > 0 && val > max) {
          max = val
        }
      }
    })
  }
  return max
}

function primaryChordDiagram(instrument, quality, letter) {
  var key = canonicalChordLetter(letter)
  var entry = chordLib[instrument] && chordLib[instrument][quality] && chordLib[instrument][quality][key]
    ? chordLib[instrument][quality][key]
    : null
  var label = chordLabelFromQuality(letter, quality)
  var parseChord = chordParserFactory()
  var chordInfo = parseChord(label)
  var chordNotes = chordInfo.error ? [] : chordInfo.normalized.notes
  return primaryDiagramFromChordEntry(entry, label, {
    instrument: instrument,
    chordNotes: chordNotes
  })
}

function chordNotesForEntry(instrument, quality, letter) {
  var label = chordLabelFromQuality(letter, quality)
  var parseChord = chordParserFactory()
  var chordInfo = parseChord(label)
  return chordInfo.error ? [] : chordInfo.normalized.notes
}

function cheatChordDomId(entryId) {
  return 'cheat-chord-' + entryId.replace(/#/g, '-sharp')
}

function buildCheatSheetEntries() {
  var entries = []
  CHEAT_QUALITIES.forEach(function(quality) {
    CHORD_LETTERS.forEach(function(letter) {
      entries.push({
        id: quality + '-' + letter,
        quality: quality,
        letter: letter,
        label: chordLabelFromQuality(letter, quality)
      })
    })
  })
  return entries
}

function diagramOptions(instrument, chordData, width, height) {
  return Object.assign({}, diagramDefaults, {
    width: width,
    height: height,
    numStrings: stringsFromInstrument(instrument),
    numFrets: calcFrets(chordData)
  })
}

function renderPrintWindow(gridEl, title) {
  if (!gridEl) return
  var printStyles = [
    '@page { size: landscape; margin: 0.35in; }',
    'body { margin: 0; font-family: system-ui, sans-serif; color: #000; }',
    'h1.cheat-sheet-screen-title { font-size: 16pt; margin: 0 0 0.15in 0; text-align: center; }',
    '.cheat-sheet-grid { display: grid; grid-template-columns: repeat(12, 1fr); gap: 0.06in; }',
    '.cheat-sheet-section { margin-bottom: 0.12in; }',
    '.cheat-sheet-section-title { font-size: 9pt; margin: 0 0 0.04in 0; font-weight: 600; }',
    '.cheat-sheet-cell { text-align: center; break-inside: avoid; page-break-inside: avoid; }',
    '.cheat-sheet-label { font-size: 8pt; font-weight: 600; margin-bottom: 0.02in; }',
    '.cheat-sheet-diagram svg { display: block; margin: 0 auto; width: 100%; max-width: 0.72in; height: auto; }',
    '.cheat-sheet-screen-title { font-size: 16pt; margin: 0 0 0.15in 0; text-align: center; }'
  ].join('\n')

  var html =
    '<!DOCTYPE html><html><head><meta charset="utf-8"><title>' +
    title +
    '</title><style>' +
    printStyles +
    '</style></head><body>' +
    gridEl.outerHTML +
    '</body></html>'

  var iframe = document.createElement('iframe')
  iframe.setAttribute('title', title)
  iframe.style.position = 'fixed'
  iframe.style.right = '0'
  iframe.style.bottom = '0'
  iframe.style.width = '0'
  iframe.style.height = '0'
  iframe.style.border = '0'
  document.body.appendChild(iframe)

  var printWindow = iframe.contentWindow
  var printDoc = printWindow.document
  printDoc.open()
  printDoc.write(html)
  printDoc.close()

  printWindow.focus()
  setTimeout(function() {
    printWindow.print()
    setTimeout(function() {
      document.body.removeChild(iframe)
    }, 1000)
  }, 300)
}

export default function ChordCheatSheetModal(props) {
  var gridRef = useRef(null)
  var entries = useMemo(function() { return buildCheatSheetEntries() }, [])

  var instrument = props.instrument || 'guitar'
  var instrumentLabel = INSTRUMENT_LABELS[instrument] || instrument
  var tuningLabel = (INSTRUMENT_TUNINGS[instrument] || []).join(' ')

  useEffect(function() {
    if (!props.show) return

    entries.forEach(function(entry) {
      var targetId = '#' + cheatChordDomId(entry.id)
      var target = document.querySelector(targetId)
      if (target) target.innerHTML = ''
    })

    var frame = requestAnimationFrame(function() {
      entries.forEach(function(entry) {
        var chordData = primaryChordDiagram(instrument, entry.quality, entry.letter)
        var targetId = '#' + cheatChordDomId(entry.id)
        if (!chordData) return
        var chordNotes = chordNotesForEntry(instrument, entry.quality, entry.letter)
        draw(targetId, {
          chord: chordData.chord,
          barres: chordData.barres,
          position: chordData.position,
          tuning: vexchordsTuningFromDiagram(chordData, instrument, chordNotes)
        }, diagramOptions(instrument, chordData, 110, 138))
      })
    })

    return function() { cancelAnimationFrame(frame) }
  }, [props.show, instrument, entries])

  function handlePrint() {
    if (!gridRef.current) return
    var clone = gridRef.current.cloneNode(true)
    clone.classList.add('cheat-sheet-print-root')
    renderPrintWindow(clone, instrumentLabel + ' chord cheat sheet')
  }

  return (
    <Modal
      show={props.show}
      onHide={props.onHide}
      fullscreen={true}
      className="chord-cheat-sheet-modal"
    >
      <Modal.Header closeButton className="chord-cheat-sheet-no-print">
        <Modal.Title style={{ flex: 1 }}>
          {instrumentLabel} cheat sheet
          {tuningLabel ? <span style={{ fontSize: '0.55em', display: 'block', fontWeight: 'normal' }}>{tuningLabel}</span> : null}
        </Modal.Title>
        <Button variant="outline-primary" onClick={handlePrint} style={{ marginRight: '0.5em' }}>
          {props.tunebook && props.tunebook.icons ? props.tunebook.icons.printer : null}
          {' '}Print
        </Button>
      </Modal.Header>
      <Modal.Body>
        <div ref={gridRef} className="chord-cheat-sheet-printable">
          <h1 className="cheat-sheet-screen-title">{instrumentLabel} — major &amp; minor chords</h1>
          {CHEAT_QUALITIES.map(function(quality) {
            return (
              <section key={quality} className="cheat-sheet-section">
                <h2 className="cheat-sheet-section-title">{quality === 'major' ? 'Major' : 'Minor'}</h2>
                <div className="cheat-sheet-grid">
                  {entries.filter(function(entry) { return entry.quality === quality }).map(function(entry) {
                    var chordData = primaryChordDiagram(instrument, entry.quality, entry.letter)
                    return (
                      <div key={entry.id} className="cheat-sheet-cell">
                        <div className="cheat-sheet-label">{entry.label}</div>
                        {chordData
                          ? <div className="cheat-sheet-diagram" id={cheatChordDomId(entry.id)}></div>
                          : <div className="cheat-sheet-missing">—</div>}
                      </div>
                    )
                  })}
                </div>
              </section>
            )
          })}
        </div>
      </Modal.Body>
    </Modal>
  )
}
