import {
  roundMarkerTime,
  formatMarkerTime,
  clampMarkerTime,
  clampMarkerTimeContinuous,
  markerTimeFromClientX,
  getLoopRegion,
} from './scratchpadAudioMarkers'

describe('scratchpadAudioMarkers', function() {
  test('roundMarkerTime snaps to 0.1s', function() {
    expect(roundMarkerTime(1.6875)).toBe(1.7)
    expect(roundMarkerTime(1.64)).toBe(1.6)
    expect(formatMarkerTime(1.6875)).toBe('1.7')
  })

  test('clampMarkerTime respects duration', function() {
    expect(clampMarkerTime(12, 10)).toBe(10)
    expect(clampMarkerTime(-1, 10)).toBe(0)
  })

  test('clampMarkerTimeContinuous clamps without rounding', function() {
    expect(clampMarkerTimeContinuous(1.6875, 10)).toBe(1.6875)
    expect(clampMarkerTimeContinuous(12, 10)).toBe(10)
    expect(clampMarkerTimeContinuous(-1, 10)).toBe(0)
  })

  test('markerTimeFromClientX clamps to waveform bounds', function() {
    const layout = {
      duration: 10,
      tracksLeft: 100,
      tracksScrollLeft: 0,
      waveformWidth: 500,
      controlWidth: 50,
    }
    expect(markerTimeFromClientX(100, layout, { continuous: true })).toBe(0)
    expect(markerTimeFromClientX(650, layout, { continuous: true })).toBe(10)
    expect(markerTimeFromClientX(350, layout, { continuous: true })).toBe(4)
  })

  test('markerTimeFromClientX continuous preserves sub-step values', function() {
    const layout = {
      duration: 10,
      tracksLeft: 0,
      tracksScrollLeft: 0,
      waveformWidth: 1000,
      controlWidth: 0,
    }
    const time = markerTimeFromClientX(123, layout, { continuous: true })
    expect(time).toBe(1.23)
    expect(time).not.toBe(roundMarkerTime(time))
  })

  test('getLoopRegion uses marker loop roles', function() {
    const region = getLoopRegion([
      { time: 5, loopRole: 'end' },
      { time: 1, loopRole: 'start' },
    ])
    expect(region).toEqual({ start: 1, end: 5 })
  })
})
