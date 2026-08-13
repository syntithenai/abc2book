import { useEffect, useRef } from 'react'
import { resumeTunePlayback } from './tunePlaybackActions'

/** Tool pages that use audio themselves — pause the tune player while visiting. */
export const PLAYBACK_INTERRUPT_PATH_PREFIXES = [
  '/metronome',
  '/tuner',
  '/audioanalysis',
  '/piano',
  '/scratchpad',
  '/settings',
]

export function isPlaybackInterruptPath(pathname) {
  if (!pathname) return false
  return PLAYBACK_INTERRUPT_PATH_PREFIXES.some(function(prefix) {
    return pathname === prefix || pathname.startsWith(prefix + '/')
  })
}

/** Pause queue/tune playback when navigating onto a tool page that owns audio. */
export function shouldPausePlaybackOnToolPageEnter(opts) {
  const o = opts || {}
  if (!isPlaybackInterruptPath(o.pathname)) return false
  if (o.notationMidiOwner) return false
  if (!o.enteredInterrupt) return false
  return !!(o.isPlaying || o.isLoading)
}

// Module-level so a pause survives React Strict Mode effect remounts.
let pausedByToolPage = false

/**
 * Pause playback while on metronome/tuner/piano/scratchpad; resume when leaving.
 * Only pauses on navigation into an interrupt path — not when isLoading toggles
 * while already there (notation editor play sets isLoading on scratchpad).
 */
export function useToolPagePlaybackInterrupt(mediaController, pathname) {
  const prevPathRef = useRef(pathname)
  useEffect(function() {
    if (!mediaController) return

    const prevPath = prevPathRef.current
    const enteredInterrupt = isPlaybackInterruptPath(pathname)
      && !isPlaybackInterruptPath(prevPath)
    prevPathRef.current = pathname

    if (isPlaybackInterruptPath(pathname)) {
      if (shouldPausePlaybackOnToolPageEnter({
        pathname: pathname,
        enteredInterrupt: enteredInterrupt,
        notationMidiOwner: mediaController.notationMidiOwner,
        isPlaying: mediaController.isPlaying,
        isLoading: mediaController.isLoading,
      })) {
        mediaController.pause()
        pausedByToolPage = true
      }
      return
    }

    if (!pausedByToolPage) return
    pausedByToolPage = false
    resumeTunePlayback(mediaController, null)
  }, [mediaController, pathname])
}
