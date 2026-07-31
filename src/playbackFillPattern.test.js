import {
  interpretChordLabel,
  generatePlaybackFillTracks,
  removeChordTracks,
  findChordTrackIndex,
  buildChordTimelineFromTune,
  applyPlaybackFillToSequence,
  buildPlaybackSequence,
  extractChordsPerBarFromTuneNotes,
} from './playbackFillPattern'

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
    expect(tracks[1][0].instrument).toBe(24)
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

  test('generatePlaybackFillTracks orchestra includes accent track', function() {
    const timeline = [{
      startSec: 0,
      barDurationSec: 2,
      meterKey: '3/4',
      chord: interpretChordLabel('G', 0),
    }]
    const tracks = generatePlaybackFillTracks(timeline, 'orchestra', 100)
    expect(tracks.length).toBe(3)
    expect(tracks[2][0].instrument).toBe(47)
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
