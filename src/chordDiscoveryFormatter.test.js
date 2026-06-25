import { formatDiscoveredChords } from './chordDiscoveryFormatter'

describe('chordDiscoveryFormatter', function() {
  test('formats autochord output into chord grid text', function() {
    const formatted = formatDiscoveredChords({
      segments: [
        { start: 0, end: 1.2, label: 'D:maj' },
        { start: 1.2, end: 2.1, label: 'G:maj' },
        { start: 2.1, end: 3.1, label: 'A:maj' },
      ],
      beatTimes: [0, 0.5, 1, 1.5, 2, 2.5, 3, 3.5],
      beatsPerBar: 4,
      slotsPerBeat: 2,
      barsPerLine: 4,
    })

    expect(formatted).toBe('D . . . G . . . | A . . . . . . . |')
  })

  test('maps minor chords and no-chord segments sensibly', function() {
    const formatted = formatDiscoveredChords({
      segments: [
        { start: 0, end: 0.9, label: 'N' },
        { start: 0.9, end: 2.1, label: 'E:min' },
      ],
      beatTimes: [0, 0.5, 1, 1.5],
      beatsPerBar: 4,
      slotsPerBeat: 2,
    })

    expect(formatted).toBe('. . . . Em . . . |')
  })
})
