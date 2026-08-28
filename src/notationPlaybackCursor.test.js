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
  typicalTimingBarMs,
  playbackClockToTimingMs,
  musicClockToTimingMs,
  musicStartMsFromNoteTimings,
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

  test('cursorPositionFromNoteTimings snaps to the bar downbeat only', function() {
    const timings = [
      { left: 10, top: 5, height: 40, milliseconds: 0, line: 0, measureNumber: 0, measureStart: true, millisecondsPerMeasure: 1000 },
      { left: 20, top: 5, height: 40, milliseconds: 250, line: 0, measureNumber: 0 },
      { left: 30, top: 5, height: 40, milliseconds: 500, line: 0, measureNumber: 0 },
      { left: 40, top: 5, height: 40, milliseconds: 750, line: 0, measureNumber: 0 },
      { left: 50, top: 5, height: 40, milliseconds: 1000, line: 0, measureNumber: 1, measureStart: true, millisecondsPerMeasure: 1000 },
      { left: 60, top: 5, height: 40, milliseconds: 1500, line: 0, measureNumber: 1 },
      { left: null, milliseconds: 2000, measureNumber: 2 },
    ]
    // Mid first bar: stay on bar-0 downbeat.
    expect(cursorPositionFromNoteTimings(timings, 300).left).toBe(10)
    expect(cursorPositionFromNoteTimings(timings, 750).left).toBe(10)
    // Second bar downbeat.
    expect(cursorPositionFromNoteTimings(timings, 1200).left).toBe(50)
  })

  test('cursorPositionFromNoteTimings uses audible bar index for 2/4 half-measure skew', function() {
    // noteTimings advance measureNumber every 500ms; audio bar is 1000ms; same tempo.
    const timings = [
      { left: 10, top: 5, height: 40, milliseconds: 0, line: 0, measureNumber: 0, measureStart: true },
      { left: 20, top: 5, height: 40, milliseconds: 500, line: 0, measureNumber: 1, measureStart: true },
      { left: 30, top: 5, height: 40, milliseconds: 1000, line: 0, measureNumber: 2, measureStart: true },
      { left: 40, top: 5, height: 40, milliseconds: 1500, line: 0, measureNumber: 3, measureStart: true },
    ]
    expect(cursorPositionFromNoteTimings(timings, 600).left).toBe(20)
    expect(cursorPositionFromNoteTimings(timings, 600, {
      musicSec: 0.6,
      audibleMsPerMeasure: 1000,
      audioDurationSec: 2,
      lastMomentMs: 2000,
    }).left).toBe(10)
    expect(cursorPositionFromNoteTimings(timings, 1000, {
      musicSec: 1,
      audibleMsPerMeasure: 1000,
      audioDurationSec: 2,
      lastMomentMs: 2000,
    }).left).toBe(30)
    expect(typicalTimingBarMs(barStartTimingsFromNoteTimings(timings))).toBe(500)
  })

  test('cursorPositionFromNoteTimings does not skip bars when display QPM is faster than audio', function() {
    // Display noteTimings at ~180bpm (667ms bars); audio at 120bpm (1000ms bars).
    // Timeline span differs — must not treat this as 2/4 half-measure skew.
    const timings = [
      { left: 10, top: 5, height: 40, milliseconds: 0, line: 0, measureNumber: 0, measureStart: true },
      { left: 20, top: 5, height: 40, milliseconds: 667, line: 0, measureNumber: 1, measureStart: true },
      { left: 30, top: 5, height: 40, milliseconds: 1333, line: 0, measureNumber: 2, measureStart: true },
      { left: 40, top: 5, height: 40, milliseconds: 2000, line: 0, measureNumber: 3, measureStart: true },
    ]
    // Mid first audio bar (1000ms): stay on first written bar, not jump to bar 2.
    expect(cursorPositionFromNoteTimings(timings, 700, {
      musicSec: 0.7,
      audibleMsPerMeasure: 1000,
      audioDurationSec: 4,
      lastMomentMs: 2668,
    }).left).toBe(10)
    expect(cursorPositionFromNoteTimings(timings, 1000, {
      musicSec: 1.0,
      audibleMsPerMeasure: 1000,
      audioDurationSec: 4,
      lastMomentMs: 2668,
    }).left).toBe(20)
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

  test('musicStartMsFromNoteTimings detects count-in prefix only', function() {
    expect(musicStartMsFromNoteTimings([
      { milliseconds: 0, measureStart: true },
      { milliseconds: 1000, measureStart: true },
      { left: 10, top: 1, height: 20, milliseconds: 2000, measureNumber: 0 },
    ])).toBe(2000)
    expect(musicStartMsFromNoteTimings([
      { left: 10, top: 1, height: 20, milliseconds: 0, measureNumber: 0 },
      { left: 20, top: 1, height: 20, milliseconds: 2000, measureNumber: 1 },
    ])).toBe(0)
  })

  test('musicClockToTimingMs with phantom start on no-prefix timings would be one bar ahead', function() {
    // Regression: never add an estimated count-in onto noteTimings that start at 0.
    const wrong = musicClockToTimingMs(0, 2000, 8000, 8)
    expect(wrong).toBe(2000) // would show bar 2
    const rightStart = musicStartMsFromNoteTimings([
      { left: 10, top: 1, height: 20, milliseconds: 0 },
    ])
    expect(musicClockToTimingMs(0, rightStart, 8000, 8)).toBe(0)
  })

  test('musicClockToTimingMs adds noteTimings count-in then follows the music clock 1:1', function() {
    expect(musicClockToTimingMs(0, 2000, 10000, 8)).toBe(2000)
    expect(musicClockToTimingMs(2, 2000, 10000, 8)).toBe(4000)
    expect(musicClockToTimingMs(8, 2000, 10000, 8)).toBe(9999)
  })

  test('musicClockToTimingMs scales when TimingCallbacks are tempo-warped', function() {
    expect(musicClockToTimingMs(6, 0, 8000, 12, { tempoFactor: 1.5 })).toBeCloseTo(4000)
    expect(musicClockToTimingMs(12, 0, 8000, 12, { tempoFactor: 1.5 })).toBe(7999)
  })

  test('musicClockToTimingMs does not stretch a fade/tail at unity tempo', function() {
    expect(musicClockToTimingMs(1.2, 0, 8000, 10)).toBeCloseTo(1200)
    expect(musicClockToTimingMs(9, 0, 8000, 10)).toBe(7999)
  })

  test('applyPlaybackCursorAtTime draws line on current bar downbeat', function() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const cursor = applyPlaybackCursorAtTime(svg, null, [
      { left: 12, top: 8, height: 24, milliseconds: 0, measureNumber: 0, measureStart: true, millisecondsPerMeasure: 1000 },
      { left: 20, top: 8, height: 24, milliseconds: 500, measureNumber: 0 },
      { left: 40, top: 8, height: 24, milliseconds: 1000, measureNumber: 1, measureStart: true, millisecondsPerMeasure: 1000 },
    ], 750)
    expect(cursor).not.toBeNull()
    expect(cursor.getAttribute('x1')).toBe('10')
    expect(cursor.getAttribute('y1')).toBe('8')
    expect(cursor.getAttribute('y2')).toBe('32')
  })
})
