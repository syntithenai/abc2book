import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Modal, Form } from 'react-bootstrap'
import abcjs from 'abcjs'
import { resolvePrimaryVoiceKey } from '../abcVoiceUtils'
import {
  getPlainLyricLines,
  setNoteAlignedLyricLines,
  getNoteAlignedLyricLines,
} from '../wLinesUtils'
import { buildNotationWLines, resolveNoteAlignedWLines } from '../noteSpacingUtils'
import { useResponsiveModalProps } from '../useResponsiveModalProps'

function primaryNoteLines(tune) {
  if (!tune || !tune.voices) return []
  const voiceKey = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[voiceKey]
  return voice && Array.isArray(voice.notes) ? voice.notes.slice() : []
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

function NoteAlignedLyricsRow(props) {
  const { tune, index, noteLine, lyricLine, onLyricChange } = props
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
      <Form.Control
        as="textarea"
        rows={2}
        value={lyricLine != null ? lyricLine : ''}
        onChange={function(e) { onLyricChange(index, e.target.value) }}
        placeholder="w: lyrics for this line"
        className="note-aligned-lyrics-input"
      />
    </Form.Group>
  )
}

/**
 * Modal to edit note-aligned (syllable-marked) w: lyrics, one line per melody line.
 * Generates from plain lyrics when the stored aligned version is empty.
 */
export default function NoteAlignedLyricsModal(props) {
  const { tune, tunebook, show, onHide, onSaved } = props
  const responsiveModalProps = useResponsiveModalProps()
  const noteLines = useMemo(function() { return primaryNoteLines(tune) }, [tune])
  const [alignedLines, setAlignedLines] = useState([])
  const seededForOpenRef = useRef(false)

  useEffect(function() {
    if (!show || !tune) {
      seededForOpenRef.current = false
      return
    }
    // Seed once per open so parent re-renders / resolve regenerations cannot
    // overwrite in-progress edits (e.g. merging staff-2 text into staff-1).
    if (seededForOpenRef.current) return
    seededForOpenRef.current = true
    setAlignedLines(padLines(resolveNoteAlignedWLines(tune), noteLines.length))
  }, [show, tune, noteLines.length])

  function updateLine(index, value) {
    setAlignedLines(function(prev) {
      const next = padLines(prev, noteLines.length)
      next[index] = value
      return next
    })
  }

  function regenerate() {
    if (!tune) return
    const generated = buildNotationWLines(tune)
    setAlignedLines(padLines(generated, noteLines.length))
  }

  function handleSave() {
    if (!tune) return
    setNoteAlignedLyricLines(tune, padLines(alignedLines, noteLines.length))
    if (typeof onSaved === 'function') onSaved(tune)
    else if (tunebook && typeof tunebook.saveTune === 'function') {
      tunebook.saveTune(tune, false, { historyLabel: 'Edit note-aligned lyrics' })
    }
    if (typeof onHide === 'function') onHide()
  }

  const plainPreview = getPlainLyricLines(tune).join('\n')
  const hasPlain = plainPreview.trim().length > 0
  const hadStored = getNoteAlignedLyricLines(tune).some(function(line) {
    return String(line || '').trim().length > 0
  })
  const displayLines = padLines(alignedLines, noteLines.length)

  return (
    <Modal show={show} onHide={onHide} size="lg" {...responsiveModalProps}>
      <Modal.Header closeButton>
        <Modal.Title>Note-aligned lyrics</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p style={{ marginBottom: '0.75em' }}>
          Syllable markers align words to notes under the staff (hyphens, <code>~</code>, <code>*</code>).
          Plain lyrics stay unchanged for all other views.
        </p>
        {!hasPlain ? (
          <p className="text-muted">Add plain lyrics first, then regenerate alignment.</p>
        ) : null}
        {!hadStored && hasPlain ? (
          <p className="text-muted" style={{ fontSize: '0.9em' }}>
            No saved alignment yet — showing a generated match from the current lyrics and notation.
          </p>
        ) : null}
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.75em' }}>
          <Button variant="info" size="sm" onClick={regenerate} disabled={!hasPlain || noteLines.length === 0}>
            Regenerate from lyrics
          </Button>
        </div>
        {noteLines.length === 0 ? (
          <p className="text-muted">This tune has no melody lines to align lyrics to.</p>
        ) : (
          <div className="note-aligned-lyrics-rows">
            {noteLines.map(function(noteLine, index) {
              return (
                <NoteAlignedLyricsRow
                  key={'note-aligned-row-' + index}
                  tune={tune}
                  index={index}
                  noteLine={noteLine}
                  lyricLine={displayLines[index] != null ? displayLines[index] : ''}
                  onLyricChange={updateLine}
                />
              )
            })}
          </div>
        )}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button variant="success" onClick={handleSave}>Save</Button>
      </Modal.Footer>
    </Modal>
  )
}
