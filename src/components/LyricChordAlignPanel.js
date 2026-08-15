import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import {
  alignLineDisplayChars,
  alignRowsToChordProLines,
  applyAlignChordAnchors,
  chordAtOffset,
  deleteAlignRow,
  deleteAlignSection,
  insertAlignLyricRow,
  insertAlignSectionAfter,
  isWordStartOffset,
  letterIndexNearestClientX,
  lyricLinesToAlignRows,
  moveChordAnchor,
  removeChordAnchor,
  setAlignHeaderText,
  setAlignLyricText,
  snapAlignOffset,
  upsertChordAnchor,
} from '../lyricChordAlignUtils'
import { displaySectionHeader } from '../LyricsDisplayLines'
import { applyChordDisplayTranspose } from '../chordKeyMergeOptions'

const DRAG_THRESHOLD_PX = 6
const PREVENT_SCROLL_FOCUS = { preventScroll: true }

function blurActiveAlignControl() {
  const active = typeof document !== 'undefined' ? document.activeElement : null
  if (!active || active === document.body || typeof active.blur !== 'function') return
  active.blur()
}

function currentWindowScroll() {
  return {
    x: typeof window !== 'undefined' && Number.isFinite(window.scrollX) ? window.scrollX : 0,
    y: typeof window !== 'undefined' && Number.isFinite(window.scrollY) ? window.scrollY : 0,
  }
}

function restoreWindowScroll(x, y) {
  if (typeof window === 'undefined' || typeof window.scrollTo !== 'function') return
  window.scrollTo(x, y)
}

function focusWithoutScroll(el) {
  if (!el || typeof el.focus !== 'function') return
  try {
    el.focus(PREVENT_SCROLL_FOCUS)
  } catch (err) {
    el.focus()
  }
}

/**
 * Drag-to-align ChordPro/COW chords onto any letter. Click a chord to edit
 * or remove it; use + on a word to add a chord.
 */
