import abcjs from 'abcjs'
import {
  parseVoltaPasses,
  expandThroughVoltaRepeats,
  expandVisualObjThroughVoltaRepeats,
  bodyStartAfterLeadingPickup,
  buildSoundingWrittenMap,
  mapSoundingWholeToWritten,
  soundingSegmentsToBeats,
} from './voltaRepeatExpand'
import {
  extractExpandedChordChangesFromVisualObj,
  buildPlaybackSequence,
} from './playbackFillPattern'
import { resolveFillPlaybackOptions } from './playbackFillSettings'

const JOSEFINS_SHORT = [
  'X:1',
  'T: Josefins Dopvals',
  'M:3/4',
  'L:1/4',
  'Q: 1/4=100',
  'K:F',
  'V:1',
  'z"C7"C \\',
  '| "F"CFG | AcB | AGF | C2D \\',
  '| "Bb"B,>B,B, |',
  '|1,3 "C"DFE | "Gm"D3 | "C7"C3 \\',
  ':|2,4 "Bb"[DB,]EF | "C7"G3- | G  A B :|',
  '|: "F"cAc | f2e | "Bb"d3 | "F"c3 :|',
].join('\n')

const JOSEFINS_FULL = [
  'X:1',
  'T: Josefins Dopvals',
  'M:3/4',
  'L:1/4',
  'Q: 1/4=100',
  'K:F',
  'V:1',
  'z"C7"C \\',
  '| "F"CFG | AcB | AGF | C2D \\',
  '| "Bb"B,>B,B, |',
  '|1,3 "C"DFE | "Gm"D3 | "C7"C3 \\',
  ':|2,4 "Bb"[DB,]EF | "C7"G3- | G  A B :|',
  '|: "F"cAc | f2e | "Bb"d3 | "F"c3 | "Gm"Bdc | "Bb"BAG | "C7"A>BA | "C7"GAB |',
  '"F"cAc | f2e | "Bb"d3 | "C"c3 | "Bb"Bdc | "Bb"BAG | "C7"A>BA | "C7"GAB |',
  '"F"AGF | "C7"E2F | "Bb"F3 | B,>CB,  | "F"A,CF | "C7"EDE | "F"F3- | F A c:|',
].join('\n')

