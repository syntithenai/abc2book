import {
  shouldMirrorMidiPlaybackCursor,
  resolvePlaybackCursorDuration,
  resolvePlaybackCursorRatio,
  shouldDrawPlaybackCursor,
  shouldSuppressPlaybackNoteHighlight,
  ensureAbcjsCursorLine,
  updateAbcjsCursorLine,
  cursorPositionFromNoteTimings,
  barStartTimingsFromNoteTimings,
  playbackClockToTimingMs,
  applyPlaybackCursorAtTime,
} from './notationPlaybackCursor'

function mockMediaController(overrides) {
  return Object.assign({
    isMidiPlaybackRoute: function() { return true },
    tune: { id: 'tune-a' },
    currentTime: 5,
    duration: 20,
  }, overrides || {})
}

describe('notationPlaybackCursor', function() {
  test('shouldMirrorMidiPlaybackCursor requires display-only mirror on midi route', function() {
    const mc = mockMediaController()
    expect(shouldMirrorMidiPlaybackCursor({
      mirrorNotationPlaybackCursor: true,
      playbackEngine: false,
      mediaController: mc,
      displayTuneId: 'tune-a',
    })).toBe(true)
    expect(shouldMirrorMidiPlaybackCursor({
      mirrorNotationPlaybackCursor: false,
      playbackEngine: false,
      mediaController: mc,
      displayTuneId: 'tune-a',
    })).toBe(false)
    expect(shouldMirrorMidiPlaybackCursor({
      mirrorNotationPlaybackCursor: true,
      playbackEngine: true,
      mediaController: mc,
      displayTuneId: 'tune-a',
    })).toBe(false)
  })

  test('shouldMirrorMidiPlaybackCursor works for queue playback without notationMidiOwner', function() {
    const mc = mockMediaController({ notationMidiOwner: false })
    expect(shouldMirrorMidiPlaybackCursor({
      mirrorNotationPlaybackCursor: true,
      playbackEngine: false,
      mediaController: mc,
      displayTuneId: 'tune-a',
    })).toBe(true)
  })

  test('shouldMirrorMidiPlaybackCursor blocks mismatched tune ids', function() {
    const mc = mockMediaController({ tune: { id: 'other' } })
    expect(shouldMirrorMidiPlaybackCursor({
      mirrorNotationPlaybackCursor: true,
      playbackEngine: false,
      mediaController: mc,
      displayTuneId: 'tune-a',
    })).toBe(false)
  })

  test('shouldMirrorMidiPlaybackCursor blocks non-midi routes', function() {
    const mc = mockMediaController({
      isMidiPlaybackRoute: function() { return false },
    })
    expect(shouldMirrorMidiPlaybackCursor({
      mirrorNotationPlaybackCursor: true,
      playbackEngine: false,
      mediaController: mc,
      displayTuneId: 'tune-a',
    })).toBe(false)
  })

  test('resolvePlaybackCursorDuration prefers local buffer then controller', function() {
    expect(resolvePlaybackCursorDuration({
      localBufferDuration: 12,
      mediaControllerDuration: 20,
    })).toBe(12)
    expect(resolvePlaybackCursorDuration({
      localBufferDuration: 0,
      mediaControllerDuration: 20,
    })).toBe(20)
    expect(resolvePlaybackCursorDuration({})).toBe(0)
  })

  test('resolvePlaybackCursorRatio clamps to 0..1', function() {
    expect(resolvePlaybackCursorRatio(5, 20)).toBeCloseTo(0.25)
    expect(resolvePlaybackCursorRatio(25, 20)).toBe(1)
    expect(resolvePlaybackCursorRatio(-1, 20)).toBe(0)
    expect(resolvePlaybackCursorRatio(1, 0)).toBe(0)
  })

  test('shouldDrawPlaybackCursor respects suppressPlaybackVisuals', function() {
    expect(shouldDrawPlaybackCursor({ suppressPlaybackVisuals: false })).toBe(true)
    expect(shouldDrawPlaybackCursor({ suppressPlaybackVisuals: true })).toBe(false)
  })

  test('shouldSuppressPlaybackNoteHighlight covers practice auto-play', function() {
    expect(shouldSuppressPlaybackNoteHighlight({ practiceAutoPlay: true })).toBe(true)
    expect(shouldSuppressPlaybackNoteHighlight({ practiceAutoPlay: false })).toBe(false)
  })

  test('practiceAutoPlay does not suppress cursor drawing', function() {
    expect(shouldDrawPlaybackCursor({ practiceAutoPlay: true })).toBe(true)
  })

  test('ensureAbcjsCursorLine creates svg line', function() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const cursor = ensureAbcjsCursorLine(svg, null)
    expect(cursor).not.toBeNull()
    expect(cursor.getAttribute('class')).toBe('abcjs-cursor')
    expect(svg.querySelector('line.abcjs-cursor')).toBe(cursor)
  })

  test('updateAbcjsCursorLine sets coordinates from position', function() {
    const line = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    updateAbcjsCursorLine(line, { left: 10, top: 20, height: 30 }, false)
    expect(line.getAttribute('x1')).toBe('8')
    expect(line.getAttribute('x2')).toBe('8')
    expect(line.getAttribute('y1')).toBe('20')
    expect(line.getAttribute('y2')).toBe('50')
    updateAbcjsCursorLine(line, { left: 10, top: 20, height: 30 }, true)
    expect(line.getAttribute('x1')).toBe('0')
    expect(line.getAttribute('y2')).toBe('0')
  })

  test('barStartTimingsFromNoteTimings prefers measureStart downbeats', function() {
    const timings = [
      { left: 10, top: 5, height: 40, milliseconds: 0, measureNumber: 0, measureStart: true },
      { left: 30, top: 5, height: 40, milliseconds: 500, measureNumber: 0 },
      { left: 50, top: 5, height: 40, milliseconds: 1000, measureNumber: 1, measureStart: true },
      { left: 70, top: 5, height: 40, milliseconds: 1500, measureNumber: 1 },
    ]
    const bars = barStartTimingsFromNoteTimings(timings)
    expect(bars.length).toBe(2)
    expect(bars[0].milliseconds).toBe(0)
    expect(bars[1].milliseconds).toBe(1000)
  })

  test('cursorPositionFromNoteTimings snaps to the current beat, not every note', function() {
    const timings = [
      { left: 10, top: 5, height: 40, milliseconds: 0, line: 0, measureNumber: 0, measureStart: true, millisecondsPerMeasure: 1000 },
      { left: 20, top: 5, height: 40, milliseconds: 250, line: 0, measureNumber: 0 },
      { left: 30, top: 5, height: 40, milliseconds: 500, line: 0, measureNumber: 0 },
      { left: 40, top: 5, height: 40, milliseconds: 750, line: 0, measureNumber: 0 },
      { left: 50, top: 5, height: 40, milliseconds: 1000, line: 0, measureNumber: 1, measureStart: true, millisecondsPerMeasure: 1000 },
      { left: 60, top: 5, height: 40, milliseconds: 1500, line: 0, measureNumber: 1 },
      { left: null, milliseconds: 2000, measureNumber: 2 },
    ]
    // Mid first beat: stay on downbeat (not the 250ms note).
    expect(cursorPositionFromNoteTimings(timings, 300, { beatsPerMeasure: 2 }).left).toBe(10)
    // Second beat of bar 0: move to beat anchor at 500ms.
    expect(cursorPositionFromNoteTimings(timings, 750, { beatsPerMeasure: 2 }).left).toBe(30)
    // Second bar downbeat.
    expect(cursorPositionFromNoteTimings(timings, 1200, { beatsPerMeasure: 2 }).left).toBe(50)
    // Without beatsPerMeasure, fall back to bar downbeats only.
    expect(cursorPositionFromNoteTimings(timings, 750).left).toBe(10)
  })

  test('playbackClockToTimingMs uses the music clock instead of stretching extra duration', function() {
    expect(playbackClockToTimingMs(1.2, 8000, 10000)).toBeCloseTo(1200)
    expect(playbackClockToTimingMs(9, 8000, 10000)).toBe(7999)
  })

  test('playbackClockToTimingMs scales when noteTimings are longer than audio', function() {
    // 2/4 QPM skew: timings twice the audio buffer — keep cursor on the notes.
    expect(playbackClockToTimingMs(4, 16000, 8)).toBeCloseTo(8000)
    expect(playbackClockToTimingMs(8, 16000, 8)).toBe(15999)
  })

  test('applyPlaybackCursorAtTime draws line on current beat anchor', function() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const cursor = applyPlaybackCursorAtTime(svg, null, [
      { left: 12, top: 8, height: 24, milliseconds: 0, measureNumber: 0, measureStart: true, millisecondsPerMeasure: 1000 },
      { left: 20, top: 8, height: 24, milliseconds: 500, measureNumber: 0 },
      { left: 40, top: 8, height: 24, milliseconds: 1000, measureNumber: 1, measureStart: true, millisecondsPerMeasure: 1000 },
    ], 750, { beatsPerMeasure: 2 })
    expect(cursor).not.toBeNull()
    expect(cursor.getAttribute('x1')).toBe('18')
    expect(cursor.getAttribute('y1')).toBe('8')
    expect(cursor.getAttribute('y2')).toBe('32')
  })
})
