import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'

/** Pause after the last +/- click before applying notation/chords/save. */
export const TRANSPOSE_DEBOUNCE_MS = 500

/**
 * +/- transpose control with a local pending value.
 * Parent (and expensive notation/chords) only receive onCommit after debounce,
 * so rapid clicks do not re-render Abc on every step.
 */
export default function TuneTransposeControl(props) {
  const value = Number(props.value) || 0
  const debounceMs = props.debounceMs != null ? props.debounceMs : TRANSPOSE_DEBOUNCE_MS
  const size = props.size || 'sm'
  const groupClassName = props.groupClassName || 'music-transpose-group'
  const onCommit = props.onCommit

  const [display, setDisplay] = useState(value)
  const displayRef = useRef(display)
  const pendingRef = useRef(null)
  const timerRef = useRef(null)
  const onCommitRef = useRef(onCommit)
  onCommitRef.current = onCommit
  displayRef.current = display

  function clearTimer() {
    if (timerRef.current != null) {
      clearTimeout(timerRef.current)
      timerRef.current = null
    }
  }

  function commit(next) {
    pendingRef.current = null
    if (typeof onCommitRef.current === 'function') onCommitRef.current(next)
  }

  // Sync from parent when not mid-gesture.
  useEffect(function() {
    if (pendingRef.current != null) return
    if (value === displayRef.current) return
    setDisplay(value)
    displayRef.current = value
  }, [value])

  // Flush pending commit on unmount so the last click is not lost.
  useEffect(function() {
    return function() {
      clearTimer()
      if (pendingRef.current == null) return
      const next = pendingRef.current
      pendingRef.current = null
      if (typeof onCommitRef.current === 'function') onCommitRef.current(next)
    }
  }, [])

  const bump = useCallback(function(delta) {
    const next = displayRef.current + (Number(delta) || 0)
    displayRef.current = next
    setDisplay(next)
    pendingRef.current = next
    clearTimer()
    timerRef.current = setTimeout(function() {
      timerRef.current = null
      if (pendingRef.current == null) return
      commit(pendingRef.current)
    }, debounceMs)
  }, [debounceMs])

  return (
    <ButtonGroup size={size} className={groupClassName}>
      <Button
        type="button"
        variant="outline-secondary"
        onClick={function() { bump(-1) }}
        aria-label="Transpose down"
      >
        −
      </Button>
      <Button type="button" variant="outline-secondary" disabled>
        {display >= 0 ? '+' + display : display}
      </Button>
      <Button
        type="button"
        variant="outline-secondary"
        onClick={function() { bump(1) }}
        aria-label="Transpose up"
      >
        +
      </Button>
    </ButtonGroup>
  )
}
