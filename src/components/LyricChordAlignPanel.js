import React, { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Button, Form, Modal } from 'react-bootstrap'
import {
  alignDisplayIndexToOffset,
  alignLetterClickToCaret,
  alignLineDisplayChars,
  alignRowsToChordProLines,
  applyAlignChordAnchors,
  isAlignPadOffset,
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
import { displaySectionHeader, SectionHeader } from '../LyricsDisplayLines'
import { applyChordDisplayTranspose } from '../chordKeyMergeOptions'
import { chordLetterGapSlotChars, nextAnchorAfterOffset } from '../chordLabelGap'
import { icons } from '../Icons'

const DRAG_THRESHOLD_PX = 6
const PREVENT_SCROLL_FOCUS = { preventScroll: true }

function clickXToCaret(text, clientX, rect) {
  const raw = String(text == null ? '' : text)
  const len = raw.length
  if (!len) return 0
  const left = rect ? Number(rect.left) : NaN
  const right = rect ? Number(rect.right) : NaN
  const x = Number(clientX)
  if (!Number.isFinite(left) || !Number.isFinite(right) || !(right > left) || !Number.isFinite(x)) return 0
  const ratio = (x - left) / (right - left)
  return Math.max(0, Math.min(len, Math.round(ratio * len)))
}

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
  const textCaretRef = useRef(null)
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
  const textDialogRef = useRef(null)

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
  const inlineTextEditing = !!(textDialog && (
    textDialog.kind === 'lyric'
    || textDialog.kind === 'new-lyric'
    || textDialog.kind === 'section'
  ))
  const sectionDialogOpen = !!(textDialog && textDialog.kind === 'new-section')
  useLayoutEffect(function() {
    if (!chordDialogOpen) return
    focusWithoutScroll(chordInputRef.current)
  }, [chordDialogOpen])

  function setTextDialogState(next) {
    textDialogRef.current = next
    setTextDialog(next)
  }

  function applyPendingTextCaret(el) {
    if (!el || textCaretRef.current == null || typeof el.setSelectionRange !== 'function') return
    const caret = Number(textCaretRef.current)
    const value = String(el.value || '')
    const pos = Math.max(0, Math.min(value.length, Number.isFinite(caret) ? caret : 0))
    try {
      el.setSelectionRange(pos, pos)
    } catch (err) {}
  }

  function focusTextDialogInput() {
    const el = textInputRef.current
    focusWithoutScroll(el)
    applyPendingTextCaret(el)
  }

  useLayoutEffect(function() {
    if (!inlineTextEditing) return
    focusTextDialogInput()
  }, [inlineTextEditing, textDialog && textDialog.kind, textDialog && textDialog.rowIndex])

  useLayoutEffect(function() {
    if (!sectionDialogOpen) return
    focusTextDialogInput()
  }, [sectionDialogOpen])

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
      applyAlignChordAnchors(row, chordDialog.offset, function(text, currentAnchors, at) {
        return upsertChordAnchor(currentAnchors, at, chord, text)
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
      const hoverDisplay = letterIndexNearestClientX(rects, moveEvent.clientX, current.text)
      const hoverOffset = hoverDisplay >= 0
        ? alignDisplayIndexToOffset(hoverDisplay)
        : drag.hoverOffset
      const next = Object.assign({}, drag, {
        dragging: true,
        hoverOffset: hoverOffset,
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
        applyAlignChordAnchors(current, target, function(text, currentAnchors, at) {
          return moveChordAnchor(currentAnchors, drag.anchorIndex, at, text)
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

  function finishInlineTextEdit() {
    const dialog = textDialogRef.current
    if (!dialog) return
    if (dialog.kind === 'lyric') {
      saveTextDialog()
      return
    }
    if (dialog.kind === 'new-lyric' || dialog.kind === 'new-section' || dialog.kind === 'section') {
      if (!String(dialog.value || '').trim()) {
        closeTextDialog()
        return
      }
      saveTextDialog()
    }
  }

  function openLyricTextDialogAtClick(event, rowIndex, offset) {
    const row = rowsRef.current[rowIndex]
    if (!row || row.type !== 'lyric') return
    const current = textDialogRef.current
    if (current && current.kind === 'lyric' && current.rowIndex === rowIndex) return
    finishInlineTextEdit()
    const value = String(row.text || '')
    const rect = event && event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function'
      ? event.currentTarget.getBoundingClientRect()
      : null
    const clientX = event && Number.isFinite(event.clientX) ? event.clientX : NaN
    textCaretRef.current = alignLetterClickToCaret(value, offset, clientX, rect)
    setTextDialogState({ kind: 'lyric', rowIndex: rowIndex, value: value })
  }

  function openSectionTextDialogAtClick(event, rowIndex) {
    const row = rowsRef.current[rowIndex]
    if (!row || row.type !== 'header') return
    const current = textDialogRef.current
    if (current && current.kind === 'section' && current.rowIndex === rowIndex) return
    finishInlineTextEdit()
    const value = displaySectionHeader(row.text) || ''
    const rect = event && event.currentTarget && typeof event.currentTarget.getBoundingClientRect === 'function'
      ? event.currentTarget.getBoundingClientRect()
      : null
    const clientX = event && Number.isFinite(event.clientX) ? event.clientX : NaN
    textCaretRef.current = clickXToCaret(value, clientX, rect)
    setTextDialogState({
      kind: 'section',
      rowIndex: rowIndex,
      value: value,
    })
  }

  function openNewLyricDialog(afterIndex) {
    finishInlineTextEdit()
    textCaretRef.current = 0
    setTextDialogState({
      kind: 'new-lyric',
      rowIndex: afterIndex == null ? -1 : afterIndex,
      value: '',
    })
  }

  function openNewSectionDialog(afterIndex) {
    finishInlineTextEdit()
    textCaretRef.current = 0
    setTextDialogState({
      kind: 'new-section',
      rowIndex: afterIndex == null ? -1 : afterIndex,
      value: '',
    })
  }

  function closeTextDialog() {
    textCaretRef.current = null
    setTextDialogState(null)
  }

  function saveTextDialog() {
    const dialog = textDialogRef.current
    if (!dialog) return
    const value = String(dialog.value || '')
    if (
      (dialog.kind === 'section' || dialog.kind === 'new-lyric')
      && !value.trim()
    ) {
      closeTextDialog()
      return
    }
    if (dialog.kind === 'new-section' && !value.trim()) return
    closeTextDialog()
    if (dialog.kind === 'lyric') {
      commitRows(setAlignLyricText(rowsRef.current, dialog.rowIndex, value))
    } else if (dialog.kind === 'new-lyric') {
      const current = rowsRef.current
      const at = Number(dialog.rowIndex)
      const insertAt = (!Number.isFinite(at) || at < 0 || at >= current.length)
        ? current.length
        : at + 1
      const next = setAlignLyricText(
        insertAlignLyricRow(current, dialog.rowIndex),
        insertAt,
        value
      )
      commitRows(next)
    } else if (dialog.kind === 'section') {
      commitRows(setAlignHeaderText(rowsRef.current, dialog.rowIndex, value))
    } else if (dialog.kind === 'new-section') {
      commitRows(insertAlignSectionAfter(rowsRef.current, dialog.rowIndex, value))
    }
  }

  function addLyricLine(afterIndex) {
    openNewLyricDialog(afterIndex)
  }

  function removeLyricLine(rowIndex) {
    const dialog = textDialogRef.current
    if (dialog && (dialog.kind === 'lyric' || dialog.kind === 'new-lyric' || dialog.kind === 'section' || dialog.kind === 'new-section')) {
      closeTextDialog()
    }
    commitRows(deleteAlignRow(rowsRef.current, rowIndex))
  }

  function removeSection(rowIndex) {
    const dialog = textDialogRef.current
    if (dialog && (dialog.kind === 'lyric' || dialog.kind === 'new-lyric' || dialog.kind === 'section' || dialog.kind === 'new-section')) {
      closeTextDialog()
    }
    commitRows(deleteAlignSection(rowsRef.current, rowIndex))
  }

  function renderRowActions(buttons) {
    return (
      <div className="lyric-chord-align-row-actions">
        {buttons}
      </div>
    )
  }

  function renderIconButton(opts) {
    return (
      <Button
        key={opts.key}
        size="sm"
        variant={opts.variant}
        className="lyric-chord-align-icon-btn"
        data-testid={opts.testId}
        title={opts.label}
        aria-label={opts.label}
        onClick={opts.onClick}
      >
        {opts.icon}
      </Button>
    )
  }

  function renderAddLineButton(rowIndex) {
    return renderIconButton({
      key: 'add-line',
      variant: 'outline-secondary',
      testId: 'lyric-chord-align-add-line',
      label: 'Add line',
      icon: icons.add,
      onClick: function() { addLyricLine(rowIndex) },
    })
  }

  function renderDeleteLineButton(rowIndex) {
    return renderIconButton({
      key: 'delete',
      variant: 'outline-danger',
      testId: 'lyric-chord-align-delete-line',
      label: 'Delete line',
      icon: icons.deletebin,
      onClick: function() { removeLyricLine(rowIndex) },
    })
  }

  function renderDeleteSectionButton(rowIndex) {
    return renderIconButton({
      key: 'delete',
      variant: 'outline-danger',
      testId: 'lyric-chord-align-delete-section',
      label: 'Delete section',
      icon: icons.deletebin,
      onClick: function() { removeSection(rowIndex) },
    })
  }

  function updateInlineLyricValue(value) {
    const dialog = textDialogRef.current
    if (!dialog) return
    textCaretRef.current = null
    setTextDialogState(Object.assign({}, dialog, { value: value }))
  }

  function handleInlineLyricKeyDown(event) {
    if (event.key === 'Enter' || event.key === 'Escape') {
      event.preventDefault()
      saveTextDialog()
    }
  }

  function handleInlineLyricBlur(event) {
    if (event && event.target !== textInputRef.current) return
    const dialog = textDialogRef.current
    if (!dialog) return
    saveTextDialog()
  }

  function renderInlineTextInput(opts) {
    return (
      <input
        ref={textInputRef}
        type="text"
        className={'form-control lyric-chord-align-line-input' + (opts.className ? ' ' + opts.className : '')}
        data-testid={opts.testId}
        value={textDialog ? textDialog.value : ''}
        placeholder={opts.placeholder}
        aria-label={opts.ariaLabel}
        onFocus={function(e) {
          applyPendingTextCaret(e.target)
        }}
        onChange={function(e) {
          updateInlineLyricValue(e.target.value)
        }}
        onKeyDown={handleInlineLyricKeyDown}
        onBlur={handleInlineLyricBlur}
      />
    )
  }

  function renderInlineLyricInput() {
    return renderInlineTextInput({
      testId: 'lyric-chord-text-input',
      placeholder: 'Lyric line',
      ariaLabel: 'Edit lyric line',
    })
  }

  function renderInlineSectionInput() {
    return renderInlineTextInput({
      testId: 'lyric-chord-section-input',
      placeholder: 'Verse 2',
      ariaLabel: 'Edit section name',
      className: 'lyric-chord-align-section-input',
    })
  }

  function lyricStripeClass(stripeIndex) {
    return stripeIndex % 2 === 0
      ? ' lyric-chord-align-line-row--even'
      : ' lyric-chord-align-line-row--odd'
  }

  function lyricsBeforeOrAt(rowIndex) {
    let count = 0
    const end = Number(rowIndex)
    const last = Number.isFinite(end) ? Math.min(end, rows.length - 1) : -1
    for (let i = 0; i <= last; i += 1) {
      if (rows[i] && rows[i].type === 'lyric') count += 1
    }
    return count
  }

  function renderInlineLyricEditorRow(stripeIndex) {
    return (
      <div
        className={'lyric-chord-align-line-row' + lyricStripeClass(stripeIndex == null ? 0 : stripeIndex)}
        data-testid="lyric-chord-align-line-row"
      >
        <div
          className="chordpro-line lyric-chord-align-line lyric-chord-align-line--editing"
          data-testid="lyric-chord-align-line-editor"
        >
          {renderInlineLyricInput()}
        </div>
      </div>
    )
  }

  function newLyricAfterIndex() {
    if (!textDialog || textDialog.kind !== 'new-lyric') return null
    const at = Number(textDialog.rowIndex)
    if (!Number.isFinite(at) || at < 0 || at >= rows.length) return 'end'
    return at
  }

  const hasLyricRows = rows.some(function(row) {
    return row && (row.type === 'lyric' || row.type === 'header')
  })
  const lyricStripeByRow = {}
  let lyricStripeCount = 0
  rows.forEach(function(row, index) {
    if (row && row.type === 'lyric') {
      lyricStripeByRow[index] = lyricStripeCount
      lyricStripeCount += 1
    }
  })

  return (
    <div
      ref={panelRef}
      className="lyric-chord-align-panel"
      data-testid="lyric-chord-align-panel"
    >
      {props.showChordsFromNotation && typeof props.onChordsFromNotation === 'function' ? (
        <div className="lyric-chord-align-from-notation">
          <Button
            variant="warning"
            data-testid="lyric-chord-align-chords-from-notation"
            title="Copy chords from the music notation into the lyrics as ChordPro"
            onClick={props.onChordsFromNotation}
          >
            Chords From Notation
          </Button>
        </div>
      ) : null}
      <p className="lyric-chord-align-hint text-muted small">
        Drag chords onto letters or spaces. Extra space at the start and end of
        each line is for chords before the first word or after the last word.
        Click a lyric or section title to edit it in place. Changes save when
        you leave the field. Click a chord to edit it. Use <strong>+</strong> to
        add a chord. Use the add-line icon on a section or lyric row, and delete
        on the row you want to remove.
      </p>
      <div className="lyric-chord-align-toolbar" data-testid="lyric-chord-align-toolbar">
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
          start and end of the line.
        </p>
      ) : null}
      {rows.map(function(row, rowIndex) {
        if (row.type === 'preface') return null
        if (row.type === 'blank') {
          return <div key={rowIndex} className="chordpro-line-spacer" aria-hidden="true" />
        }
        if (row.type === 'header') {
          const editingHeader = !!(textDialog && textDialog.kind === 'section' && textDialog.rowIndex === rowIndex)
          const headerLabel = displaySectionHeader(row.text) || 'Section'
          return (
            <React.Fragment key={rowIndex}>
              <div
                className="lyric-chord-align-header-row"
                data-testid="lyric-chord-align-header"
              >
                {editingHeader ? (
                  <div className="lyric-chord-align-header-label lyric-chord-align-header-label--editing">
                    {renderInlineSectionInput()}
                  </div>
                ) : (
                  <div
                    className="lyric-chord-align-header-label"
                    data-testid="lyric-chord-align-header-label"
                    title="Click to edit section"
                    onClick={function(e) { openSectionTextDialogAtClick(e, rowIndex) }}
                  >
                    <SectionHeader label={headerLabel} source={row.text} />
                  </div>
                )}
                {renderRowActions([
                  renderAddLineButton(rowIndex),
                  <Button
                    key="add-section"
                    size="sm"
                    variant="outline-secondary"
                    data-testid="lyric-chord-align-add-section"
                    onClick={function() { openNewSectionDialog(rowIndex) }}
                  >
                    + Section
                  </Button>,
                  renderDeleteSectionButton(rowIndex),
                ])}
              </div>
              {newLyricAfterIndex() === rowIndex ? renderInlineLyricEditorRow(lyricsBeforeOrAt(rowIndex)) : null}
            </React.Fragment>
          )
        }
        const text = String(row.text || '')
        const anchors = Array.isArray(row.anchors) ? row.anchors : []
        const dragging = dragState && dragState.rowIndex === rowIndex
        const chars = alignLineDisplayChars(text)
        const editingThis = !!(textDialog && textDialog.kind === 'lyric' && textDialog.rowIndex === rowIndex)
        const stripeIndex = lyricStripeByRow[rowIndex] || 0

        return (
          <React.Fragment key={rowIndex}>
          <div
            className={'lyric-chord-align-line-row' + lyricStripeClass(stripeIndex)}
            data-testid="lyric-chord-align-line-row"
          >
            {editingThis ? (
              <div
                className="chordpro-line lyric-chord-align-line lyric-chord-align-line--editing"
                data-testid="lyric-chord-align-line"
              >
                {renderInlineLyricInput()}
              </div>
            ) : (
            <div
              className="chordpro-line lyric-chord-align-line"
              data-testid="lyric-chord-align-line"
              style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end' }}
            >
            {chars.map(function(ch, displayIndex) {
              if (ch === '/') return null
              const offset = alignDisplayIndexToOffset(displayIndex)
              const isLeadingPad = offset < 0
              const isPad = isAlignPadOffset(text, offset)
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
              const nextChordAnchor = displayedChord
                ? nextAnchorAfterOffset(anchors, offset)
                : null
              const gapChars = displayedChord
                ? chordLetterGapSlotChars(
                  displayedChord,
                  offset,
                  nextChordAnchor && nextChordAnchor.offset
                )
                : 0
              const needsGap = gapChars > 0
              return (
                <span
                  key={displayIndex}
                  className={
                    'chordpro-token lyric-chord-align-token lyric-chord-align-letter'
                    + (isSpace ? ' lyric-chord-align-letter--space' : '')
                    + (isPad ? ' lyric-chord-align-letter--pad' : '')
                    + (chord && isSpace ? ' lyric-chord-align-letter--has-chord' : '')
                    + (needsGap ? ' lyric-chord-align-letter--chord-gap' : '')
                    + (isHover ? ' lyric-chord-align-token--target' : '')
                    + (isSource ? ' lyric-chord-align-token--source' : '')
                  }
                  style={needsGap
                    ? { ['--chord-label-ch']: String(gapChars) }
                    : undefined}
                  data-testid={isLeadingPad
                    ? 'lyric-chord-align-leading-pad'
                    : (isPad ? 'lyric-chord-align-trailing-pad' : undefined)}
                  ref={function(el) {
                    if (!letterRefs.current[rowIndex]) letterRefs.current[rowIndex] = {}
                    letterRefs.current[rowIndex][displayIndex] = el
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
                    data-testid="lyric-chord-align-lyric-char"
                    data-offset={String(offset)}
                    title="Click to edit lyrics"
                    onClick={function(e) {
                      e.preventDefault()
                      e.stopPropagation()
                      openLyricTextDialogAtClick(e, rowIndex, offset)
                    }}
                  >
                    {displayChar}
                  </span>
                </span>
              )
            })}
            </div>
            )}
            {renderRowActions([
              renderAddLineButton(rowIndex),
              renderDeleteLineButton(rowIndex),
            ])}
          </div>
          {newLyricAfterIndex() === rowIndex ? renderInlineLyricEditorRow(lyricsBeforeOrAt(rowIndex)) : null}
          </React.Fragment>
        )
      })}
      {newLyricAfterIndex() === 'end' ? renderInlineLyricEditorRow(lyricStripeCount) : null}
      <Modal
        show={!!chordDialog}
        onHide={saveChordDialog}
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
                if (e.key === 'Enter' || e.key === 'Escape') {
                  e.preventDefault()
                  saveChordDialog()
                }
              }}
            />
          </Form.Group>
        </Modal.Body>
        {chordDialog && chordDialog.anchorIndex >= 0 ? (
          <Modal.Footer>
            <Button variant="outline-danger" onClick={removeChordFromDialog}>
              Remove
            </Button>
          </Modal.Footer>
        ) : null}
      </Modal>
      <Modal
        show={sectionDialogOpen}
        onHide={closeTextDialog}
        onEntered={focusTextDialogInput}
        centered
        autoFocus={false}
        restoreFocus={false}
        data-testid="lyric-chord-text-dialog"
      >
        <Modal.Header closeButton>
          <Modal.Title>New section</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <Form.Group controlId="lyric-chord-new-section">
            <Form.Label>Section name</Form.Label>
            <Form.Control
              type="text"
              ref={textInputRef}
              data-testid="lyric-chord-section-input"
              value={textDialog && textDialog.kind === 'new-section' ? textDialog.value : ''}
              placeholder="Verse 2"
              onChange={function(e) {
                const dialog = textDialogRef.current
                if (!dialog || dialog.kind !== 'new-section') return
                setTextDialogState(Object.assign({}, dialog, { value: e.target.value }))
              }}
              onKeyDown={function(e) {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  saveTextDialog()
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
            disabled={!String(textDialog && textDialog.value || '').trim()}
            onClick={saveTextDialog}
          >
            Add section
          </Button>
        </Modal.Footer>
      </Modal>
    </div>
  )
}
