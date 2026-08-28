import {
  interpretChordLabel,
  generatePlaybackFillTracks,
  removeChordTracks,
  findChordTrackIndex,
  buildChordTimelineFromTune,
  applyPlaybackFillToSequence,
  buildPlaybackSequence,
  balanceAbcjsPlaybackTrackVolumes,
  ABCJS_CHORD_TRACK_BASE_SCALE,
  ABCJS_CHORD_DURATION_SCALE,
  ABCJS_MELODY_TRACK_BOOST,
  ABCJS_SHORT_MELODY_BOOST,
  extractChordsPerBarFromTuneNotes,
  inferBarDurationSecFromFlattened,
  FILL_CHANNELS,
  secondsToWholeNotesFactor,
  scaleSequenceTrackTimes,
  barWholeNotesFromMeter,
  pickupOffsetSecFromVisualObj,
  soundingTransposeSemitones,
  extractExpandedChordChangesFromVisualObj,
  expandChordChangesThroughRepeats,
  buildVisualChordRepeatTokens,
} from './playbackFillPattern'
import abcjs from 'abcjs'
import { applyRhythmPreset } from './drumPatternPresets'
import { buildFillRhythmContext } from './fillDrumRhythm'

describe('playbackFillPattern', function() {
  test('interpretChordLabel builds boom boom2 and chick for C major', function() {
    const chord = interpretChordLabel('C', 0)
    expect(chord.boom).toBe(36)
    expect(chord.boom2).toBe(31)
    expect(chord.chick.length).toBeGreaterThanOrEqual(3)
  })

  test('interpretChordLabel applies transpose to bass and chick together', function() {
    const chord = interpretChordLabel('G', -5)
    expect(chord.boom).toBe(38)
    expect(chord.chick[0]).toBe(interpretChordLabel('G', 0).chick[0] - 5)
  })

  test('soundingTransposeSemitones cancels visualTranspose like abcjs', function() {
    expect(soundingTransposeSemitones(-5, -5)).toBe(0)
    expect(soundingTransposeSemitones(-5, 0)).toBe(-5)
    expect(soundingTransposeSemitones(0, -5)).toBe(5)
  })

  test('expandChordChangesThroughRepeats doubles a simple repeated strain', function() {
    const tokens = [
      { type: 'bar', barType: 'bar_left_repeat', startEnding: '', endEnding: false, t: 0 },
      { type: 'chord', label: 'Gm', t: 0 },
      { type: 'note', t: 0, d: 0.5 },
      { type: 'note', t: 0.5, d: 0.5 },
      { type: 'bar', barType: 'bar_right_repeat', startEnding: '', endEnding: false, t: 1 },
    ]
    const expanded = expandChordChangesThroughRepeats(tokens)
    expect(expanded.musicWhole).toBeCloseTo(2, 5)
    expect(expanded.changes).toEqual([
      { label: 'Gm', atWhole: 0 },
      { label: 'Gm', atWhole: 1 },
    ])
  })

  test('expandChordChangesThroughRepeats matches abcjs for :| without |: (Amazone)', function() {
    const abc = [
      'X:1',
      'T:Amazone',
      'M:6/8',
      'L:1/4',
      'K:C',
      '"Am"ee/2 e/2d/2c/2 | "F"cc/2 c/2d/2e/2 | "Dm"f/2e/2d/2 e/2d/2c/2 | "Em7"dB/2 B/2c/2d/2 |',
      '"Am"ee/2 e/2d/2c/2 | "F"cc/2 c/2d/2e/2 | "Dm"f/2e/2d/2 e/2d/2c/2 | "Em"B3 :|',
      '"Am"A"G"B"F"c | "Dm"d3 | "Em"e/2g/2e/2 d/2c/2B/2 | "Am"cA/2 AG/2 |',
      '"Am"A"G"B"F"c |"Dm"d3 | "Em"e/2g/2e/2 d/2c/2B/2 | "Am"A3 :|',
    ].join('\n')
    const visualObj = abcjs.renderAbc('*', abc)[0]
    const built = buildVisualChordRepeatTokens(visualObj)
    const rawWhole = built.tokens.filter(function(t) { return t.type === 'note' })
      .reduce(function(sum, t) { return sum + t.d }, 0)
    const expanded = extractExpandedChordChangesFromVisualObj(visualObj)
    // Two 8-bar strains, each repeated once → 4× the written length.
    expect(rawWhole).toBeGreaterThan(0)
    expect(expanded.musicWhole).toBeCloseTo(rawWhole * 2, 4)
    expect(expanded.changes.length).toBeGreaterThan(16)
    const multiBar = expanded.changes.filter(function(c) {
      return c.label === 'G' || c.label === 'B' || c.label === 'F'
    })
    expect(multiBar.length).toBeGreaterThan(0)
  })

  test('buildChordTimelineFromTune matches melody when visualTranspose cancels midiTranspose', function() {
    const pickup = 0.25
    const voice = [
      { el_type: 'note', duration: pickup },
      { el_type: 'note', duration: 0.75, chord: [{ name: 'G' }] },
    ]
    const visualObj = {
      visualTranspose: -5,
      getMeterFraction: function() { return { num: 3, den: 4 } },
      getPickupLength: function() { return pickup },
      millisecondsPerMeasure: function() { return 1800 },
      lines: [{ staff: [{ voices: [voice] }] }],
    }
    const timeline = buildChordTimelineFromTune(
      { transpose: -5, voices: { v1: { notes: ['D|"G"G2|'] } } },
      null,
      null,
      visualObj,
      { barDurationSec: 1.8, transpose: -5 }
    )
    expect(timeline[0].label).toBe('G')
    // Net transpose 0 → written G boom (43), not D (38)
    expect(timeline[0].chord.boom).toBe(43)
  })

  test('interpretChordLabel keeps accidentals on bass root', function() {
    const fs = interpretChordLabel('F#m', 0)
    expect(fs.boom).toBe(42)
    const bb = interpretChordLabel('Bb', 0)
    expect(bb.boom).toBe(34)
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

  test('buildChordTimelineFromTune offsets bars by anacrusis', function() {
    const tune = {
      transpose: 0,
      voices: { v1: { notes: ['D|"G"G2A|"D7"A2|'] } },
    }
    const visualObj = {
      getMeterFraction: function() { return { num: 3, den: 4 } },
      getPickupLength: function() { return 0.25 },
      millisecondsPerMeasure: function() { return 1800 },
    }
    const timeline = buildChordTimelineFromTune(tune, null, null, visualObj, {
      barDurationSec: 1.8,
    })
    expect(pickupOffsetSecFromVisualObj(visualObj, 1.8)).toBeCloseTo(0.6)
    expect(timeline[0].label).toBe('G')
    expect(timeline[0].startSec).toBeCloseTo(0.6)
    expect(timeline[1].startSec).toBeCloseTo(2.4)
  })

  test('buildChordTimelineFromTune follows mid-bar chord changes from visualObj', function() {
    const pickup = 0.25
    const voice = [
      { el_type: 'note', duration: pickup },
      { el_type: 'note', duration: 0.5, chord: [{ name: 'G' }] },
      { el_type: 'note', duration: 0.25 },
      { el_type: 'note', duration: 0.5 },
      { el_type: 'note', duration: 0.25, chord: [{ name: 'D7' }] },
      { el_type: 'note', duration: 0.5, chord: [{ name: 'Em' }] },
      { el_type: 'note', duration: 0.25, chord: [{ name: 'C' }] },
    ]
    const visualObj = {
      getMeterFraction: function() { return { num: 3, den: 4 } },
      getPickupLength: function() { return pickup },
      millisecondsPerMeasure: function() { return 1800 },
      lines: [{ staff: [{ voices: [voice] }] }],
    }
    const timeline = buildChordTimelineFromTune(
      { transpose: 0, voices: { v1: { notes: ['D|"G"G2A|B2"D7"A|"Em"G2"C"E|'] } } },
      null,
      null,
      visualObj,
      { barDurationSec: 1.8 }
    )
    expect(timeline.some(function(e) {
      return e.label === 'G' && Math.abs(e.activeStartSec - 0.6) < 1e-6 && Math.abs(e.startSec - 0.6) < 1e-6
    })).toBe(true)
    const d7 = timeline.find(function(e) { return e.label === 'D7' })
    expect(d7).toBeTruthy()
    expect(d7.startSec).toBeCloseTo(2.4, 5)
    expect(d7.activeStartSec).toBeCloseTo(3.6, 5)
    const em = timeline.find(function(e) { return e.label === 'Em' })
    expect(em.activeStartSec).toBeCloseTo(4.2, 5)
    const c = timeline.find(function(e) { return e.label === 'C' })
    expect(c.startSec).toBeCloseTo(4.2, 5)
    expect(c.activeStartSec).toBeCloseTo(5.4, 5)

    const tracks = generatePlaybackFillTracks(
      timeline.filter(function(e) { return e.label === 'G' || e.label === 'D7' }),
      'boom-chick',
      100
    )
    const bass = tracks[0].filter(function(ev) { return ev.cmd === 'note' })
    const d7Bass = bass.filter(function(n) {
      return n.start >= d7.activeStartSec - 0.01 && n.start < d7.activeEndSec
    })
    expect(d7Bass.length).toBe(0)
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

  test('extractChordsPerBarFromTuneNotes carries chords across bars without symbols', function() {
    const tune = {
      voices: { v1: { notes: ['"G"G2|B2|"D"D2|'] } },
    }
    expect(extractChordsPerBarFromTuneNotes(tune)).toEqual(['G', 'G', 'D'])
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

  test('balanceAbcjsPlaybackTrackVolumes boosts melody and scales chords by fill level', function() {
    const sequence = {
      tracks: [
        [{ cmd: 'note', pitch: 72, volume: 80, start: 0, duration: 0.125 }],
        [{ cmd: 'note', pitch: 60, volume: 64, start: 0, duration: 0.125 }],
      ],
    }
    balanceAbcjsPlaybackTrackVolumes(sequence, { fillLevel: 100 })
    expect(sequence.tracks[0][0].volume).toBe(Math.min(127, Math.round(80 * ABCJS_MELODY_TRACK_BOOST)))
    expect(sequence.tracks[1][0].volume).toBe(Math.round(64 * ABCJS_CHORD_TRACK_BASE_SCALE))
    expect(sequence.tracks[1][0].duration).toBeCloseTo(0.125 * ABCJS_CHORD_DURATION_SCALE, 5)
  })

  test('balanceAbcjsPlaybackTrackVolumes boosts short grace notes', function() {
    const sequence = {
      tracks: [
        [{ cmd: 'note', pitch: 69, volume: 80, start: 0, duration: 0.03125 }],
      ],
    }
    balanceAbcjsPlaybackTrackVolumes(sequence, { fillLevel: 100 })
    expect(sequence.tracks[0][0].volume).toBe(Math.min(127, Math.round(80 * ABCJS_MELODY_TRACK_BOOST * ABCJS_SHORT_MELODY_BOOST)))
  })

  test('buildPlaybackSequence boom-chick applies fill level to abcjs chord track', function() {
    const synthObj = {
      setUpAudio: function() {
        return {
          tracks: [
            [{ cmd: 'note', pitch: 72, volume: 80, start: 0, duration: 0.125 }],
            [{ cmd: 'note', pitch: 60, volume: 64, start: 0, duration: 0.125 }],
          ],
        }
      },
    }
    const sequence = buildPlaybackSequence(synthObj, {
      fillOptions: {
        injectCustomFill: false,
        chordsOff: false,
        styleDef: { usesAbcjsChords: true },
        settings: { style: 'boom-chick', level: 50 },
      },
    })
    expect(sequence.tracks[0][0].volume).toBe(Math.min(127, Math.round(80 * ABCJS_MELODY_TRACK_BOOST)))
    expect(sequence.tracks[1][0].volume).toBe(Math.round(64 * 0.5 * ABCJS_CHORD_TRACK_BASE_SCALE))
  })

  test('secondsToWholeNotesFactor converts wall-clock fill times for 3/4', function() {
    // 3/4 at Q=90 → 2000ms/bar; bar = 0.75 whole notes
    expect(barWholeNotesFromMeter({ num: 3, den: 4 })).toBeCloseTo(0.75)
    expect(secondsToWholeNotesFactor(2000, { num: 3, den: 4 })).toBeCloseTo(0.375)
  })

  test('scaleSequenceTrackTimes converts fill seconds into whole notes', function() {
    const tracks = [[
      { cmd: 'note', pitch: 60, start: 2, duration: 0.5 },
    ]]
    scaleSequenceTrackTimes(tracks, 0.375)
    expect(tracks[0][0].start).toBeCloseTo(0.75)
    expect(tracks[0][0].duration).toBeCloseTo(0.1875)
  })

  test('buildPlaybackSequence custom fill converts seconds to whole notes', function() {
    const synthObj = {
      setUpAudio: function() {
        return {
          tracks: [
            [{ cmd: 'program', instrument: 0 }, { cmd: 'note', pitch: 72, start: 0, duration: 0.25 }],
          ],
          totalDuration: 1,
        }
      },
      getMeterFraction: function() { return { num: 4, den: 4 } },
      millisecondsPerMeasure: function() { return 2000 },
    }
    const tune = {
      transpose: 0,
      voices: { v1: { notes: ['"C"C4|"C"C4|'] } },
    }
    const sequence = buildPlaybackSequence(synthObj, {
      fillOptions: {
        injectCustomFill: true,
        settings: { style: 'block', level: 100 },
      },
      tune: tune,
      millisecondsPerMeasure: 2000,
    })
    expect(sequence._resolvedBarDurationSec).toBeUndefined()
    const fillNotes = sequence.tracks.slice(1).reduce(function(acc, track) {
      return acc.concat(track.filter(function(ev) { return ev.cmd === 'note' }))
    }, [])
    expect(fillNotes.length).toBeGreaterThan(0)
    // Bar is 2s / 1 whole note → factor 0.5; a half-bar stab (~1s) → ~0.5 whole notes
    fillNotes.forEach(function(n) {
      expect(n.start).toBeLessThan(3)
      expect(n.duration).toBeLessThan(1.1)
    })
  })
})
