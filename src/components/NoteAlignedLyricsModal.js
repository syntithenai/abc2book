import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, Form } from 'react-bootstrap'
import abcjs from 'abcjs'
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'
import {
  getPlainLyricLines,
  setNoteAlignedLyricLines,
  hasExplicitNoteAlignedStorage,
  stripNoteSpacingFromLine,
} from '../wLinesUtils'
import {
  buildNotationWLines,
  resolveNoteAlignedWLines,
  fitLyricLineToNoteCount,
  countLyricSlotsInNoteLine,
} from '../noteSpacingUtils'
import { isMidiProgramLine } from '../notation/voiceMeta'
import { useResponsiveModalProps } from '../useResponsiveModalProps'

const AUTOSAVE_MS = 400

function primaryNoteLines(tune) {
  if (!tune || !tune.voices) return []
  const voiceKey = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[voiceKey]
  return voice && Array.isArray(voice.notes) ? voice.notes.slice() : []
}

function hasMelodyNoteLines(noteLines) {
  return (Array.isArray(noteLines) ? noteLines : []).some(function(line) {
    return String(line || '').trim() && !isMidiProgramLine(line)
  })
}

function padLines(lines, count) {
  const next = Array.isArray(lines) ? lines.slice() : []
  while (next.length < count) next.push('')
  return next.slice(0, count)
}

function buildRowPreviewAbc(tune, noteLine, lyricLine) {
  const meter = (tune && tune.meter) || '4/4'
  const noteLength = (tune && tune.noteLength) || '1/8'
  const key = (tune && tune.key) || 'C'
  const notes = String(noteLine || '').trim() || 'z4 |'
  const lyric = String(lyricLine || '').trim()
  const lines = [
    'X:1',
    'T:',
    'M:' + meter,
    'L:' + noteLength,
    'K:' + key,
    notes,
  ]
  if (lyric) lines.push('w: ' + lyric)
  return lines.join('\n')
}

function fitWordsToNoteLine(tune, noteLine, lyricLine) {
  const plain = stripNoteSpacingFromLine(lyricLine)
  if (!plain) return String(lyricLine || '').trim()
  const noteCount = countLyricSlotsInNoteLine(noteLine, {
    meter: (tune && tune.meter) || '4/4',
    noteLength: (tune && tune.noteLength) || '1/8',
    key: (tune && tune.key) || 'C',
  })
  if (noteCount <= 0) return plain
  return fitLyricLineToNoteCount(plain, noteCount)
}

function NoteAlignedLyricsRow(props) {
  const { tune, index, noteLine, lyricLine, onLyricChange, onFit } = props
  const previewRef = useRef(null)
  const previewAbc = useMemo(function() {
    return buildRowPreviewAbc(tune, noteLine, lyricLine)
  }, [tune, noteLine, lyricLine])

  useEffect(function() {
    const el = previewRef.current
    if (!el) return
    el.innerHTML = ''
    try {
      abcjs.renderAbc(el, previewAbc, {
        responsive: 'resize',
        paddingtop: 0,
        paddingbottom: 0,
        paddingright: 0,
        paddingleft: 0,
        add_classes: true,
      })
    } catch (e) {
      el.textContent = 'Unable to render notation for this line.'
    }
  }, [previewAbc])

  const canFit = String(lyricLine || '').trim().length > 0
    && String(noteLine || '').trim().length > 0
    && !isMidiProgramLine(noteLine)

  return (
    <Form.Group className="note-aligned-lyrics-row mb-4" controlId={'note-aligned-line-' + index}>
      <div
        className="note-aligned-lyrics-preview"
        ref={previewRef}
        aria-label={'Notation preview for line ' + (index + 1)}
      />
      <Form.Label className="note-aligned-lyrics-abc-label">
        {noteLine || '(empty note line)'}
      </Form.Label>
      <div className="note-aligned-lyrics-input-row">
        <Form.Control
          as="textarea"
          rows={2}
          value={lyricLine != null ? lyricLine : ''}
          onChange={function(e) { onLyricChange(index, e.target.value) }}
          placeholder="w: lyrics for this line"
          className="note-aligned-lyrics-input"
        />
        <Button
          type="button"
          variant="outline-secondary"
          size="sm"
          className="note-aligned-lyrics-fit-btn"
          disabled={!canFit}
          onClick={function() { onFit(index) }}
          title="Fit these words to the notes on this line"
        >
          Fit
        </Button>
      </div>
    </Form.Group>
  )
}

/**
 * Modal to edit note-aligned (syllable-marked) w: lyrics, one line per melody line.
 * Generates from plain lyrics when the stored aligned version is empty.
 * Edits auto-save; each line has a Fit control to match words to note slots.
 */
