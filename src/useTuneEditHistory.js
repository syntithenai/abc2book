import { useEffect, useRef, useState } from 'react'
import useUtils from './useUtils'
import {
  canRedoTuneEdit,
  canUndoTuneEdit,
  commitTuneHistoryEntry,
  flushPendingTuneEdit,
  getRedoTuneEditLabel,
  getUndoTuneEditLabel,
  loadConfiguredMaxEntries,
  normalizeTuneEditHistoryState,
  pruneTuneEditHistoryState,
  queuePendingTuneEdit,
  stepRedoTuneEdit,
  stepUndoTuneEdit,
} from './tuneEditHistory'

const STORAGE_KEY = 'bookstorage_tune_edit_history'
const DEFAULT_DEBOUNCE_MS = 800

export default function useTuneEditHistory(options) {
  const utils = useUtils()
  const {
    maxEntries = loadConfiguredMaxEntries(),
    debounceMs = DEFAULT_DEBOUNCE_MS,
    getValidTuneIds,
    getTunesReady,
  } = options || {}

  const [historyState, setHistoryState] = useState(function() {
    return normalizeTuneEditHistoryState()
  })
  const [isLoaded, setIsLoaded] = useState(false)
  const historyRef = useRef(historyState)
  const pendingEntriesRef = useRef({})
  const pendingTimersRef = useRef({})
  const loadedRef = useRef(false)
  const getValidTuneIdsRef = useRef(getValidTuneIds)
  const getTunesReadyRef = useRef(getTunesReady)

  const utilsRef = useRef(utils)
  utilsRef.current = utils

  useEffect(function() {
    getValidTuneIdsRef.current = getValidTuneIds
  }, [getValidTuneIds])

  useEffect(function() {
    getTunesReadyRef.current = getTunesReady
  }, [getTunesReady])

  function replaceHistoryState(nextState) {
    if (historyRef.current === nextState) return
    try {
      if (JSON.stringify(historyRef.current) === JSON.stringify(nextState)) return
    } catch (e) { /* ignore compare errors */ }
    historyRef.current = nextState
    setHistoryState(nextState)
  }

  function clearPendingTimer(tuneId) {
    if (pendingTimersRef.current[tuneId]) {
      clearTimeout(pendingTimersRef.current[tuneId])
      delete pendingTimersRef.current[tuneId]
    }
  }

  function flushPendingTune(tuneId) {
    clearPendingTimer(tuneId)
    const result = flushPendingTuneEdit(historyRef.current, pendingEntriesRef.current, tuneId, maxEntries)
    pendingEntriesRef.current = result.pendingEntries
    if (result.committed) {
      replaceHistoryState(result.state)
    }
    return result
  }

  function resolvePruneAllowed() {
    if (!loadedRef.current) return null
    if (typeof getTunesReadyRef.current === 'function' && !getTunesReadyRef.current()) return null
    const ids = typeof getValidTuneIdsRef.current === 'function' ? getValidTuneIdsRef.current() : []
    return new Set(Array.isArray(ids) ? ids : [])
  }

  useEffect(function() {
    let cancelled = false
    utilsRef.current.loadLocalforageObject(STORAGE_KEY).then(function(stored) {
      if (cancelled) return
      const allowed = resolvePruneAllowed()
      const nextState = pruneTuneEditHistoryState(stored, allowed, maxEntries)
      loadedRef.current = true
      setIsLoaded(true)
      replaceHistoryState(nextState)
    })
    return function() {
      cancelled = true
      Object.keys(pendingTimersRef.current).forEach(function(tuneId) {
        clearTimeout(pendingTimersRef.current[tuneId])
      })
      pendingTimersRef.current = {}
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- load persisted edit history once on mount
  }, [])

  useEffect(function() {
    if (!loadedRef.current) return
    utilsRef.current.saveLocalforageObject(STORAGE_KEY, historyState)
  }, [historyState])

  function recordChange(change) {
    if (!change || !change.tuneId) return
    if (change.immediate) {
      flushPendingTune(change.tuneId)
      const nextState = commitTuneHistoryEntry(historyRef.current, change, maxEntries)
      replaceHistoryState(nextState)
      return
    }

    pendingEntriesRef.current = queuePendingTuneEdit(pendingEntriesRef.current, change)
    clearPendingTimer(change.tuneId)
    pendingTimersRef.current[change.tuneId] = setTimeout(function() {
      flushPendingTune(change.tuneId)
    }, debounceMs)
  }

  function pruneHistory(validTuneIds) {
    if (!loadedRef.current) return
    if (validTuneIds === undefined) return
    const allowed = validTuneIds === null
      ? resolvePruneAllowed()
      : new Set(Array.isArray(validTuneIds) ? validTuneIds : [])
    if (allowed === null) return
    const nextState = pruneTuneEditHistoryState(historyRef.current, allowed, maxEntries)
    replaceHistoryState(nextState)
  }

  function undoTune(tuneId, applyEntry) {
    flushPendingTune(tuneId)
    const result = stepUndoTuneEdit(historyRef.current, tuneId)
    if (!result.entry) return false
    replaceHistoryState(result.state)
    if (typeof applyEntry === 'function') {
      applyEntry(result.entry, 'undo')
    }
    return true
  }

  function redoTune(tuneId, applyEntry) {
    flushPendingTune(tuneId)
    const result = stepRedoTuneEdit(historyRef.current, tuneId)
    if (!result.entry) return false
    replaceHistoryState(result.state)
    if (typeof applyEntry === 'function') {
      applyEntry(result.entry, 'redo')
    }
    return true
  }

  return {
    historyState: historyState,
    isLoaded: isLoaded,
    flushPendingTune: flushPendingTune,
    recordChange: recordChange,
    pruneHistory: pruneHistory,
    undoTune: undoTune,
    redoTune: redoTune,
    canUndo: function(tuneId) {
      if (pendingEntriesRef.current && pendingEntriesRef.current[tuneId]) return true
      return canUndoTuneEdit(historyRef.current, tuneId)
    },
    canRedo: function(tuneId) {
      return canRedoTuneEdit(historyRef.current, tuneId)
    },
    getUndoLabel: function(tuneId) {
      return getUndoTuneEditLabel(historyRef.current, tuneId)
    },
    getRedoLabel: function(tuneId) {
      return getRedoTuneEditLabel(historyRef.current, tuneId)
    },
  }
}
