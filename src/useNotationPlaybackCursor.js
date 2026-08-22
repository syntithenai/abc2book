import { useLayoutEffect, useRef } from 'react'
import abcjs from 'abcjs'
import {
  applyPlaybackCursorAtTime,
  resolvePlaybackCursorDuration,
  playbackClockToTimingMs,
  shouldMirrorMidiPlaybackCursor,
} from './notationPlaybackCursor'

const CURSOR_SYNC_MS = 50

/**
 * QPM for display-only TimingCallbacks. Use score tempo only — mediaController
 * currentTime/duration are music-seconds on the unwarped buffer, so applying
 * playback-speed here pulls the red cursor off the notes (especially in 4/4).
 */
function getVisualObjQpm(visualObj) {
  if (!visualObj) return 120
  const tempo = visualObj.metaText ? visualObj.metaText.tempo : null
  if (typeof visualObj.getBpm === 'function') {
    const bpm = parseFloat(visualObj.getBpm(tempo))
    if (bpm > 0) return bpm
  }
  return 120
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
        qpm: getVisualObjQpm(visualObj),
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
      const stateSec = mediaController.currentTime
      const liveSec = (mediaController.getMidiPlaybackSecondsRef
        && typeof mediaController.getMidiPlaybackSecondsRef.current === 'function')
        ? mediaController.getMidiPlaybackSecondsRef.current()
        : stateSec
      const playbackSec = (liveSec >= 0 && isFinite(liveSec)) ? liveSec : stateSec
      const currentTimeMs = playbackClockToTimingMs(
        playbackSec,
        lastMoment,
        duration
      )
      const beatsPerMeasure = (visualObj && typeof visualObj.getBeatsPerMeasure === 'function')
        ? parseFloat(visualObj.getBeatsPerMeasure())
        : 0
      cursorRef.current = applyPlaybackCursorAtTime(
        svg,
        cursorRef.current,
        timingCallbacks.noteTimings,
        currentTimeMs,
        { beatsPerMeasure: beatsPerMeasure }
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
    mediaController && mediaController.isPlaying,
    mediaController && mediaController.tune && mediaController.tune.id,
    mediaController && mediaController.playbackRouteMode,
  ])
}
