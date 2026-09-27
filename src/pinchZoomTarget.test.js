import {
  PINCH_TARGET_FILE,
  PINCH_TARGET_LYRICS,
  PINCH_TARGET_NONE,
  PINCH_TARGET_NOTATION_FIT,
  resolvePinchZoomTarget,
} from './pinchZoomTarget'

describe('resolvePinchZoomTarget', function() {
  it('zooms an attached file when the file overlay is showing', function() {
    expect(resolvePinchZoomTarget({ lyrics: true }, { fileOverlayActive: true })).toBe(PINCH_TARGET_FILE)
  })

  it('leaves PDF snapshots to their own toolbar', function() {
    expect(resolvePinchZoomTarget({}, { fileOverlayActive: true, pdfSnapshotActive: true })).toBe(PINCH_TARGET_NONE)
  })

  it('zooms lyrics whenever lyrics are visible', function() {
    expect(resolvePinchZoomTarget({ lyrics: true })).toBe(PINCH_TARGET_LYRICS)
    expect(resolvePinchZoomTarget({ lyrics: true, structure: true })).toBe(PINCH_TARGET_LYRICS)
    expect(resolvePinchZoomTarget({ lyrics: true, notation: 'lines' })).toBe(PINCH_TARGET_LYRICS)
  })

  it('switches notation fit mode when only notation is visible', function() {
    expect(resolvePinchZoomTarget({ notation: 'lines' })).toBe(PINCH_TARGET_NOTATION_FIT)
    expect(resolvePinchZoomTarget({ notation: 'lines', structure: true })).toBe(PINCH_TARGET_NOTATION_FIT)
  })

  it('does nothing for structure-only or empty views', function() {
    expect(resolvePinchZoomTarget({ structure: true, notation: 'off' })).toBe(PINCH_TARGET_NONE)
    expect(resolvePinchZoomTarget({})).toBe(PINCH_TARGET_NONE)
  })
})