export default function NoteAlignedLyricsModal(props) {
  const { tune, tunebook, show, onHide, onSaved } = props
  const responsiveModalProps = useResponsiveModalProps()
  const noteLines = useMemo(function() { return primaryNoteLines(tune) }, [tune])
  const [alignedLines, setAlignedLines] = useState([])
  const seededForOpenRef = useRef(false)
  const alignedLinesRef = useRef([])
  const saveTimerRef = useRef(null)

  useEffect(function() {
    alignedLinesRef.current = alignedLines
  }, [alignedLines])

  function clearAutosaveTimer() {
    if (!saveTimerRef.current) return
    clearTimeout(saveTimerRef.current)
    saveTimerRef.current = null
  }

  function persistLines(lines) {
    if (!tune) return
    clearAutosaveTimer()
    setNoteAlignedLyricLines(tune, padLines(lines, noteLines.length))
    if (typeof onSaved === 'function') onSaved(tune)
    else if (tunebook && typeof tunebook.saveTune === 'function') {
      tunebook.saveTune(tune, false, {
        historyLabel: 'Edit note-aligned lyrics',
        immediate: true,
      })
    }
  }

  function scheduleAutosave(lines) {
    clearAutosaveTimer()
    saveTimerRef.current = setTimeout(function() {
      saveTimerRef.current = null
      persistLines(lines)
    }, AUTOSAVE_MS)
  }

  function flushAutosave() {
    if (!saveTimerRef.current) return
    clearAutosaveTimer()
    persistLines(alignedLinesRef.current)
  }

  useEffect(function() {
    if (!show || !tune) {
      seededForOpenRef.current = false
      return
    }
    // Seed once per open so parent re-renders / resolve regenerations cannot
    // overwrite in-progress edits (e.g. merging staff-2 text into staff-1).
    if (seededForOpenRef.current) return
    seededForOpenRef.current = true
    const seeded = padLines(resolveNoteAlignedWLines(tune), noteLines.length)
    alignedLinesRef.current = seeded
    setAlignedLines(seeded)
  }, [show, tune, noteLines.length])

  useEffect(function() {
    return function() {
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current)
        saveTimerRef.current = null
      }
    }
  }, [])

  function handleHide() {
    flushAutosave()
    if (typeof onHide === 'function') onHide()
  }

  function updateLine(index, value) {
    const next = padLines(alignedLinesRef.current, noteLines.length)
    next[index] = value
    alignedLinesRef.current = next
    setAlignedLines(next)
    scheduleAutosave(next)
  }

  function fitLine(index) {
    if (!tune) return
    const next = padLines(alignedLinesRef.current, noteLines.length)
    next[index] = fitWordsToNoteLine(tune, noteLines[index], next[index])
    alignedLinesRef.current = next
    setAlignedLines(next)
    persistLines(next)
  }

  function regenerate() {
    if (!tune) return
    const generated = padLines(buildNotationWLines(tune), noteLines.length)
    alignedLinesRef.current = generated
    setAlignedLines(generated)
    persistLines(generated)
  }

  function clearAll() {
    if (!tune) return
    if (!window.confirm('Clear all note-aligned lyrics? Plain lyrics will not be changed.')) return
    const cleared = padLines([], noteLines.length)
    alignedLinesRef.current = cleared
    setAlignedLines(cleared)
    persistLines(cleared)
  }

  const plainPreview = getPlainLyricLines(tune).join('\n')
  const hasPlain = plainPreview.trim().length > 0
  const hasExplicitStorage = hasExplicitNoteAlignedStorage(tune)
  const displayLines = padLines(alignedLines, noteLines.length)
  const hasAlignedContent = displayLines.some(function(line) {
    return String(line || '').trim().length > 0
  })

  return (
    <Modal show={show} onHide={handleHide} size="lg" {...responsiveModalProps}>
      <Modal.Header closeButton>
        <Modal.Title>Note-aligned lyrics</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p style={{ marginBottom: '0.75em' }}>
          Syllable markers align words to notes under the staff (hyphens, <code>~</code>, <code>*</code>).
          Changes save automatically. Plain lyrics stay unchanged for all other views.
        </p>
        {!hasPlain ? (
          <p className="text-muted">Add plain lyrics first, then regenerate alignment.</p>
        ) : null}
        {!hasExplicitStorage && hasPlain ? (
          <p className="text-muted" style={{ fontSize: '0.9em' }}>
            No saved alignment yet — showing a generated match from the current lyrics and notation.
          </p>
        ) : null}
        {hasExplicitStorage && !hasAlignedContent ? (
          <p className="text-muted" style={{ fontSize: '0.9em' }}>
            Note-aligned lyrics are cleared. Use Regenerate from lyrics to create a new alignment.
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5em', marginBottom: '0.75em' }}>
          <Button
            variant="outline-danger"
            size="sm"
            onClick={clearAll}
            disabled={!hasAlignedContent || !hasMelodyNoteLines(noteLines)}
          >
            Clear
          </Button>
          <Button variant="info" size="sm" onClick={regenerate} disabled={!hasPlain || !hasMelodyNoteLines(noteLines)}>
            Regenerate from lyrics
          </Button>
        </div>
        {!hasMelodyNoteLines(noteLines) ? (
          <p className="text-muted">This tune has no melody lines to align lyrics to.</p>
        ) : (
          <div className="note-aligned-lyrics-rows">
            {noteLines.map(function(noteLine, index) {
              // Keep lyric slot indices aligned with voice.notes (incl. %%MIDI),
              // but do not show instrument directives as editable rows.
              if (isMidiProgramLine(noteLine)) return null
              return (
                <NoteAlignedLyricsRow
                  key={'note-aligned-row-' + index}
                  tune={tune}
                  index={index}
                  noteLine={noteLine}
                  lyricLine={displayLines[index] != null ? displayLines[index] : ''}
                  onLyricChange={updateLine}
                  onFit={fitLine}
                />
              )
            })}
          </div>
        )}
      </Modal.Body>
    </Modal>
  )
}
