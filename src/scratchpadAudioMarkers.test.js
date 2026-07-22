import {
  roundMarkerTime,
  formatMarkerTime,
  clampMarkerTime,
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

  test('getLoopRegion uses marker loop roles', function() {
    const region = getLoopRegion([
      { time: 5, loopRole: 'end' },
      { time: 1, loopRole: 'start' },
    ])
    expect(region).toEqual({ start: 1, end: 5 })
  })
})
