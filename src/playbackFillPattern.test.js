import {
  interpretChordLabel,
  generatePlaybackFillTracks,
  removeChordTracks,
  findChordTrackIndex,
  buildChordTimelineFromTune,
  applyPlaybackFillToSequence,
  buildPlaybackSequence,
  extractChordsPerBarFromTuneNotes,
  inferBarDurationSecFromFlattened,
  FILL_CHANNELS,
} from './playbackFillPattern'
import { applyRhythmPreset } from './drumPatternPresets'
import { buildFillRhythmContext } from './fillDrumRhythm'

describe('playbackFillPattern', function() {
  test('interpretChordLabel builds boom boom2 and chick for C major', function() {
    const chord = interpretChordLabel('C', 0)
    expect(chord.boom).toBe(36)
    expect(chord.boom2).toBe(31)
    expect(chord.chick.length).toBeGreaterThanOrEqual(3)
  })

  test('interpretChordLabel handles break synonyms', function() {
    const chord = interpretChordLabel('n.c.', 0)
    expect(chord.break).toBe(true)
    expect(chord.chick).toEqual([])
  })

  test('generatePlaybackFillTracks boom-chick 4/4 produces bass and chord notes', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '4/4',
      chord: interpretChordLabel('C', 0),
    }]
    const tracks = generatePlaybackFillTracks(timeline, 'guitar-boom-chick', 100)
    expect(tracks.length).toBe(2)
    const bassNotes = tracks[0].filter(function(ev) { return ev.cmd === 'note' })
    const chordNotes = tracks[1].filter(function(ev) { return ev.cmd === 'note' })
    expect(bassNotes.length).toBeGreaterThan(0)
    expect(chordNotes.length).toBeGreaterThan(0)
    expect(tracks[0][0].instrument).toBe(33)
    expect(tracks[0][0].channel).toBe(FILL_CHANNELS.bass)
    expect(tracks[1][0].instrument).toBe(24)
    expect(tracks[1][0].channel).toBe(FILL_CHANNELS.chord)
    bassNotes.forEach(function(n) { expect(n.channel).toBe(FILL_CHANNELS.bass) })
    chordNotes.forEach(function(n) { expect(n.channel).toBe(FILL_CHANNELS.chord) })
  })

  test('generatePlaybackFillTracks block style hits primary beats in 4/4', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '4/4',
      chord: interpretChordLabel('Am', 0),
    }]
    const tracks = generatePlaybackFillTracks(timeline, 'block', 100)
    const notes = tracks.reduce(function(acc, track) {
      return acc.concat(track.filter(function(ev) { return ev.cmd === 'note' }))
    }, [])
    const starts = notes.map(function(n) { return n.start }).sort(function(a, b) { return a - b })
    expect(starts[0]).toBeCloseTo(0, 3)
    expect(starts.indexOf(1)).toBeGreaterThan(-1)
  })

  test('generatePlaybackFillTracks orchestra includes accent track on distinct channels', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '3/4',
      chord: interpretChordLabel('G', 0),
    }]
    const tracks = generatePlaybackFillTracks(timeline, 'orchestra', 100)
    expect(tracks.length).toBe(3)
    expect(tracks[0][0].channel).toBe(FILL_CHANNELS.bass)
    expect(tracks[1][0].channel).toBe(FILL_CHANNELS.chord)
    expect(tracks[2][0].instrument).toBe(47)
    expect(tracks[2][0].channel).toBe(FILL_CHANNELS.accent)
    const channels = tracks.map(function(t) { return t[0].channel })
    expect(new Set(channels).size).toBe(3)
  })

  test('generatePlaybackFillTracks fingerpick uses double-time even arpeggio on guitar channel', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '4/4',
      chord: interpretChordLabel('C', 0),
    }]
    const tracks = generatePlaybackFillTracks(timeline, 'fingerpick', 100)
    expect(tracks.length).toBe(1)
    const notes = tracks[0].filter(function(ev) { return ev.cmd === 'note' })
    expect(notes.length).toBe(8)
    notes.forEach(function(n) {
      expect(n.instrument).toBe(24)
      expect(n.channel).toBe(FILL_CHANNELS.chord)
    })
    const starts = notes.map(function(n) { return n.start })
    for (let i = 1; i < starts.length; i += 1) {
      expect(starts[i] - starts[i - 1]).toBeCloseTo(0.25, 3)
    }
  })

  test('generatePlaybackFillTracks pizzicato uses short staccato notes on bass and pizz channels', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '4/4',
      chord: interpretChordLabel('Am', 0),
    }]
    const tracks = generatePlaybackFillTracks(timeline, 'pizzicato', 100)
    expect(tracks.length).toBe(2)
    const bassNotes = tracks[0].filter(function(ev) { return ev.cmd === 'note' })
    const pizzNotes = tracks[1].filter(function(ev) { return ev.cmd === 'note' })
    expect(bassNotes.length).toBeGreaterThan(0)
    expect(pizzNotes.length).toBeGreaterThan(0)
    bassNotes.forEach(function(n) {
      expect(n.channel).toBe(FILL_CHANNELS.bass)
      expect(n.duration).toBeLessThan(0.2)
    })
    pizzNotes.forEach(function(n) {
      expect(n.instrument).toBe(46)
      expect(n.channel).toBe(FILL_CHANNELS.chord)
      expect(n.duration).toBeLessThan(0.2)
    })
  })

  test('generatePlaybackFillTracks brass-strings produces three tracks with brass accent', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '4/4',
      chord: interpretChordLabel('D', 0),
    }]
    const tracks = generatePlaybackFillTracks(timeline, 'brass-strings', 100)
    expect(tracks.length).toBe(3)
    expect(tracks[2][0].instrument).toBe(61)
    expect(tracks[2][0].channel).toBe(FILL_CHANNELS.accent)
  })

  test('generatePlaybackFillTracks jig-bass produces events for 6/8', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '6/8',
      chord: interpretChordLabel('G', 0),
    }]
    const tracks = generatePlaybackFillTracks(timeline, 'jig-bass', 100)
    const noteCount = tracks.reduce(function(sum, track) {
      return sum + track.filter(function(ev) { return ev.cmd === 'note' }).length
    }, 0)
    expect(noteCount).toBeGreaterThan(0)
  })

  test('generatePlaybackFillTracks fingerpick follows drum groove slot count', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '4/4',
      chord: interpretChordLabel('C', 0),
    }]
    const rhythmContext = buildFillRhythmContext(applyRhythmPreset('rock-basic'))
    const tracks = generatePlaybackFillTracks(timeline, 'fingerpick', 100, rhythmContext)
    const notes = tracks[0].filter(function(ev) { return ev.cmd === 'note' })
    expect(notes.length).toBe(8)
    const starts = notes.map(function(n) { return n.start }).sort(function(a, b) { return a - b })
    expect(starts[1] - starts[0]).toBeCloseTo(0.25, 2)
    expect(starts[0]).toBeCloseTo(0, 3)
  })

  test('generatePlaybackFillTracks guitar boom-chick aligns bass and chords to kick and snare', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '4/4',
      chord: interpretChordLabel('C', 0),
    }]
    const rhythmContext = buildFillRhythmContext(applyRhythmPreset('rock-basic'))
    const tracks = generatePlaybackFillTracks(timeline, 'guitar-boom-chick', 100, rhythmContext)
    const bassNotes = tracks[0].filter(function(ev) { return ev.cmd === 'note' })
    const chordNotes = tracks[1].filter(function(ev) { return ev.cmd === 'note' })
    const bassStarts = [...new Set(bassNotes.map(function(n) { return n.start }))].sort(function(a, b) { return a - b })
    const chordStarts = [...new Set(chordNotes.map(function(n) { return n.start }))].sort(function(a, b) { return a - b })
    expect(bassStarts.length).toBe(2)
    expect(chordStarts.length).toBeGreaterThanOrEqual(2)
    expect(bassStarts[0]).toBeCloseTo(0, 2)
    expect(bassStarts[1]).toBeCloseTo(1, 2)
    expect(chordStarts[0]).toBeCloseTo(0.5, 2)
    expect(chordStarts[1]).toBeCloseTo(1.5, 2)
  })

  test('removeChordTracks strips accompaniment track', function() {
    const sequence = {
      tracks: [
        [{ cmd: 'program', instrument: 73 }, { cmd: 'note', pitch: 72, start: 0, duration: 1 }],
        [
          { cmd: 'program', instrument: 0 },
          { cmd: 'note', pitch: 36, start: 0, duration: 0.5 },
          { cmd: 'note', pitch: 60, start: 0.5, duration: 0.5 },
        ],
      ],
    }
    expect(findChordTrackIndex(sequence.tracks)).toBe(1)
    const next = removeChordTracks(sequence)
    expect(next.tracks.length).toBe(1)
  })

  test('buildChordTimelineFromTune reads chord chart bars', function() {
    const tune = {
      meter: '4/4',
      key: 'C',
      tempo: 120,
      voices: { v1: { notes: ['"C"C2|"F"F2|'] } },
    }
    const tunebook = {
      abcTools: {
        emptyABC: function() { return 'X:1\nM:4/4\nL:1/4\nK:C\n' },
      },
    }
    const abcjsParser = {
      renderChords: function() { return 'C | F |' },
    }
    const visualObj = {
      getMeterFraction: function() { return { num: 4, den: 4 } },
      millisecondsPerMeasure: function() { return 2000 },
    }
    const timeline = buildChordTimelineFromTune(tune, tunebook, abcjsParser, visualObj)
    expect(timeline.length).toBe(2)
    expect(timeline[0].label).toBe('C')
    expect(timeline[1].label).toBe('F')
  })

  test('applyPlaybackFillToSequence injects custom tracks', function() {
    const sequence = {
      tracks: [
        [{ cmd: 'program', instrument: 73 }, { cmd: 'note', pitch: 72, start: 0, duration: 1 }],
        [
          { cmd: 'program', instrument: 0 },
          { cmd: 'note', pitch: 36, start: 0, duration: 0.5 },
          { cmd: 'note', pitch: 60, start: 0.5, duration: 0.5 },
        ],
      ],
    }
    const visualObj = {
      getMeterFraction: function() { return { num: 4, den: 4 } },
      millisecondsPerMeasure: function() { return 2000 },
    }
    const next = applyPlaybackFillToSequence(sequence, visualObj, {
      fillOptions: {
        injectCustomFill: true,
        settings: { style: 'bass-only', level: 100 },
      },
    })
    expect(next.tracks.length).toBeGreaterThan(1)
    const accompaniment = next.tracks.slice(1)
    const noteCount = accompaniment.reduce(function(sum, track) {
      return sum + track.filter(function(ev) { return ev.cmd === 'note' }).length
    }, 0)
    expect(noteCount).toBeGreaterThan(0)
  })

  test('extractChordsPerBarFromTuneNotes parses quoted chord symbols', function() {
    const tune = {
      voices: { v1: { notes: ['"C"C2|"F"F2|"G"G2|'] } },
    }
    expect(extractChordsPerBarFromTuneNotes(tune)).toEqual(['C', 'F', 'G'])
  })

  test('extractChordsPerBarFromTuneNotes skips section marker quoted chords', function() {
    const tune = {
      voices: { v1: { notes: ['"[Verse 1]" z8 | "C" z8 | "G" z8 |'] } },
    }
    expect(extractChordsPerBarFromTuneNotes(tune)).toEqual(['C', 'G'])
  })

  test('inferBarDurationSecFromFlattened matches melody bar grid', function() {
    const flattened = {
      tracks: [[
        { cmd: 'note', pitch: 64, start: 0, duration: 0.25 },
        { cmd: 'note', pitch: 69, start: 0.25, duration: 0.25 },
        { cmd: 'note', pitch: 71, start: 0.5, duration: 0.25 },
        { cmd: 'note', pitch: 76, start: 1, duration: 0.25 },
        { cmd: 'note', pitch: 71, start: 2, duration: 0.25 },
      ]],
    }
    expect(inferBarDurationSecFromFlattened(flattened, '4/4')).toBeCloseTo(2, 1)
  })

  test('inferBarDurationSecFromFlattened matches quarter-note grid from production logs', function() {
    const flattened = {
      tracks: [[
        { cmd: 'note', pitch: 64, start: 0, duration: 0.25 },
        { cmd: 'note', pitch: 69, start: 0.5, duration: 0.25 },
        { cmd: 'note', pitch: 71, start: 1, duration: 0.25 },
        { cmd: 'note', pitch: 76, start: 1.5, duration: 0.25 },
        { cmd: 'note', pitch: 71, start: 2, duration: 0.25 },
      ]],
    }
    expect(inferBarDurationSecFromFlattened(flattened, '4/4')).toBeCloseTo(2, 1)
  })

  test('inferBarDurationSecFromFlattened uses chord span when it agrees with melody grid', function() {
    const flattened = {
      tracks: [[
        { cmd: 'note', pitch: 64, start: 0, duration: 0.25 },
        { cmd: 'note', pitch: 69, start: 0.25, duration: 0.25 },
        { cmd: 'note', pitch: 71, start: 0.5, duration: 0.125 },
        { cmd: 'note', pitch: 76, start: 1, duration: 0.25 },
        { cmd: 'note', pitch: 71, start: 2, duration: 0.25 },
        { cmd: 'note', pitch: 67, start: 3.75, duration: 0.25 },
      ]],
    }
    expect(inferBarDurationSecFromFlattened(flattened, '4/4', { chordBarCount: 2 })).toBeCloseTo(2, 1)
  })

  test('inferBarDurationSecFromFlattened prefers melody grid when chord span disagrees', function() {
    const flattened = {
      tracks: [[
        { cmd: 'note', pitch: 64, start: 0, duration: 0.25 },
        { cmd: 'note', pitch: 69, start: 0.25, duration: 0.25 },
        { cmd: 'note', pitch: 71, start: 0.5, duration: 0.125 },
        { cmd: 'note', pitch: 71, start: 0.625, duration: 0.125 },
        { cmd: 'note', pitch: 72, start: 0.75, duration: 0.125 },
        { cmd: 'note', pitch: 74, start: 0.875, duration: 0.125 },
        { cmd: 'note', pitch: 76, start: 1, duration: 0.25 },
        { cmd: 'note', pitch: 71, start: 2, duration: 0.25 },
        { cmd: 'note', pitch: 67, start: 31.75, duration: 0.25 },
      ]],
    }
    expect(inferBarDurationSecFromFlattened(flattened, '4/4', { chordBarCount: 12 })).toBeCloseTo(2, 1)
  })

  test('inferBarDurationSecFromFlattened does not halve bar on eighth-note melody', function() {
    const flattened = {
      tracks: [[
        { cmd: 'note', pitch: 64, start: 0, duration: 0.125 },
        { cmd: 'note', pitch: 66, start: 0.125, duration: 0.125 },
        { cmd: 'note', pitch: 68, start: 0.25, duration: 0.125 },
        { cmd: 'note', pitch: 69, start: 0.375, duration: 0.125 },
        { cmd: 'note', pitch: 71, start: 0.5, duration: 0.125 },
        { cmd: 'note', pitch: 72, start: 0.625, duration: 0.125 },
        { cmd: 'note', pitch: 74, start: 0.75, duration: 0.125 },
        { cmd: 'note', pitch: 76, start: 0.875, duration: 0.125 },
        { cmd: 'note', pitch: 71, start: 1, duration: 0.125 },
        { cmd: 'note', pitch: 69, start: 1.125, duration: 0.125 },
        { cmd: 'note', pitch: 67, start: 1.25, duration: 0.125 },
        { cmd: 'note', pitch: 64, start: 1.375, duration: 0.125 },
        { cmd: 'note', pitch: 62, start: 1.5, duration: 0.125 },
        { cmd: 'note', pitch: 60, start: 1.625, duration: 0.125 },
        { cmd: 'note', pitch: 62, start: 1.75, duration: 0.125 },
        { cmd: 'note', pitch: 64, start: 1.875, duration: 0.125 },
        { cmd: 'note', pitch: 67, start: 2, duration: 0.125 },
      ]],
    }
    expect(inferBarDurationSecFromFlattened(flattened, '4/4')).toBeCloseTo(2, 1)
  })

  test('buildPlaybackSequence custom fill skips abcjs chord generation', function() {
    const calls = []
    const synthObj = {
      setUpAudio: function(opts) {
        calls.push(opts)
        return {
          tracks: [
            [{ cmd: 'program', instrument: 73 }, { cmd: 'note', pitch: 72, start: 0, duration: 1 }],
          ],
        }
      },
      getMeterFraction: function() { return { num: 4, den: 4 } },
      millisecondsPerMeasure: function() { return 2000 },
    }
    const tune = {
      transpose: 0,
      voices: { v1: { notes: ['"C"C2|"F"F2|'] } },
    }
    const sequence = buildPlaybackSequence(synthObj, {
      fillOptions: {
        injectCustomFill: true,
        settings: { style: 'block', level: 100 },
      },
      tune: tune,
    })
    expect(calls.length).toBe(1)
    expect(calls[0].chordsOff).toBe(true)
    expect(sequence.tracks.length).toBeGreaterThan(1)
  })
})