export default function LyricChordAlignPanel(props) {
  const lyricsText = props.lyricsText || ''
  const title = props.title || ''
  const composer = props.composer || ''
  const chordTranspose = Number(props.chordTranspose) || 0
  const sourceKey = props.sourceKey
  const onChange = typeof props.onChange === 'function' ? props.onChange : function() {}
  const panelRef = useRef(null)
  const chordInputRef = useRef(null)
  const textInputRef = useRef(null)
  const lastEmittedRef = useRef(lyricsText)
  const lastMetaRef = useRef(title + '\0' + composer)

  function displayChordName(chord) {
    return applyChordDisplayTranspose(chord, chordTranspose, sourceKey)
  }

  function storeChordName(chord) {
    if (!chordTranspose) return chord
    return applyChordDisplayTranspose(chord, -chordTranspose, sourceKey)
  }

  const lines = String(lyricsText).split(/\r?\n/)
  const [rows, setRows] = useState(function() {
    return lyricLinesToAlignRows(lines, { title: title, composer: composer })
  })
  const rowsRef = useRef(rows)
  const letterRefs = useRef({})
  const dragRef = useRef(null)
  const [dragState, setDragState] = useState(null)
  const [chordDialog, setChordDialog] = useState(null)
  const [textDialog, setTextDialog] = useState(null)

  useEffect(function() {
    const meta = title + '\0' + composer
    if (lastEmittedRef.current === lyricsText && lastMetaRef.current === meta) return
    lastEmittedRef.current = lyricsText
    lastMetaRef.current = meta
    const next = lyricLinesToAlignRows(String(lyricsText).split(/\r?\n/), {
      title: title,
      composer: composer,
    })
    rowsRef.current = next
    setRows(next)
    setDragState(null)
    dragRef.current = null
  }, [lyricsText, title, composer])

  const chordDialogOpen = !!chordDialog
  const textDialogOpen = !!textDialog
  useLayoutEffect(function() {
    if (!chordDialogOpen) return
    focusWithoutScroll(chordInputRef.current)
  }, [chordDialogOpen])

  useLayoutEffect(function() {
    if (!textDialogOpen) return
    focusWithoutScroll(textInputRef.current)
  }, [textDialogOpen])

  useEffect(function() {
    return function() {
      clearWindowDragListeners()
    }
  }, [])

  function clearWindowDragListeners() {
    if (!dragRef.current || !dragRef.current._onMove) return
    window.removeEventListener('pointermove', dragRef.current._onMove)
    window.removeEventListener('pointerup', dragRef.current._onUp)
    window.removeEventListener('pointercancel', dragRef.current._onUp)
  }

  function commitRows(next) {
    const panel = panelRef.current
    const panelTop = panel ? panel.scrollTop : 0
    const windowScroll = currentWindowScroll()
    blurActiveAlignControl()
    rowsRef.current = next
    setRows(next)
    const emitted = alignRowsToChordProLines(next).join('\n')
    lastEmittedRef.current = emitted
    onChange(emitted)
    requestAnimationFrame(function() {
      const livePanel = panelRef.current
      if (livePanel) livePanel.scrollTop = panelTop
      restoreWindowScroll(windowScroll.x, windowScroll.y)
    })
  }

  function setRowAnchors(rowIndex, anchors) {
    const next = rowsRef.current.map(function(row, index) {
      if (index !== rowIndex || row.type !== 'lyric') return row
      return Object.assign({}, row, { anchors: anchors })
    })
    commitRows(next)
  }

  function replaceLyricRow(rowIndex, nextRow) {
    const next = rowsRef.current.map(function(row, index) {
      if (index !== rowIndex) return row
      return nextRow
    })
    commitRows(next)
  }

  function getLetterRects(rowIndex) {
    const map = letterRefs.current[rowIndex] || {}
    const row = rowsRef.current[rowIndex]
    const text = row && row.text != null ? String(row.text) : ''
    const chars = alignLineDisplayChars(text)
    const rects = []
    for (let i = 0; i < chars.length; i += 1) {
      const el = map[i]
      rects.push(el ? el.getBoundingClientRect() : null)
    }
    return rects
  }

  function openChordDialog(next) {
    const stored = next.chord != null ? String(next.chord) : ''
    setChordDialog({
      rowIndex: next.rowIndex,
      anchorIndex: next.anchorIndex != null ? next.anchorIndex : -1,
      offset: next.offset,
      chord: stored ? displayChordName(stored) : '',
    })
  }

  function closeChordDialog() {
    setChordDialog(null)
  }

  function saveChordDialog() {
    if (!chordDialog) return
    const row = rowsRef.current[chordDialog.rowIndex]
    if (!row || row.type !== 'lyric') {
      setChordDialog(null)
      return
    }
    const chord = storeChordName(String(chordDialog.chord || '').trim())
    const anchors = Array.isArray(row.anchors) ? row.anchors : []
    if (!chord) {
      if (chordDialog.anchorIndex >= 0) {
        setRowAnchors(chordDialog.rowIndex, removeChordAnchor(anchors, chordDialog.anchorIndex))
      }
      setChordDialog(null)
      return
    }
    replaceLyricRow(
      chordDialog.rowIndex,
      applyAlignChordAnchors(row, chordDialog.offset, function(text, currentAnchors) {
        return upsertChordAnchor(currentAnchors, chordDialog.offset, chord, text)
      })
    )
    setChordDialog(null)
  }

  function removeChordFromDialog() {
    if (!chordDialog || chordDialog.anchorIndex < 0) {
      setChordDialog(null)
      return
    }
    const row = rowsRef.current[chordDialog.rowIndex]
    if (!row || row.type !== 'lyric') {
      setChordDialog(null)
      return
    }
    setRowAnchors(chordDialog.rowIndex, removeChordAnchor(row.anchors, chordDialog.anchorIndex))
    setChordDialog(null)
  }

  function handlePointerDown(event, rowIndex, anchorIndex, fromOffset) {
    const row = rowsRef.current[rowIndex]
    if (!row || row.type !== 'lyric') return
    const anchor = row.anchors && row.anchors[anchorIndex]
    if (!anchor || !String(anchor.chord || '').trim()) return
    event.preventDefault()
    event.stopPropagation()

    clearWindowDragListeners()

    function onMove(moveEvent) {
      const drag = dragRef.current
      if (!drag) return
      const dx = Math.abs(moveEvent.clientX - drag.startX)
      const dy = Math.abs(moveEvent.clientY - drag.startY)
      if (!drag.dragging && dx < DRAG_THRESHOLD_PX && dy < DRAG_THRESHOLD_PX) return
      const current = rowsRef.current[drag.rowIndex]
      if (!current || current.type !== 'lyric') return
      const rects = getLetterRects(drag.rowIndex)
      const hoverOffset = letterIndexNearestClientX(rects, moveEvent.clientX, current.text)
      const next = Object.assign({}, drag, {
        dragging: true,
        hoverOffset: hoverOffset >= 0 ? hoverOffset : drag.hoverOffset,
      })
      dragRef.current = next
      setDragState({
        rowIndex: next.rowIndex,
        anchorIndex: next.anchorIndex,
        fromOffset: next.fromOffset,
        hoverOffset: next.hoverOffset,
      })
    }

    function onUp() {
      const drag = dragRef.current
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
      dragRef.current = null
      setDragState(null)
      if (!drag) return
      const current = rowsRef.current[drag.rowIndex]
      if (!current || current.type !== 'lyric') return
      if (!drag.dragging) {
        openChordDialog({
          rowIndex: drag.rowIndex,
          anchorIndex: drag.anchorIndex,
          offset: drag.fromOffset,
          chord: anchor.chord,
        })
        return
      }
      const target = snapAlignOffset(current.text, drag.hoverOffset)
      if (target === drag.fromOffset) return
      replaceLyricRow(
        drag.rowIndex,
        applyAlignChordAnchors(current, target, function(text, currentAnchors) {
          return moveChordAnchor(currentAnchors, drag.anchorIndex, target, text)
        })
      )
    }

    const state = {
      rowIndex: rowIndex,
      anchorIndex: anchorIndex,
      fromOffset: fromOffset,
      hoverOffset: fromOffset,
      startX: event.clientX,
      startY: event.clientY,
      dragging: false,
      _onMove: onMove,
      _onUp: onUp,
    }
    dragRef.current = state
    setDragState({
      rowIndex: rowIndex,
      anchorIndex: anchorIndex,
      fromOffset: fromOffset,
      hoverOffset: fromOffset,
    })
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
  }

  function openLyricTextDialog(rowIndex) {
    const row = rowsRef.current[rowIndex]
    if (!row || row.type !== 'lyric') return
    setTextDialog({ kind: 'lyric', rowIndex: rowIndex, value: String(row.text || '') })
  }

  function openSectionTextDialog(rowIndex) {
    const row = rowsRef.current[rowIndex]
    if (!row || row.type !== 'header') return
    setTextDialog({
      kind: 'section',
      rowIndex: rowIndex,
      value: displaySectionHeader(row.text) || '',
    })
  }

  function openNewLyricDialog(afterIndex) {
    setTextDialog({
      kind: 'new-lyric',
      rowIndex: afterIndex == null ? -1 : afterIndex,
      value: '',
    })
  }

  function openNewSectionDialog(afterIndex) {
    setTextDialog({
      kind: 'new-section',
      rowIndex: afterIndex == null ? -1 : afterIndex,
      value: '',
    })
  }

  function closeTextDialog() {
    setTextDialog(null)
  }

  function saveTextDialog() {
    if (!textDialog) return
    const value = String(textDialog.value || '')
    if (textDialog.kind === 'lyric') {
      commitRows(setAlignLyricText(rowsRef.current, textDialog.rowIndex, value))
    } else if (textDialog.kind === 'new-lyric') {
      if (!value.trim()) return
      const current = rowsRef.current
      const at = Number(textDialog.rowIndex)
      const insertAt = (!Number.isFinite(at) || at < 0 || at >= current.length)
        ? current.length
        : at + 1
      const next = setAlignLyricText(
        insertAlignLyricRow(current, textDialog.rowIndex),
        insertAt,
        value
      )
      commitRows(next)
    } else if (textDialog.kind === 'section') {
      if (!value.trim()) return
      commitRows(setAlignHeaderText(rowsRef.current, textDialog.rowIndex, value))
    } else if (textDialog.kind === 'new-section') {
      if (!value.trim()) return
      commitRows(insertAlignSectionAfter(rowsRef.current, textDialog.rowIndex, value))
    }
    setTextDialog(null)
  }

  function addLyricLine(afterIndex) {
    openNewLyricDialog(afterIndex)
  }

  function removeLyricLine(rowIndex) {
    commitRows(deleteAlignRow(rowsRef.current, rowIndex))
  }

  function removeSection(rowIndex) {
    commitRows(deleteAlignSection(rowsRef.current, rowIndex))
  }

  function renderRowActions(buttons) {
    return (
      <div className="lyric-chord-align-row-actions">
        {buttons}
      </div>
    )
  }

  const hasLyricRows = rows.some(function(row) {
    return row && (row.type === 'lyric' || row.type === 'header')
  })

  return (
    <div
      ref={panelRef}
      className="lyric-chord-align-panel"
      data-testid="lyric-chord-align-panel"
    >
      <p className="lyric-chord-align-hint text-muted small">
        Drag chords onto letters or spaces. Extra space at the end of each line
        is for chords after the last word. Click a chord to edit it. Use{' '}
        <strong>+</strong> to add a chord, and Edit, + Line, or Delete to change
        lyrics and sections.
      </p>
      <div className="lyric-chord-align-toolbar" data-testid="lyric-chord-align-toolbar">
        <Button
          size="sm"
          variant="outline-primary"
          data-testid="lyric-chord-align-add-line-end"
          onClick={function() { addLyricLine(-1) }}
        >
          + Line
        </Button>
        <Button
          size="sm"
          variant="outline-primary"
          data-testid="lyric-chord-align-add-section-end"
          onClick={function() { openNewSectionDialog(-1) }}
        >
          + Section
        </Button>
      </div>
      {!hasLyricRows ? (
        <p className="text-muted" data-testid="lyric-chord-align-no-lyrics">
          Add a line or section, then place chords on words or the spaces at the
          end of the line.
        </p>
      ) : null}
      {rows.map(function(row, rowIndex) {
        if (row.type === 'preface') return null
        if (row.type === 'blank') {
          return <div key={rowIndex} className="chordpro-line-spacer" aria-hidden="true" />
        }
        if (row.type === 'header') {
          return (
            <div
              key={rowIndex}
              className="lyric-chord-align-header-row"
              data-testid="lyric-chord-align-header"
            >
              <div className="lyrics-section-header">{displaySectionHeader(row.text)}</div>
              {renderRowActions([
                <Button
                  key="edit"
                  size="sm"
                  variant="outline-secondary"
                  data-testid="lyric-chord-align-edit-section"
                  onClick={function() { openSectionTextDialog(rowIndex) }}
                >
                  Edit
                </Button>,
                <Button
                  key="add-line"
                  size="sm"
                  variant="outline-secondary"
                  data-testid="lyric-chord-align-add-line"
                  onClick={function() { addLyricLine(rowIndex) }}
                >
                  + Line
                </Button>,
                <Button
                  key="add-section"
                  size="sm"
                  variant="outline-secondary"
                  data-testid="lyric-chord-align-add-section"
                  onClick={function() { openNewSectionDialog(rowIndex) }}
                >
                  + Section
                </Button>,
                <Button
                  key="delete"
                  size="sm"
                  variant="outline-danger"
                  data-testid="lyric-chord-align-delete-section"
                  onClick={function() { removeSection(rowIndex) }}
                >
                  Delete
                </Button>,
              ])}
            </div>
          )
        }
        const text = String(row.text || '')
        const anchors = Array.isArray(row.anchors) ? row.anchors : []
        const dragging = dragState && dragState.rowIndex === rowIndex
        const chars = alignLineDisplayChars(text)

        return (
          <div
            key={rowIndex}
            className="lyric-chord-align-line-row"
            data-testid="lyric-chord-align-line-row"
          >
            <div
              className="chordpro-line lyric-chord-align-line"
              data-testid="lyric-chord-align-line"
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end' }}
            >
            {chars.map(function(ch, offset) {
              if (ch === '/') return null
              const isPad = offset >= text.length
              const isSpace = isPad || /\s/.test(ch)
              const displayChar = isSpace ? '\u00A0' : ch
              const chord = chordAtOffset(anchors, offset)
              const displayedChord = chord ? displayChordName(chord) : ''
              const anchorIndex = anchors.findIndex(function(a) {
                return Number(a.offset) === offset
              })
              const isHover = dragging && dragState.hoverOffset === offset
              const isSource = dragging && dragState.fromOffset === offset
              const showAdd = !chord && (isPad || isWordStartOffset(text, offset))
              const canAddHere = !chord
              return (
                <span
                  key={offset}
                  className={
                    'chordpro-token lyric-chord-align-token lyric-chord-align-letter'
                    + (isSpace ? ' lyric-chord-align-letter--space' : '')
                    + (isPad ? ' lyric-chord-align-letter--pad' : '')
                    + (chord && isSpace ? ' lyric-chord-align-letter--has-chord' : '')
                    + (isHover ? ' lyric-chord-align-token--target' : '')
                    + (isSource ? ' lyric-chord-align-token--source' : '')
                  }
                  data-testid={isPad ? 'lyric-chord-align-trailing-pad' : undefined}
                  ref={function(el) {
                    if (!letterRefs.current[rowIndex]) letterRefs.current[rowIndex] = {}
                    letterRefs.current[rowIndex][offset] = el
                  }}
                >
                  <span
                    className={
                      'chordpro-chord lyric-chord-align-chord'
                      + (chord ? ' lyric-chord-align-chord--draggable' : '')
                      + (showAdd ? ' lyric-chord-align-chord--add' : '')
                    }
                    style={{
                      fontWeight: 'bold',
                      lineHeight: '1.25em',
                      cursor: chord ? 'grab' : (canAddHere ? 'pointer' : 'default'),
                      touchAction: 'none',
                      userSelect: 'none',
                      fontSize: displayedChord && displayedChord.length > 2 ? '0.75em' : '1em',
                    }}
                    data-testid={displayedChord ? 'lyric-chord-align-chord-label' : undefined}
                    onPointerDown={chord && anchorIndex >= 0
                      ? function(e) { handlePointerDown(e, rowIndex, anchorIndex, offset) }
                      : undefined}
                    onClick={!chord
                      ? function(e) {
                        e.preventDefault()
                        e.stopPropagation()
                        openChordDialog({
                          rowIndex: rowIndex,
                          anchorIndex: -1,
                          offset: offset,
                          chord: '',
                        })
                      }
                      : undefined}
                    title={chord
                      ? 'Drag to align, or click to edit'
                      : 'Add chord'}
                  >
                    {displayedChord
                      ? displayedChord
                      : (showAdd
                        ? (
                          <button
                            type="button"
                            className="lyric-chord-align-add"
                            data-testid="lyric-chord-add"
                            aria-label="Add chord"
                            onClick={function(e) {
                              e.preventDefault()
                              e.stopPropagation()
                              openChordDialog({
                                rowIndex: rowIndex,
                                anchorIndex: -1,
                                offset: offset,
                                chord: '',
                              })
                            }}
                          >
                            +
                          </button>
                        )
                        : '\u00A0')}
                  </span>
                  <span
                    className={
                      'chordpro-lyric lyric-chord-align-word lyric-chord-align-char'
                      + (isHover ? ' lyric-chord-align-word--cursor' : '')
                    }
                  >
                    {displayChar}
                  </span>
                </span>
              )
            })}
            </div>
            {renderRowActions([
              <Button
                key="edit"
                size="sm"
                variant="outline-secondary"
                data-testid="lyric-chord-align-edit-line"
                onClick={function() { openLyricTextDialog(rowIndex) }}
              >
                Edit
              </Button>,
              <Button
                key="add-line"
                size="sm"
                variant="outline-secondary"
                data-testid="lyric-chord-align-add-line"
                onClick={function() { addLyricLine(rowIndex) }}
              >
                + Line
              </Button>,
              <Button
                key="delete"
                size="sm"
                variant="outline-danger"
                data-testid="lyric-chord-align-delete-line"
                onClick={function() { removeLyricLine(rowIndex) }}
              >
                Delete
              </Button>,
            ])}
          </div>
        )
      })}
      <Modal
        show={!!chordDialog}
        onHide={closeChordDialog}
        centered
        autoFocus={false}
        restoreFocus={false}
        data-testid="lyric-chord-edit-dialog"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {chordDialog && chordDialog.anchorIndex >= 0 ? 'Edit chord' : 'Add chord'}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group controlId="lyric-chord-symbol">
            <Form.Label>Chord symbol</Form.Label>
            <Form.Control
              type="text"
              ref={chordInputRef}
              data-testid="lyric-chord-symbol-input"
              value={chordDialog ? chordDialog.chord : ''}
              placeholder="Am"
              onChange={function(e) {
                if (!chordDialog) return
                setChordDialog(Object.assign({}, chordDialog, { chord: e.target.value }))
              }}
              onKeyDown={function(e) {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveChordDialog()
                }
              }}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeChordDialog}>Cancel</Button>
          {chordDialog && chordDialog.anchorIndex >= 0 ? (
            <Button variant="outline-danger" onClick={removeChordFromDialog}>
              Remove
            </Button>
          ) : null}
          <Button
            variant="primary"
            data-testid="lyric-chord-dialog-save"
            onClick={saveChordDialog}
          >
            {chordDialog && chordDialog.anchorIndex >= 0 ? 'Save' : 'Add'}
          </Button>
        </Modal.Footer>
      </Modal>
      <Modal
        show={!!textDialog}
        onHide={closeTextDialog}
        centered
        autoFocus={false}
        restoreFocus={false}
        data-testid="lyric-chord-text-dialog"
      >
        <Modal.Header closeButton>
          <Modal.Title>
            {textDialog && textDialog.kind === 'lyric'
              ? 'Edit lyric line'
              : (textDialog && textDialog.kind === 'new-lyric'
                ? 'New lyric line'
                : (textDialog && textDialog.kind === 'section' ? 'Edit section' : 'New section'))}
          </Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group controlId="lyric-chord-text">
            <Form.Label>
              {textDialog && (textDialog.kind === 'lyric' || textDialog.kind === 'new-lyric') ? 'Lyrics' : 'Section name'}
            </Form.Label>
            <Form.Control
              as={textDialog && (textDialog.kind === 'lyric' || textDialog.kind === 'new-lyric') ? 'textarea' : undefined}
              rows={textDialog && (textDialog.kind === 'lyric' || textDialog.kind === 'new-lyric') ? 3 : undefined}
              type="text"
              ref={textInputRef}
              value={textDialog ? textDialog.value : ''}
              placeholder={textDialog && (textDialog.kind === 'lyric' || textDialog.kind === 'new-lyric') ? 'Lyric line' : 'Verse 2'}
              onChange={function(e) {
                if (!textDialog) return
                setTextDialog(Object.assign({}, textDialog, { value: e.target.value }))
              }}
              onKeyDown={function(e) {
                const isLyric = textDialog && (textDialog.kind === 'lyric' || textDialog.kind === 'new-lyric')
                if (e.key === 'Enter' && !(isLyric && !e.ctrlKey && !e.metaKey)) {
                  if (isLyric && (e.ctrlKey || e.metaKey)) {
                    e.preventDefault()
                    saveTextDialog()
                    return
                  }
                  if (!isLyric) {
                    e.preventDefault()
                    saveTextDialog()
                  }
                }
              }}
            />
          </Form.Group>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={closeTextDialog}>Cancel</Button>
          <Button
            variant="primary"
            data-testid="lyric-chord-text-save"
            disabled={textDialog && textDialog.kind !== 'lyric' && !String(textDialog.value || '').trim()}
            onClick={saveTextDialog}
          >
            {textDialog && (textDialog.kind === 'new-section' || textDialog.kind === 'new-lyric')
              ? (textDialog.kind === 'new-lyric' ? 'Add line' : 'Add section')
              : 'Save'}
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
