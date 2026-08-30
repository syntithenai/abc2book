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
  scrollPlaybackCursorIntoTopHalf,
  resolvePlaybackScrollLeadMs,
  cursorLineHasActivePosition,
  getCursorLineViewportY,
  findNoteTimingAtTime,
} from './notationPlaybackCursor'
import { setActiveLyricsAutoscrollSession } from './lyricsAutoscrollUtils'

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

  test('cursorPositionFromNoteTimings uses sounding→written map for later volta passes', function() {
    // Written score has 4 bars (pickup + A + ending1 + ending2); sounding has more.
    const timings = [
      { left: 10, top: 5, height: 40, milliseconds: 0, line: 0, measureNumber: 0, measureStart: true },
      { left: 20, top: 5, height: 40, milliseconds: 500, line: 0, measureNumber: 1, measureStart: true },
      { left: 30, top: 5, height: 40, milliseconds: 1500, line: 0, measureNumber: 2, measureStart: true },
      { left: 40, top: 5, height: 40, milliseconds: 2500, line: 0, measureNumber: 3, measureStart: true },
      { left: 50, top: 5, height: 40, milliseconds: 3500, line: 0, measureNumber: 4, measureStart: true },
    ]
    const soundingWrittenMap = {
      writtenWhole: 4.5,
      soundingWhole: 13.5,
      pickupWhole: 0.5,
      segments: [
        { soundingStartWhole: 0, soundingEndWhole: 0.5, writtenStartWhole: 0, writtenEndWhole: 0.5, passIndex: 1 },
        { soundingStartWhole: 0.5, soundingEndWhole: 4.5, writtenStartWhole: 0.5, writtenEndWhole: 4.5, passIndex: 1 },
        { soundingStartWhole: 4.5, soundingEndWhole: 7.5, writtenStartWhole: 0.5, writtenEndWhole: 3.5, passIndex: 2 },
        { soundingStartWhole: 7.5, soundingEndWhole: 10.5, writtenStartWhole: 3.5, writtenEndWhole: 4.5, passIndex: 2 },
        { soundingStartWhole: 10.5, soundingEndWhole: 13.5, writtenStartWhole: 0.5, writtenEndWhole: 3.5, passIndex: 3 },
      ],
    }
    // Pass 3 body (~11.0 whole notes): lock clock to audioDuration/soundingWhole.
    const pos = cursorPositionFromNoteTimings(timings, 11000, {
      musicSec: 11.0,
      audibleMsPerMeasure: 1000,
      audioDurationSec: 13.5,
      lastMomentMs: 4500,
      soundingWrittenMap: soundingWrittenMap,
      barWholeNotes: 1,
      pickupWhole: 0.5,
    })
    // Pass 3 maps back onto A body (written ~0.5–3.5), not the last written bar.
    expect(pos.left).toBe(20)
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

  test('cursorLineHasActivePosition detects a visible cursor line', function() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const cursor = ensureAbcjsCursorLine(svg, null)
    expect(cursorLineHasActivePosition(cursor)).toBe(false)
    updateAbcjsCursorLine(cursor, { left: 10, top: 20, height: 40 }, false)
    expect(cursorLineHasActivePosition(cursor)).toBe(true)
  })

  test('scrollPlaybackCursorIntoTopHalf skips when lyrics autoscroll is active', function() {
    const scrollBy = jest.spyOn(window, 'scrollBy').mockImplementation(function() {})
    setActiveLyricsAutoscrollSession({ nudgeByPixels: function() {} })
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    cursor.getBoundingClientRect = function() {
      return { top: 700, bottom: 740, height: 40, left: 0, right: 0, width: 0, x: 0, y: 700 }
    }
    expect(scrollPlaybackCursorIntoTopHalf(cursor, { isPlaying: true })).toBe(false)
    expect(scrollBy).not.toHaveBeenCalled()
    setActiveLyricsAutoscrollSession(null)
    scrollBy.mockRestore()
  })

  test('getCursorLineViewportY prefers CTM when bounding box is bogus', function() {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.getScreenCTM = function() {
      return { a: 1, b: 0, c: 0, d: 1, e: 0, f: 320 }
    }
    svg.createSVGPoint = function() {
      return { x: 0, y: 0, matrixTransform: function(m) {
        return { x: this.x * m.a + m.e, y: this.y * m.d + m.f }
      } }
    }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('x1', '10')
    cursor.setAttribute('y1', '80')
    cursor.setAttribute('y2', '120')
    svg.appendChild(cursor)
    cursor.getBoundingClientRect = function() {
      return { top: 0, bottom: 0, height: 0, left: 0, right: 3, width: 3, x: 0, y: 0 }
    }
    expect(getCursorLineViewportY(cursor)).toBe(420)
  })

  test('scrollPlaybackCursorIntoTopHalf scrolls the notation viewer container', function() {
    const viewer = document.createElement('div')
    viewer.id = 'abc_music_viewer'
    viewer.style.height = '200px'
    viewer.style.overflowY = 'auto'
    Object.defineProperty(viewer, 'scrollHeight', { configurable: true, value: 800 })
    Object.defineProperty(viewer, 'clientHeight', { configurable: true, value: 200 })

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const staff = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    staff.setAttribute('class', 'abcjs-staff abcjs-l1')
    staff.getBBox = function() { return { x: 0, y: 0, width: 400, height: 100 } }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    staff.getBoundingClientRect = function() {
      return { top: 560, bottom: 640, height: 80, left: 0, right: 400, width: 400, x: 0, y: 560 }
    }
    staff.appendChild(cursor)
    svg.appendChild(staff)
    viewer.appendChild(svg)
    document.body.appendChild(viewer)
    Object.defineProperty(viewer, 'getBoundingClientRect', {
      configurable: true,
      value: function() {
        return { top: 100, bottom: 300, left: 0, right: 400, width: 400, height: 200, x: 0, y: 100 }
      },
    })

    viewer.scrollTop = 0
    expect(scrollPlaybackCursorIntoTopHalf(cursor, { isPlaying: true })).toBe(true)

    document.body.removeChild(viewer)
  })

  test('findNoteTimingAtTime returns latest note event at or before time', function() {
    const noteTimings = [
      { milliseconds: 0, left: 10, top: 20, line: 0 },
      { milliseconds: 500, left: 10, top: 120, line: 1 },
      { milliseconds: 1000, left: 10, top: 220, line: 2 },
    ]
    expect(findNoteTimingAtTime(noteTimings, 750)).toEqual(noteTimings[1])
    expect(findNoteTimingAtTime(noteTimings, 1000)).toEqual(noteTimings[2])
  })

  test('scrollPlaybackCursorIntoTopHalf uses note element from noteTimings', function() {
    const scrollingEl = document.documentElement
    const previousScrollTop = scrollingEl.scrollTop
    Object.defineProperty(scrollingEl, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const note = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    note.setAttribute('class', 'abcjs-note')
    note.getBoundingClientRect = function() {
      return { top: 640, bottom: 680, height: 40, left: 0, right: 40, width: 40, x: 0, y: 640 }
    }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    cursor.getBoundingClientRect = function() {
      return { top: 0, bottom: 0, height: 0, left: 0, right: 3, width: 3, x: 0, y: 0 }
    }
    svg.appendChild(note)
    svg.appendChild(cursor)
    document.body.appendChild(svg)

    const noteTimings = [{
      milliseconds: 0,
      left: 10,
      top: 200,
      height: 40,
      line: 2,
      elements: [[note]],
    }]

    scrollingEl.scrollTop = 0
    expect(scrollPlaybackCursorIntoTopHalf(cursor, {
      isPlaying: true,
      noteTimings: noteTimings,
      currentTimeMs: 0,
    })).toBe(true)

    scrollingEl.scrollTop = previousScrollTop
    document.body.removeChild(svg)
  })

  test('scrollPlaybackCursorIntoTopHalf scrolls the page when fit height is off', function() {
    const scrollingEl = document.documentElement
    const previousScrollTop = scrollingEl.scrollTop
    Object.defineProperty(scrollingEl, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const staff = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    staff.setAttribute('class', 'abcjs-staff abcjs-l2')
    staff.getBBox = function() { return { x: 0, y: 0, width: 400, height: 100 } }
    staff.getBoundingClientRect = function() {
      return { top: 620, bottom: 700, height: 80, left: 0, right: 400, width: 400, x: 0, y: 620 }
    }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    staff.appendChild(cursor)
    svg.appendChild(staff)
    document.body.appendChild(svg)

    scrollingEl.scrollTop = 0
    expect(scrollPlaybackCursorIntoTopHalf(cursor, { isPlaying: true })).toBe(true)

    scrollingEl.scrollTop = previousScrollTop
    document.body.removeChild(svg)
  })

  test('scrollPlaybackCursorIntoTopHalf ignores hidden now-playing-host at page top', function() {
    const scrollingEl = document.documentElement
    const previousScrollTop = scrollingEl.scrollTop
    Object.defineProperty(scrollingEl, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    const host = document.createElement('div')
    host.className = 'now-playing-host'
    host.getBoundingClientRect = function() {
      return { top: 0, bottom: 150, height: 150, left: 0, right: 200, width: 200, x: 0, y: 0 }
    }
    document.body.appendChild(host)

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const staff = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    staff.setAttribute('class', 'abcjs-staff abcjs-l2')
    staff.getBBox = function() { return { x: 0, y: 0, width: 400, height: 100 } }
    staff.getBoundingClientRect = function() {
      return { top: 620, bottom: 700, height: 80, left: 0, right: 400, width: 400, x: 0, y: 620 }
    }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    staff.appendChild(cursor)
    svg.appendChild(staff)
    document.body.appendChild(svg)

    scrollingEl.scrollTop = 0
    expect(scrollPlaybackCursorIntoTopHalf(cursor, { isPlaying: true })).toBe(true)

    scrollingEl.scrollTop = previousScrollTop
    document.body.removeChild(svg)
    document.body.removeChild(host)
  })

  test('scrollPlaybackCursorIntoTopHalf uses music-buttons from the owning music-single', function() {
    const scrollingEl = document.documentElement
    const previousScrollTop = scrollingEl.scrollTop
    Object.defineProperty(scrollingEl, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    const stack = document.createElement('div')
    stack.className = 'music-single-page-stack'

    const firstSection = document.createElement('div')
    firstSection.className = 'music-single music-single--page-stack-item'
    const firstButtons = document.createElement('div')
    firstButtons.className = 'music-buttons'
    // Off-screen sibling toolbar must not collapse the viewport band.
    firstButtons.getBoundingClientRect = function() {
      return { top: -400, bottom: 900, height: 1300, left: 0, right: 400, width: 400, x: 0, y: -400 }
    }
    firstSection.appendChild(firstButtons)

    const secondSection = document.createElement('div')
    secondSection.className = 'music-single music-single--page-stack-item music-single-page-tune--active'
    const secondButtons = document.createElement('div')
    secondButtons.className = 'music-buttons'
    secondButtons.getBoundingClientRect = function() {
      return { top: 60, bottom: 110, height: 50, left: 0, right: 400, width: 400, x: 0, y: 60 }
    }
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const staff = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    staff.setAttribute('class', 'abcjs-staff abcjs-l2')
    staff.getBBox = function() { return { x: 0, y: 0, width: 400, height: 100 } }
    staff.getBoundingClientRect = function() {
      return { top: 620, bottom: 700, height: 80, left: 0, right: 400, width: 400, x: 0, y: 620 }
    }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    staff.appendChild(cursor)
    svg.appendChild(staff)
    secondSection.appendChild(secondButtons)
    secondSection.appendChild(svg)

    stack.appendChild(firstSection)
    stack.appendChild(secondSection)
    document.body.appendChild(stack)

    scrollingEl.scrollTop = 0
    expect(scrollPlaybackCursorIntoTopHalf(cursor, { isPlaying: true })).toBe(true)

    scrollingEl.scrollTop = previousScrollTop
    document.body.removeChild(stack)
  })

  test('scrollPlaybackCursorIntoTopHalf does not scroll when cursor stays in top half', function() {
    const scrollBy = jest.spyOn(window, 'scrollBy').mockImplementation(function() {})
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    cursor.getBoundingClientRect = function() {
      return { top: 120, bottom: 160, height: 40, left: 0, right: 0, width: 0, x: 0, y: 120 }
    }
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    expect(scrollPlaybackCursorIntoTopHalf(cursor, { isPlaying: true })).toBe(false)
    expect(scrollBy).not.toHaveBeenCalled()
    scrollBy.mockRestore()
  })

  test('scrollPlaybackCursorIntoTopHalf scrolls up when cursor jumps above the viewport', function() {
    const scrollingEl = document.documentElement
    const previousScrollTop = scrollingEl.scrollTop
    Object.defineProperty(scrollingEl, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    scrollingEl.scrollTop = 900

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const staff = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    staff.setAttribute('class', 'abcjs-staff abcjs-l0')
    staff.getBBox = function() { return { x: 0, y: 0, width: 400, height: 100 } }
    // After a repeat, the first staff sits above the scrolled viewport.
    staff.getBoundingClientRect = function() {
      return { top: -120, bottom: -40, height: 80, left: 0, right: 400, width: 400, x: 0, y: -120 }
    }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    staff.appendChild(cursor)
    svg.appendChild(staff)
    document.body.appendChild(svg)

    const scrollBy = jest.spyOn(window, 'scrollBy').mockImplementation(function(opts) {
      const top = opts && opts.top != null ? opts.top : 0
      scrollingEl.scrollTop += top
    })

    expect(scrollPlaybackCursorIntoTopHalf(cursor, { isPlaying: true })).toBe(true)
    expect(scrollBy).toHaveBeenCalled()
    const delta = scrollBy.mock.calls[0][0].top
    expect(delta).toBeLessThan(0)

    scrollBy.mockRestore()
    scrollingEl.scrollTop = previousScrollTop
    document.body.removeChild(svg)
  })

  test('resolvePlaybackScrollLeadMs uses one beat of the audible measure', function() {
    expect(resolvePlaybackScrollLeadMs({ audibleMsPerMeasure: 1000 })).toBe(250)
    expect(resolvePlaybackScrollLeadMs({})).toBe(400)
  })

  test('scrollPlaybackCursorIntoTopHalf looks ahead one beat to the next staff line', function() {
    const scrollingEl = document.documentElement
    const previousScrollTop = scrollingEl.scrollTop
    Object.defineProperty(scrollingEl, 'scrollHeight', { configurable: true, value: 3000 })
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })
    scrollingEl.scrollTop = 0

    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const note0 = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    note0.setAttribute('class', 'abcjs-note')
    note0.getBoundingClientRect = function() {
      return { top: 140, bottom: 180, height: 40, left: 0, right: 40, width: 40, x: 0, y: 140 }
    }
    const note1 = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    note1.setAttribute('class', 'abcjs-note')
    note1.getBoundingClientRect = function() {
      return { top: 620, bottom: 660, height: 40, left: 0, right: 40, width: 40, x: 0, y: 620 }
    }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    cursor.getBoundingClientRect = function() {
      return { top: 140, bottom: 180, height: 40, left: 0, right: 0, width: 0, x: 0, y: 140 }
    }
    svg.appendChild(note0)
    svg.appendChild(note1)
    svg.appendChild(cursor)
    document.body.appendChild(svg)

    const noteTimings = [
      {
        milliseconds: 0,
        left: 10,
        top: 40,
        line: 0,
        elements: [[note0]],
      },
      {
        milliseconds: 300,
        left: 10,
        top: 200,
        line: 1,
        elements: [[note1]],
      },
    ]

    // Current time still on line 0; one-beat look-ahead (250ms) reaches line 1.
    expect(scrollPlaybackCursorIntoTopHalf(cursor, {
      isPlaying: true,
      noteTimings: noteTimings,
      currentTimeMs: 100,
      audibleMsPerMeasure: 1000,
    })).toBe(true)

    scrollingEl.scrollTop = previousScrollTop
    document.body.removeChild(svg)
  })

  test('scrollPlaybackCursorIntoTopHalf does not scroll early when look-ahead stays on the same in-band line', function() {
    const scrollBy = jest.spyOn(window, 'scrollBy').mockImplementation(function() {})
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    const note0 = document.createElementNS('http://www.w3.org/2000/svg', 'g')
    note0.setAttribute('class', 'abcjs-note')
    note0.getBoundingClientRect = function() {
      return { top: 140, bottom: 180, height: 40, left: 0, right: 40, width: 40, x: 0, y: 140 }
    }
    const cursor = document.createElementNS('http://www.w3.org/2000/svg', 'line')
    cursor.setAttribute('y1', '10')
    cursor.setAttribute('y2', '50')
    cursor.getBoundingClientRect = function() {
      return { top: 140, bottom: 180, height: 40, left: 0, right: 0, width: 0, x: 0, y: 140 }
    }
    svg.appendChild(note0)
    svg.appendChild(cursor)
    document.body.appendChild(svg)
    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 })

    const noteTimings = [
      {
        milliseconds: 0,
        left: 10,
        top: 40,
        line: 0,
        elements: [[note0]],
      },
      {
        milliseconds: 2000,
        left: 10,
        top: 200,
        line: 1,
        elements: [[note0]],
      },
    ]

    expect(scrollPlaybackCursorIntoTopHalf(cursor, {
      isPlaying: true,
      noteTimings: noteTimings,
      currentTimeMs: 100,
      audibleMsPerMeasure: 1000,
    })).toBe(false)
    expect(scrollBy).not.toHaveBeenCalled()

    scrollBy.mockRestore()
    document.body.removeChild(svg)
  })
})
