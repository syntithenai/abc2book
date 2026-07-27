import {
  createRhythmTimingDiagnostics,
  recordRhythmSlotEvent,
  resetRhythmTimingDiagnostics,
  buildRhythmDiagnosticsSnapshot,
} from './rhythmTimingDiagnostics'

describe('rhythmTimingDiagnostics', function() {
  test('records slot events in ring buffer', function() {
    const diag = createRhythmTimingDiagnostics()
    recordRhythmSlotEvent(diag, {
      slotInBar: 0,
      audioTime: 1,
      musicSeconds: 0,
      phase: 'playing',
    })
    expect(diag.ring.length).toBe(1)
    expect(diag.ring[0].slotInBar).toBe(0)
  })

  test('buildRhythmDiagnosticsSnapshot includes spacing and engine fields', function() {
    const snap = buildRhythmDiagnosticsSnapshot({
      phase: 'playing',
      tempo: 120,
      tempoFactor: 1.173,
      rhythmBeatsPerBar: 4,
      musicSeconds: 0.5,
      rhythmGridQpm: 120,
      playbackQpm: 240,
      duringPlayback: true,
      isMidiPlaying: true,
      timingCallbacksRunning: true,
      midiEngineMode: 'soundtouch',
      downbeatAudioTime: 44,
      musicStartAudioTime: 44,
      ring: [
        { slotInBar: 0, audioTime: 44, expectedAudioTime: 44, spacingErrorMs: 0 },
        { slotInBar: 1, audioTime: 44.51, expectedAudioTime: 44.5, spacingErrorMs: 10 },
      ],
    })
    expect(snap.rhythmGridQpm).toBe(120)
    expect(snap.playbackQpm).toBe(240)
    expect(snap.tempoFactor).toBe(1.173)
    expect(snap.midiEngineMode).toBe('soundtouch')
    expect(snap.downbeatAudioTime).toBe(44)
    expect(snap.maxSpacingErrorMs).toBe(10)
    expect(snap.lastScheduledSlots[1].spacingErrorMs).toBe(10)
  })

  test('reset clears ring and count-in tally', function() {
    const diag = createRhythmTimingDiagnostics()
    recordRhythmSlotEvent(diag, { slotInBar: 0, phase: 'countIn' })
    resetRhythmTimingDiagnostics(diag)
    expect(diag.ring.length).toBe(0)
    expect(diag.countInSlotsEmitted).toBe(0)
  })

  test('entryGap phase increments count-in tally', function() {
    const diag = createRhythmTimingDiagnostics()
    recordRhythmSlotEvent(diag, { slotInBar: 0, phase: 'entryGap' })
    expect(diag.countInSlotsEmitted).toBe(1)
  })

  test('secPerSlot uses rhythmGridQpm when provided', function() {
    const rhythm = { beatsPerBar: 2, pulsesPerBeat: [1, 1], accents: [2, 1] }
    const snap = buildRhythmDiagnosticsSnapshot({
      tempo: 120,
      rhythmGridQpm: 100,
      rhythm: rhythm,
    })
    expect(snap.secPerSlot).toBeCloseTo(0.6, 4)
  })
})
