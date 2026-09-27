export const PINCH_TARGET_FILE = 'file'
export const PINCH_TARGET_LYRICS = 'lyrics'
export const PINCH_TARGET_NOTATION_FIT = 'notation-fit'
export const PINCH_TARGET_NONE = 'none'

/**
 * Which in-app zoom a pinch in the single tune view should drive.
 * The structure block auto-fits, so a structure-only view has no target.
 */
export function resolvePinchZoomTarget(viewFlags, options) {
  const opts = options || {}
  const flags = viewFlags || {}
  if (opts.fileOverlayActive) {
    return opts.pdfSnapshotActive ? PINCH_TARGET_NONE : PINCH_TARGET_FILE
  }
  if (flags.lyrics) return PINCH_TARGET_LYRICS
  if (flags.notation && flags.notation !== 'off') return PINCH_TARGET_NOTATION_FIT
  return PINCH_TARGET_NONE
}
