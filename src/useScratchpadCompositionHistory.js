import { useCallback, useRef, useState } from 'react'

const MAX_HISTORY = 50

function cloneComposition(composition) {
  return JSON.parse(JSON.stringify(composition || {}))
}

export default function useScratchpadCompositionHistory() {
  const undoStackRef = useRef([])
  const redoStackRef = useRef([])
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)

  const syncFlags = useCallback(function() {
    setCanUndo(undoStackRef.current.length > 0)
    setCanRedo(redoStackRef.current.length > 0)
  }, [])

  const reset = useCallback(function() {
    undoStackRef.current = []
    redoStackRef.current = []
    syncFlags()
  }, [syncFlags])

  const record = useCallback(function(composition) {
    undoStackRef.current = undoStackRef.current.concat([cloneComposition(composition)]).slice(-MAX_HISTORY)
    redoStackRef.current = []
    syncFlags()
  }, [syncFlags])

  const undo = useCallback(function(currentComposition) {
    if (!undoStackRef.current.length) return null
    redoStackRef.current = redoStackRef.current.concat([cloneComposition(currentComposition)])
    const previous = undoStackRef.current.pop()
    syncFlags()
    return previous
  }, [syncFlags])

  const redo = useCallback(function(currentComposition) {
    if (!redoStackRef.current.length) return null
    undoStackRef.current = undoStackRef.current.concat([cloneComposition(currentComposition)])
    const next = redoStackRef.current.pop()
    syncFlags()
    return next
  }, [syncFlags])

  return {
    canUndo: canUndo,
    canRedo: canRedo,
    record: record,
    undo: undo,
    redo: redo,
    reset: reset,
  }
}
