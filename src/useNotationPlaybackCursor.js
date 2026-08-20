import { useLayoutEffect, useRef } from 'react'
import abcjs from 'abcjs'
import {
  applyPlaybackCursorAtTime,
  resolvePlaybackCursorDuration,
  playbackClockToTimingMs,
  shouldMirrorMidiPlaybackCursor,
} from './notationPlaybackCursor'

const CURSOR_SYNC_MS = 50

function getVisualObjQpm(visualObj, tempoFactor) {
  if (!visualObj) return 120
  const tempo = visualObj.metaText ? visualObj.metaText.tempo : null
  const base = visualObj.getBpm(tempo) || 120
  const factor = tempoFactor > 0 ? tempoFactor : 1
  return base * factor
}

/**
 * Attach a MIDI playback cursor to a directly-rendered abcjs SVG container.
 * `visualObj` must be the object returned by the on-screen renderAbc call so
 * noteTimings match glyph coordinates.
 */
export default function useNotationPlaybackCursor(props) {
  const enabled = props.enabled !== false
  const containerRef = props.containerRef
  const mediaController = props.mediaController
  const displayTuneId = props.displayTuneId
  const tempoFactor = props.tempoFactor > 0 ? props.tempoFactor : 1
  const visualObj = props.visualObj || null

  const timingCallbacksRef = useRef(null)
  const cursorRef = useRef(null)
  const visualObjRef = useRef(null)

  useLayoutEffect(function() {
    if (!enabled || !mediaController) return undefined
    if (!visualObj) {
      timingCallbacksRef.current = null
      cursorRef.current = null
      visualObjRef.current = null
      return undefined
    }

    try {
      if (timingCallbacksRef.current) {
        try { timingCallbacksRef.current.pause() } catch (e) {}
      }
      timingCallbacksRef.current = new abcjs.TimingCallbacks(visualObj, {
        qpm: getVisualObjQpm(visualObj, tempoFactor),
      })
      visualObjRef.current = visualObj
      cursorRef.current = null
    } catch (e) {
      timingCallbacksRef.current = null
      visualObjRef.current = null
    }

    function canSync() {
      return shouldMirrorMidiPlaybackCursor({
        mirrorNotationPlaybackCursor: true,
        playbackEngine: false,
        mediaController: mediaController,
        displayTuneId: displayTuneId,
      })
    }

    function syncCursor() {
      if (!canSync()) return
      const timingCallbacks = timingCallbacksRef.current
      if (!timingCallbacks) return
      const root = containerRef && containerRef.current
      const svg = root ? root.querySelector('svg') : null
      if (!svg) return
      const lastMoment = timingCallbacks.lastMoment
      const duration = resolvePlaybackCursorDuration({
        mediaControllerDuration: mediaController.duration,
      }) || ((lastMoment > 0) ? lastMoment / 1000 : 0)
      if (!(duration > 0) && !(lastMoment > 0)) return
      const currentTimeMs = playbackClockToTimingMs(
        mediaController.currentTime,
        lastMoment,
        duration
      )
      cursorRef.current = applyPlaybackCursorAtTime(
        svg,
        cursorRef.current,
        timingCallbacks.noteTimings,
        currentTimeMs
      )
    }

    syncCursor()
    const intervalId = window.setInterval(syncCursor, CURSOR_SYNC_MS)
    const prevStaffCursor = mediaController.notationStaffCursorRef
      && mediaController.notationStaffCursorRef.current
    if (mediaController.notationStaffCursorRef) {
      mediaController.notationStaffCursorRef.current = syncCursor
    }

    return function() {
      window.clearInterval(intervalId)
      if (timingCallbacksRef.current) {
        try { timingCallbacksRef.current.pause() } catch (e) {}
      }
      if (mediaController.notationStaffCursorRef
          && mediaController.notationStaffCursorRef.current === syncCursor) {
        mediaController.notationStaffCursorRef.current = prevStaffCursor || null
      }
    }
  }, [
    enabled,
    containerRef,
    mediaController,
    displayTuneId,
    visualObj,
    tempoFactor,
    mediaController && mediaController.isPlaying,
    mediaController && mediaController.tune && mediaController.tune.id,
    mediaController && mediaController.playbackRouteMode,
  ])
}