describe('voltaRepeatExpand', function() {
  test('parseVoltaPasses reads 1,3 and ranges', function() {
    expect(parseVoltaPasses('1,3')).toEqual([1, 3])
    expect(parseVoltaPasses('2,4')).toEqual([2, 4])
    expect(parseVoltaPasses('1')).toEqual([1])
    expect(parseVoltaPasses('1-3')).toEqual([1, 2, 3])
  })

  test('expandVisualObjThroughVoltaRepeats force-merges staff lines so ending 2 is not a solo repeat', function() {
    const visualObj = abcjs.renderAbc('*', JOSEFINS_SHORT)[0]
    expect(visualObj.lines.length).toBeGreaterThan(1)
    // Even if deline were skipped, force-merge must keep four A passes.
    const expanded = expandVisualObjThroughVoltaRepeats(visualObj)
    expect(expanded.lines.length).toBe(1)
    const flat = expanded.setUpAudio({ chordsOff: true })
    const mel = flat.tracks[0].filter(function(e) { return e.cmd === 'note' })
    const melodyWhole = mel.reduce(function(m, e) {
      return Math.max(m, e.start + e.duration)
    }, 0)
    expect(melodyWhole).toBeCloseTo(30.5, 3)
    // Must be longer than native abcjs (which repeats ending 2 alone).
    const native = visualObj.setUpAudio({ chordsOff: true })
    const nativeMel = native.tracks[0].filter(function(e) { return e.cmd === 'note' })
    const nativeWhole = nativeMel.reduce(function(m, e) {
      return Math.max(m, e.start + e.duration)
    }, 0)
    expect(melodyWhole).toBeGreaterThan(nativeWhole + 1)
  })

  test('Josefins |1,3 / |2,4 expands to four A passes then B', function() {
    const visualObj = abcjs.renderAbc('*', JOSEFINS_SHORT)[0]
    expect(visualObj.getPickupLength()).toBeCloseTo(0.5, 5)
    const expandedObj = expandVisualObjThroughVoltaRepeats(visualObj)
    const flat = expandedObj.setUpAudio({ chordsOff: true })
    const mel = flat.tracks[0].filter(function(e) { return e.cmd === 'note' })
    const melodyWhole = mel.reduce(function(m, e) {
      return Math.max(m, e.start + e.duration)
    }, 0)

    expect(melodyWhole).toBeCloseTo(30.5, 3)

    const chordExp = extractExpandedChordChangesFromVisualObj(visualObj)
    expect(chordExp.musicWhole).toBeCloseTo(30.5, 3)

    const aroundSecond = chordExp.changes.filter(function(c) {
      return c.atWhole >= 6.4 && c.atWhole < 7.0
    })
    expect(aroundSecond.some(function(c) { return c.label === 'F' })).toBe(true)
  })

  test('buildSoundingWrittenMap maps pass 2 body to written A, not ending 1', function() {
    const visualObj = abcjs.renderAbc('*', JOSEFINS_SHORT)[0]
    const map = buildSoundingWrittenMap(visualObj)
    expect(map.soundingWhole).toBeCloseTo(30.5, 3)
    const atPass2 = mapSoundingWholeToWritten(map.segments, 6.6)
    expect(atPass2).toBeTruthy()
    expect(atPass2.passIndex).toBe(2)
    expect(atPass2.writtenWhole).toBeGreaterThanOrEqual(0.5)
    expect(atPass2.writtenWhole).toBeLessThan(4.25)
    const atEnding2 = mapSoundingWholeToWritten(map.segments, 10.5)
    expect(atEnding2).toBeTruthy()
    expect(atEnding2.passIndex).toBe(2)
    expect(atEnding2.writtenWhole).toBeGreaterThanOrEqual(6.5)
  })

  test('soundingSegmentsToBeats preserves pass structure', function() {
    const visualObj = abcjs.renderAbc('*', JOSEFINS_SHORT)[0]
    const map = buildSoundingWrittenMap(visualObj)
    const beatLen = visualObj.getBeatLength()
    const beats = soundingSegmentsToBeats(map.segments, beatLen)
    expect(beats.length).toBe(map.segments.length)
    const pass2 = beats.filter(function(s) { return s.passIndex === 2 })
    expect(pass2.length).toBeGreaterThan(0)
  })

  test('progress seek ratio through mid pass 3 maps to written A body', function() {
    const visualObj = abcjs.renderAbc('*', JOSEFINS_SHORT)[0]
    const map = buildSoundingWrittenMap(visualObj)
    // Mid pass 3: three A passes ≈ 3×(~6 whole after pickup once) → ~18.5
    const midPass3Whole = 18.5
    const ratio = midPass3Whole / map.soundingWhole
    expect(ratio).toBeGreaterThan(0.4)
    expect(ratio).toBeLessThan(0.85)
    const mapped = mapSoundingWholeToWritten(map.segments, ratio * map.soundingWhole)
    expect(mapped.passIndex).toBe(3)
    // Ending 1 occupies written ~4.25–6.5; A body / early ending is ≤ 6.5.
    expect(mapped.writtenWhole).toBeLessThanOrEqual(6.5)
    expect(mapped.writtenWhole).toBeGreaterThanOrEqual(0.5)
  })

  test('expanded sounding duration matches sequence for progress bar total', function() {
    const visualObj = abcjs.renderAbc('*', JOSEFINS_SHORT)[0]
    const map = buildSoundingWrittenMap(visualObj)
    const fillOpts = resolveFillPlaybackOptions({
      playbackFillStyle: 'off',
      playbackFillLevel: 0,
    })
    const sequence = buildPlaybackSequence(visualObj, {
      fillOptions: fillOpts,
      chordsOff: true,
    })
    const mel = sequence.tracks[0].filter(function(e) { return e.cmd === 'note' })
    const melEnd = mel.reduce(function(m, e) { return Math.max(m, e.start + e.duration) }, 0)
    expect(map.soundingWhole).toBeCloseTo(melEnd, 2)
    expect(map.soundingWhole).toBeCloseTo(30.5, 2)
  })

  test('buildPlaybackSequence keeps fill on melody downbeats after first repeat', function() {
    const visualObj = abcjs.renderAbc('*', JOSEFINS_FULL)[0]
    const fillOpts = resolveFillPlaybackOptions({
      playbackFillStyle: 'block',
      playbackFillLevel: 100,
    })
    const sequence = buildPlaybackSequence(visualObj, {
      fillOptions: fillOpts,
      chordsOff: true,
    })
    expect(sequence).toBeTruthy()
    const mel = sequence.tracks[0].filter(function(e) { return e.cmd === 'note' })
    const fill = sequence.tracks.slice(1).reduce(function(acc, track) {
      return acc.concat(track.filter(function(e) { return e.cmd === 'note' }))
    }, [])
    const melEnd = mel.reduce(function(m, e) { return Math.max(m, e.start + e.duration) }, 0)
    const fillEnd = fill.reduce(function(m, e) { return Math.max(m, e.start + e.duration) }, 0)

    expect(melEnd).toBeCloseTo(60.5, 2)
    expect(Math.abs(fillEnd - melEnd)).toBeLessThan(0.5)

    ;[6.5, 12.5, 18.5, 24.5].forEach(function(t) {
      expect(mel.some(function(e) {
        return e.start >= t - 0.02 && e.start < t + 0.4
      })).toBe(true)
      expect(fill.some(function(e) {
        return Math.abs(e.start - t) < 0.03 || (e.start >= t - 0.02 && e.start < t + 0.4)
      })).toBe(true)
    })

    const fillAt65 = fill.filter(function(e) { return Math.abs(e.start - 6.5) < 0.03 })
    expect(fillAt65.length).toBeGreaterThan(0)
  })

  test('expandThroughVoltaRepeats doubles a plain |: :| strain', function() {
    const tokens = [
      { type: 'bar', barType: 'bar_left_repeat', startEnding: '', endEnding: false },
      { type: 'chord', label: 'Gm' },
      { type: 'note', d: 0.5 },
      { type: 'note', d: 0.5 },
      { type: 'bar', barType: 'bar_right_repeat', startEnding: '', endEnding: false },
    ]
    const flat = expandThroughVoltaRepeats(tokens)
    const notes = flat.filter(function(t) { return t.type === 'note' })
    const whole = notes.reduce(function(s, t) { return s + t.d }, 0)
    expect(whole).toBeCloseTo(2, 5)
  })

  test('leading pickup is omitted on later volta passes', function() {
    const tokens = [
      { type: 'note', d: 0.5 },
      { type: 'bar', barType: 'bar_thin', startEnding: '', endEnding: false },
      { type: 'chord', label: 'F' },
      { type: 'note', d: 0.75 },
      { type: 'bar', barType: 'bar_thin', startEnding: '1,3', endEnding: false },
      { type: 'chord', label: 'C' },
      { type: 'note', d: 0.75 },
      { type: 'bar', barType: 'bar_right_repeat', startEnding: '2,4', endEnding: true },
      { type: 'chord', label: 'Bb' },
      { type: 'note', d: 0.75 },
      { type: 'bar', barType: 'bar_right_repeat', startEnding: '', endEnding: true },
    ]
    expect(bodyStartAfterLeadingPickup(tokens, 0, 0.5)).toBe(1)
    const flat = expandThroughVoltaRepeats(tokens, { pickupWhole: 0.5 })
    const whole = flat.filter(function(t) { return t.type === 'note' })
      .reduce(function(s, t) { return s + t.d }, 0)
    expect(whole).toBeCloseTo(6.5, 5)
  })
})
