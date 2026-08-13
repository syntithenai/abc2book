import React, { useEffect, useRef, useState } from 'react'
import {
  alignRowsHaveChords,
  alignRowsToChordProLines,
  chordAtOffset,
  letterIndexNearestClientX,
  lyricLinesToAlignRows,
  moveChordAnchor,
  snapOffsetToLetter,
} from '../lyricChordAlignUtils'
import { displaySectionHeader } from '../LyricsDisplayLines'

/**
 * Drag-to-align ChordPro/COW chords onto any letter. Does not create or delete chords.
 */
export default function LyricChordAlignPanel(props) {
  const lyricsText = props.lyricsText || ''
  const onChange = typeof props.onChange === 'function' ? props.onChange : function() {}

  const lines = String(lyricsText).split(/\r?\n/)
  const [rows, setRows] = useState(function() { return lyricLinesToAlignRows(lines) })
  const rowsRef = useRef(rows)
  const letterRefs = useRef({})
  const dragRef = useRef(null)
  const [dragState, setDragState] = useState(null)

  useEffect(function() {
    const next = lyricLinesToAlignRows(String(lyricsText).split(/\r?\n/))
    rowsRef.current = next
    setRows(next)
    setDragState(null)
    dragRef.current = null
  }, [lyricsText])

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

  function setRowAnchors(rowIndex, anchors) {
    const next = rowsRef.current.map(function(row, index) {
      if (index !== rowIndex || row.type !== 'lyric') return row
      return Object.assign({}, row, { anchors: anchors })
    })
    rowsRef.current = next
    setRows(next)
    onChange(alignRowsToChordProLines(next).join('\n'))
  }

  function getLetterRects(rowIndex) {
    const map = letterRefs.current[rowIndex] || {}
    const row = rowsRef.current[rowIndex]
    const text = row && row.text != null ? String(row.text) : ''
    const rects = []
    for (let i = 0; i < text.length; i += 1) {
      const el = map[i]
      rects.push(el ? el.getBoundingClientRect() : null)
    }
    return rects
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
      const current = rowsRef.current[drag.rowIndex]
      if (!current || current.type !== 'lyric') return
      const rects = getLetterRects(drag.rowIndex)
      const hoverOffset = letterIndexNearestClientX(rects, moveEvent.clientX, current.text)
      if (hoverOffset < 0 || hoverOffset === drag.hoverOffset) return
      const next = Object.assign({}, drag, { hoverOffset: hoverOffset })
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
      const target = snapOffsetToLetter(current.text, drag.hoverOffset)
      if (target === drag.fromOffset) return
      const moved = moveChordAnchor(current.anchors, drag.anchorIndex, target, current.text)
      setRowAnchors(drag.rowIndex, moved)
    }

    const state = {
      rowIndex: rowIndex,
      anchorIndex: anchorIndex,
      fromOffset: fromOffset,
      hoverOffset: fromOffset,
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

  if (!alignRowsHaveChords(rows)) {
    return (
      <div className="lyric-chord-align-panel lyric-chord-align-panel--empty" data-testid="lyric-chord-align-empty">
        <p>
          No chords in the lyrics text to align. Add ChordPro chords in the Text tab
          (e.g. <code>[Am]word</code>), or use <strong>To Lyrics</strong> on the Chords tab
          to place notation chords into the lyrics.
        </p>
      </div>
    )
  }

  return (
    <div
      className="lyric-chord-align-panel"
      data-testid="lyric-chord-align-panel"
    >
      <p className="lyric-chord-align-hint text-muted small">
        Drag chords left or right onto any letter. Create or delete chords in the Text tab.
      </p>
      {rows.map(function(row, rowIndex) {
        if (row.type === 'blank') {
          return <div key={rowIndex} className="chordpro-line-spacer" aria-hidden="true" />
        }
        if (row.type === 'header') {
          return (
            <div key={rowIndex} className="lyrics-section-header">
              {displaySectionHeader(row.text)}
            </div>
          )
        }
        const text = String(row.text || '')
        const anchors = Array.isArray(row.anchors) ? row.anchors : []
        const dragging = dragState && dragState.rowIndex === rowIndex
        const chars = text.length ? text.split('') : ['\u00A0']

        return (
          <div
            key={rowIndex}
            className="chordpro-line lyric-chord-align-line"
            style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: '0.35em' }}
          >
            {chars.map(function(ch, offset) {
              const isSpace = /\s/.test(ch)
              const displayChar = ch === ' ' ? '\u00A0' : ch
              const chord = text.length ? chordAtOffset(anchors, offset) : ''
              const anchorIndex = anchors.findIndex(function(a) {
                return Number(a.offset) === offset
              })
              const isHover = dragging && dragState.hoverOffset === offset
              const isSource = dragging && dragState.fromOffset === offset
              return (
                <span
                  key={offset}
                  className={
                    'chordpro-token lyric-chord-align-token lyric-chord-align-letter'
                    + (isSpace ? ' lyric-chord-align-letter--space' : '')
                    + (isHover ? ' lyric-chord-align-token--target' : '')
                    + (isSource ? ' lyric-chord-align-token--source' : '')
                  }
                  ref={function(el) {
                    if (!letterRefs.current[rowIndex]) letterRefs.current[rowIndex] = {}
                    letterRefs.current[rowIndex][offset] = el
                  }}
                >
                  <span
                    className={
                      'chordpro-chord lyric-chord-align-chord'
                      + (chord ? ' lyric-chord-align-chord--draggable' : '')
                    }
                    style={{
                      fontWeight: 'bold',
                      lineHeight: '1.25em',
                      cursor: chord ? 'grab' : 'default',
                      touchAction: 'none',
                      userSelect: 'none',
                      fontSize: chord && chord.length > 2 ? '0.75em' : '1em',
                    }}
                    onPointerDown={chord && anchorIndex >= 0
                      ? function(e) { handlePointerDown(e, rowIndex, anchorIndex, offset) }
                      : undefined}
                    title={chord ? 'Drag to align with a letter' : undefined}
                  >
                    {chord || '\u00A0'}
                  </span>
                  <span
                    className={
                      'chordpro-lyric lyric-chord-align-word lyric-chord-align-char'
                      + (isHover && !isSpace ? ' lyric-chord-align-word--cursor' : '')
                    }
                  >
                    {displayChar}
                  </span>
                </span>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
