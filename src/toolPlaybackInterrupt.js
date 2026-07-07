import { useEffect } from 'react'
import { resumeTunePlayback } from './tunePlaybackActions'

/** Tool pages that use audio themselves — pause the tune player while visiting. */
export const PLAYBACK_INTERRUPT_PATH_PREFIXES = ['/metronome', '/tuner', '/piano']

export function isPlaybackInterruptPath(pathname) {
  if (!pathname) return false
  return PLAYBACK_INTERRUPT_PATH_PREFIXES.some(function(prefix) {
    return pathname === prefix || pathname.startsWith(prefix + '/')
  })
}

// Module-level so a pause survives React Strict Mode effect remounts.
let pausedByToolPage = false

/**
 * Pause playback while on metronome/tuner/piano; resume when leaving those pages.
 * Chords and other routes are unaffected.
 */
export function useToolPagePlaybackInterrupt(mediaController, pathname) {
  useEffect(function() {
    if (!mediaController) return

    if (isPlaybackInterruptPath(pathname)) {
      if (mediaController.isPlaying || mediaController.isLoading) {
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
