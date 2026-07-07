/**
 * Progress through the active tune (0–1) for practice tempo ramps.
 * Uses playback position so the ramp tracks the recording, not wall clock time.
 */
export function getPracticePlaybackRampRatio(mediaController) {
  if (!mediaController || typeof mediaController.getPlaybackProgress !== 'function') {
    return null
  }
  const progress = mediaController.getPlaybackProgress()
  const startAt = typeof mediaController.getLinkStartAt === 'function'
    ? mediaController.getLinkStartAt()
    : 0
  const endAt = typeof mediaController.getLinkEndAt === 'function'
    ? mediaController.getLinkEndAt()
    : 0
  let span = 0
  if (endAt > startAt) {
    span = endAt - startAt
  } else if (progress.duration > startAt) {
    span = progress.duration - startAt
  }
  if (!span || span <= 0) return null
  const elapsed = Math.max(0, progress.currentTime - startAt)
  return Math.min(1, elapsed / span)
}

export function interpolatePracticeTempo(startTempo, endTempo, ratio) {
  const start = startTempo != null ? startTempo : 0.5
  const end = endTempo != null ? endTempo : 1
  const r = Math.max(0, Math.min(1, ratio))
  return start + (end - start) * r
}
