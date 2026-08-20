import {
  contrastTextForHex,
  expectedNotesFromPlayalongTune,
  scorePlayalongTake,
} from './playalongTakeScore'

describe('playalongTakeScore', function() {
  test('contrastTextForHex picks dark text on yellow', function() {
    expect(contrastTextForHex('#f1c40f')).toBe('#212529')
    expect(contrastTextForHex('#e74c3c')).toBe('#fff')
  })

  test('scorePlayalongTake is 100 when samples match each note', function() {
    const notes = [
      { midi: 60, startBeat: 0, endBeat: 1 },
      { midi: 62, startBeat: 1, endBeat: 2 },
    ]
    const summary = scorePlayalongTake(notes, [
      { timeMs: 100, rawMidi: 60 },
      { timeMs: 200, rawMidi: 60 },
      { timeMs: 300, rawMidi: 60 },
      { timeMs: 600, rawMidi: 62 },
      { timeMs: 700, rawMidi: 62 },
      { timeMs: 800, rawMidi: 62 },
    ], {
      musicStartOffsetSeconds: 0,
      tempoBpm: 120,
      playbackSpeed: 1,
    })
    expect(summary.pitchPct).toBe(100)
    expect(summary.hits).toBe(2)
  })

  test('scorePlayalongTake is 0 when pitch is far from the notes', function() {
    const summary = scorePlayalongTake(
      [{ midi: 60, startBeat: 0, endBeat: 1 }],
      [
        { timeMs: 100, rawMidi: 66 },
        { timeMs: 200, rawMidi: 66 },
        { timeMs: 300, rawMidi: 66 },
      ],
      { musicStartOffsetSeconds: 0, tempoBpm: 120, playbackSpeed: 1 }
    )
    expect(summary.pitchPct).toBe(0)
  })

  test('scorePlayalongTake ignores notes after the last captured sample', function() {
    const notes = [
      { midi: 60, startBeat: 0, endBeat: 1 },
      { midi: 62, startBeat: 1, endBeat: 2 },
      { midi: 64, startBeat: 2, endBeat: 3 },
      { midi: 65, startBeat: 3, endBeat: 4 },
    ]
    const summary = scorePlayalongTake(notes, [
      { timeMs: 100, rawMidi: 60 },
      { timeMs: 200, rawMidi: 60 },
      { timeMs: 300, rawMidi: 60 },
      { timeMs: 600, rawMidi: 62 },
      { timeMs: 700, rawMidi: 62 },
      { timeMs: 800, rawMidi: 62 },
    ], {
      musicStartOffsetSeconds: 0,
      tempoBpm: 120,
      playbackSpeed: 1,
    })
    expect(summary.pitchPct).toBe(100)
    expect(summary.hits).toBe(2)
    expect(summary.totalNotes).toBe(2)
  })

  test('scorePlayalongTake folds whistle octaves onto the written notes', function() {
    const summary = scorePlayalongTake(
      [{ midi: 67, startBeat: 0, endBeat: 1 }],
      [
        { timeMs: 100, rawMidi: 79 },
        { timeMs: 200, rawMidi: 79.1 },
        { timeMs: 300, rawMidi: 78.9 },
      ],
      { musicStartOffsetSeconds: 0, tempoBpm: 120, playbackSpeed: 1 }
    )
    expect(summary.pitchPct).toBe(100)
  })

  test('scorePlayalongTake folds a 3rd-harmonic whistle A onto written A4', function() {
    const summary = scorePlayalongTake(
      [{ midi: 69, startBeat: 0, endBeat: 1 }],
      [
        { timeMs: 100, rawMidi: 88.05 },
        { timeMs: 200, rawMidi: 88.1 },
        { timeMs: 300, rawMidi: 87.9 },
      ],
      { musicStartOffsetSeconds: 0, tempoBpm: 120, playbackSpeed: 1 }
    )
    expect(summary.pitchPct).toBe(100)
  })

  test('scorePlayalongTake skips sparse junk takes', function() {
    const summary = scorePlayalongTake(
      [{ midi: 69, startBeat: 0, endBeat: 1 }],
      [{ timeMs: 3600, rawMidi: 71 }],
      { musicStartOffsetSeconds: 2.4, tempoBpm: 100, playbackSpeed: 1 }
    )
    expect(summary.skippedSparse).toBe(true)
    expect(summary.pitchPct).toBe(null)
  })

  test('expectedNotesFromPlayalongTune reads primary-voice notes', function() {
    const notes = expectedNotesFromPlayalongTune({
      meter: '4/4',
      noteLength: '1/8',
      key: 'C',
      voices: { '1': { meta: '', notes: ['CDEF |'] } },
    }, 0)
    expect(notes.length).toBeGreaterThan(0)
    expect(notes[0].midi).toBeGreaterThan(0)
  })
})
