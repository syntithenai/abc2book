import { buildPlayalongCompareLines, filterPlayalongDisplayPoints, foldMidiHarmonicNearExpected, playalongLinesFromTune, playalongLinesFromDisplayAbc, playalongSoundingMapFromTune, slicePeaksForLine, slicePitchPassesForLine, slicePitchPointsForLine, snapPitchPointToNotes, takeWaveformOpacity, transposePlayalongLines } from './playalongLineNotes'
import { refinePlayalongMusicStartOffsetSeconds } from './playalongTakes'

describe('playalongLineNotes', function() {
  test('splits primary voice notes on printed line breaks', function() {
    const lines = playalongLinesFromTune({
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: {
        '1': { meta: '', notes: ['CDEF |', 'GABc |'] },
      },
    })
    expect(lines.length).toBe(2)
    expect(lines[0].notes.length).toBeGreaterThan(0)
    expect(lines[1].notes.length).toBeGreaterThan(0)
    expect(lines[0].endBeat).toBeLessThanOrEqual(lines[1].startBeat + 0.001)
    const firstMidis = lines[0].notes.map(function(n) { return n.midi })
    const secondMidis = lines[1].notes.map(function(n) { return n.midi })
    expect(Math.max.apply(null, secondMidis)).toBeGreaterThan(Math.max.apply(null, firstMidis))
  })

  test('collects barline beats per printed line', function() {
    const lines = playalongLinesFromTune({
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: {
        '1': { meta: '', notes: ['CDEF GABc |', 'cBAG FEDC |'] },
      },
    })
    expect(lines.length).toBe(2)
    expect(lines[0].barBeats.length).toBeGreaterThan(0)
    expect(lines[1].barBeats.length).toBeGreaterThan(0)
    const compare = buildPlayalongCompareLines(lines, [], 1, [])
    compare.forEach(function(line) {
      expect(line.barBeats.length).toBeGreaterThan(0)
      line.barBeats.forEach(function(beat) {
        expect(beat).toBeGreaterThanOrEqual(-0.02)
        expect(beat).toBeLessThanOrEqual(line.patternDurationBeats + 0.05)
      })
    })
  })

  test('slicePeaksForLine skips count-in and maps remaining audio onto the line beats', function() {
    const peaks = []
    for (let i = 0; i < 8; i += 1) {
      peaks.push({ min: -0.2, max: 0.4 })
    }
    // 8 peaks over 8 seconds. Count-in 2s. Line beats 0-4 at 120bpm => 2s of music (seconds 2-4).
    const sliced = slicePeaksForLine(peaks, 8, {
      startBeat: 0,
      endBeat: 4,
      musicStartOffsetSeconds: 2,
      tempoBpm: 120,
      playbackSpeed: 1,
    })
    expect(sliced.length).toBeGreaterThan(0)
    sliced.forEach(function(peak) {
      expect(peak.beat).toBeGreaterThanOrEqual(0)
      expect(peak.beat).toBeLessThanOrEqual(4)
    })
    expect(sliced[0].beat).toBeCloseTo(0, 1)
  })

  test('slicePeaksForLine still returns a waveform when offset misses the audio', function() {
    const peaks = [{ min: -0.4, max: 0.5 }, { min: -0.2, max: 0.3 }]
    const sliced = slicePeaksForLine(peaks, 1, {
      startBeat: 0,
      endBeat: 4,
      musicStartOffsetSeconds: 9,
      tempoBpm: 120,
      playbackSpeed: 1,
    })
    expect(sliced.length).toBe(2)
  })

  test('slicePeaksForLine infers duration when it is missing', function() {
    const peaks = [{ min: -0.4, max: 0.5 }, { min: -0.2, max: 0.3 }]
    const sliced = slicePeaksForLine(peaks, 0, {
      startBeat: 0,
      endBeat: 4,
      musicStartOffsetSeconds: 0,
      tempoBpm: 120,
      playbackSpeed: 1,
    })
    expect(sliced.length).toBe(2)
  })

  test('slicePitchPointsForLine maps take pitch points onto line-local beats', function() {
    const sliced = slicePitchPointsForLine([
      { timeMs: 1500, rawMidi: 60.2 },
      { timeMs: 2500, rawMidi: 61.1 },
      { timeMs: 5000, rawMidi: 62.4 },
    ], {
      startBeat: 0,
      endBeat: 4,
      musicStartOffsetSeconds: 1,
      tempoBpm: 120,
      playbackSpeed: 1,
      pitchLatencySeconds: 0,
    })
    expect(sliced.length).toBe(2)
    expect(sliced[0].beat).toBeCloseTo(1, 1)
    expect(sliced[1].beat).toBeCloseTo(3, 1)
    expect(sliced[0].rawMidi).toBeCloseTo(60.2, 3)
  })

  test('slicePitchPassesForLine splits a repeated section into two same-line passes', function() {
    const tune = {
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { '1': { meta: '', notes: ['|: CDEF | GABc :|'] } },
    }
    const map = playalongSoundingMapFromTune(tune)
    expect(map.some(function(seg) { return seg.passIndex === 2 })).toBe(true)
    const soundingEnd = map[map.length - 1].soundingEnd
    const points = []
    for (let i = 0; i <= 8; i += 1) {
      points.push({
        timeMs: (i / 8) * (soundingEnd * 0.5) * 1000,
        rawMidi: 60 + i * 0.1,
      })
    }
    const passes = slicePitchPassesForLine(points, {
      startBeat: 0,
      endBeat: 8,
      musicStartOffsetSeconds: 0,
      tempoBpm: 120,
      playbackSpeed: 1,
      soundingMap: map,
      pitchLatencySeconds: 0,
    })
    expect(passes.length).toBeGreaterThanOrEqual(1)
    expect(passes[0].passIndex).toBe(1)
  })

  test('snapPitchPointToNotes folds octaves onto the expected note', function() {
    const snapped = snapPitchPointToNotes(
      { beat: 0.5, rawMidi: 72.2 },
      [{ midi: 60, startBeat: 0, endBeat: 1 }]
    )
    expect(snapped.expectedMidi).toBe(60)
    expect(snapped.rawMidi).toBeCloseTo(60.2, 5)
    expect(snapped.cents).toBeCloseTo(20, 3)
  })

  test('snapPitchPointToNotes prefers the note window that contains the beat', function() {
    const notes = [
      { midi: 60, startBeat: 0, endBeat: 1 },
      { midi: 62, startBeat: 1, endBeat: 2 },
    ]
    const snapped = snapPitchPointToNotes({ beat: 0.2, rawMidi: 60.1 }, notes)
    expect(snapped.expectedMidi).toBe(60)
    const second = snapPitchPointToNotes({ beat: 1.5, rawMidi: 62.2 }, notes)
    expect(second.expectedMidi).toBe(62)
  })

  test('filterPlayalongDisplayPoints keeps heard pitch even when far from the written note', function() {
    const kept = filterPlayalongDisplayPoints([
      { beat: 0.5, rawMidi: 69.1, cents: 10 },
      { beat: 0.7, rawMidi: 67.3, cents: -366 },
      { beat: 1.0, rawMidi: 71, cents: null },
    ])
    expect(kept.length).toBe(3)
  })

  test('foldMidiHarmonicNearExpected maps a twelfth (3rd harmonic) onto the written note', function() {
    expect(foldMidiHarmonicNearExpected(88.05, 69)).toBeCloseTo(69.03, 1)
    expect(foldMidiHarmonicNearExpected(89.71, 71)).toBeCloseTo(70.69, 1)
    expect(foldMidiHarmonicNearExpected(67.34, 71)).toBeCloseTo(67.34, 2)
  })

  test('snapPitchPointToNotes folds a 3rd-harmonic A onto covering A4', function() {
    const snapped = snapPitchPointToNotes(
      { beat: 0.7, rawMidi: 88.05 },
      [{ midi: 69, startBeat: 0, endBeat: 1 }]
    )
    expect(snapped.expectedMidi).toBe(69)
    expect(snapped.cents).toBeCloseTo(3, 0)
  })

  test('snapPitchPointToNotes prefers the covering note at the beat', function() {
    const snapped = snapPitchPointToNotes(
      { beat: 0.9, rawMidi: 64 },
      [
        { midi: 69, startBeat: 0, endBeat: 1 },
        { midi: 64, startBeat: 1, endBeat: 2 },
      ]
    )
    expect(snapped.expectedMidi).toBe(69)
    expect(snapped.cents).toBeCloseTo(-500, 0)
  })

  test('snapPitchPointToNotes still folds onto the nearest note between windows', function() {
    const snapped = snapPitchPointToNotes(
      { beat: 1.05, rawMidi: 72 },
      [
        { midi: 60, startBeat: 0, endBeat: 1 },
        { midi: 67, startBeat: 2, endBeat: 3 },
      ]
    )
    expect(snapped.expectedMidi).toBe(60)
    expect(snapped.rawMidi).toBeCloseTo(60, 5)
  })

  test('slicePitchPointsForLine aligns beats with measured music-start offset', function() {
    const sliced = slicePitchPointsForLine([
      { timeMs: 3000, rawMidi: 62 },
    ], {
      startBeat: 0,
      endBeat: 4,
      musicStartOffsetSeconds: 2.5,
      tempoBpm: 120,
      playbackSpeed: 1,
      pitchLatencySeconds: 0,
    })
    expect(sliced.length).toBe(1)
    expect(sliced[0].beat).toBeCloseTo(1, 2)
  })

  test('slicePitchPointsForLine shifts onsets earlier by default pitch latency', function() {
    const without = slicePitchPointsForLine([
      { timeMs: 2622, rawMidi: 69 },
    ], {
      startBeat: 0,
      endBeat: 4,
      musicStartOffsetSeconds: 2.613,
      tempoBpm: 100,
      playbackSpeed: 1,
      pitchLatencySeconds: 0,
    })
    const withLatency = slicePitchPointsForLine([
      { timeMs: 2622, rawMidi: 69 },
    ], {
      startBeat: 0,
      endBeat: 4,
      musicStartOffsetSeconds: 2.613,
      tempoBpm: 100,
      playbackSpeed: 1,
    })
    expect(without[0].beat).toBeGreaterThan(withLatency[0].beat)
    expect(withLatency[0].beat).toBeLessThan(0.1)
  })

  test('refine + latency maps Cheer Boys-style first pitch near beat 0', function() {
    const storedOffset = 2.198
    const refined = refinePlayalongMusicStartOffsetSeconds(storedOffset, [
      { timeMs: 2622, rawMidi: 69 },
    ], { firstExpectedMidi: 69 })
    const sliced = slicePitchPointsForLine([
      { timeMs: 2622, rawMidi: 69 },
    ], {
      startBeat: 0,
      endBeat: 4,
      musicStartOffsetSeconds: refined,
      tempoBpm: 100,
      playbackSpeed: 1,
    })
    expect(refined).toBeGreaterThan(storedOffset)
    expect(sliced[0].beat).toBeLessThan(0.15)
  })

  test('older takes are lighter than the newest', function() {
    expect(takeWaveformOpacity(0, 3)).toBeLessThan(takeWaveformOpacity(2, 3))
    expect(takeWaveformOpacity(2, 3)).toBe(1)
  })

  test('display ABC lines use key-signature MIDI (G major F#)', function() {
    const abc = [
      'X:1',
      'T:G scale',
      'M:4/4',
      'L:1/4',
      'K:G',
      'G A B c | d e f g |',
    ].join('\n')
    const lines = playalongLinesFromDisplayAbc(abc, {})
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const midis = []
    lines.forEach(function(line) {
      (line.notes || []).forEach(function(note) { midis.push(note.midi) })
    })
    expect(midis).toContain(67) // G4
    expect(midis).toContain(78) // F#5 from written f in K:G
    expect(midis).not.toContain(77) // F natural
  })

  test('inline ABC chords use the top note and keep later pitches in sync', function() {
    const abc = [
      'X:1',
      'T:Chord top',
      'M:4/4',
      'L:1/4',
      'K:C',
      '[CEG] c |',
    ].join('\n')
    const lines = playalongLinesFromDisplayAbc(abc, {})
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const notes = lines[0].notes || []
    expect(notes.length).toBe(2)
    expect(notes[0].midi).toBe(67) // G4, top of [CEG]
    expect(notes[1].midi).toBe(72) // c = C5, not leftover E/G
  })

  test('tune-path inline chords also use the top note', function() {
    const lines = playalongLinesFromTune({
      meter: '4/4',
      noteLength: '1/4',
      key: 'C',
      voices: { '1': { meta: '', notes: ['[CEG] c |'] } },
    })
    expect(lines[0].notes[0].midi).toBe(67)
    expect(lines[0].notes[1].midi).toBe(72)
  })

  test('tied notes keep their printed pitch', function() {
    const abc = [
      'X:1',
      'T:Tie',
      'M:4/4',
      'L:1/4',
      'K:C',
      'C- C D E |',
    ].join('\n')
    const notes = playalongLinesFromDisplayAbc(abc, {})[0].notes
    expect(notes.map(function(n) { return n.midi })).toEqual([60, 60, 62, 64])
  })

  test('bar accidentals apply to later notes in the measure', function() {
    const abc = [
      'X:1',
      'T:Acc',
      'M:4/4',
      'L:1/4',
      'K:C',
      'C ^F F G |',
    ].join('\n')
    const notes = playalongLinesFromDisplayAbc(abc, {})[0].notes
    expect(notes.map(function(n) { return n.midi })).toEqual([60, 66, 66, 67])
  })

  test('display ABC lines include bar beats', function() {
    const abc = [
      'X:1',
      'T:Bars',
      'M:4/4',
      'L:1/4',
      'K:C',
      'C D E F | G A B c |',
    ].join('\n')
    const lines = playalongLinesFromDisplayAbc(abc, {})
    expect(lines.length).toBeGreaterThanOrEqual(1)
    const bars = []
    lines.forEach(function(line) {
      (line.barBeats || []).forEach(function(beat) { bars.push(beat) })
    })
    expect(bars.length).toBeGreaterThan(0)
    const compare = buildPlayalongCompareLines(lines, [], 1, [])
    expect(compare[0].barBeats.length).toBeGreaterThan(0)
  })

  test('display ABC later lines keep notes on the line beat range', function() {
    const abc = [
      'X:1',
      'T:Two lines',
      'M:4/4',
      'L:1/4',
      'K:C',
      'C D E F |',
      'G A B c |',
    ].join('\n')
    const lines = playalongLinesFromDisplayAbc(abc, {})
    expect(lines.length).toBeGreaterThanOrEqual(2)
    expect(lines[1].notes[0].startBeat).toBeGreaterThanOrEqual(lines[1].startBeat - 0.01)
    const compare = buildPlayalongCompareLines(lines, [], 1, [])
    expect(compare[1].expectedNotes[0].startBeat).toBeGreaterThanOrEqual(-0.02)
    expect(compare[1].expectedNotes[0].startBeat).toBeLessThan(compare[1].patternDurationBeats)
  })

  test('transposePlayalongLines shifts written MIDI', function() {
    const lines = playalongLinesFromTune({
      meter: '4/4',
      noteLength: '1/4',
      key: 'C',
      voices: { '1': { meta: '', notes: ['C D E F |'] } },
    })
    const shifted = transposePlayalongLines(lines, 2)
    expect(shifted[0].notes[0].midi).toBe(lines[0].notes[0].midi + 2)
  })
})
