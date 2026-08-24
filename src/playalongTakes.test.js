import {
  appendPlayalongTake,
  enableNotationInViewMode,
  estimateMusicStartOffsetSeconds,
  handlePlayalongTuneEnded,
  isPlayalongMusicBeat,
  normalizePlayalongTake,
  parsePlayalongTakeComment,
  playalongMusicStartWallClockMs,
  PLAYALONG_MAX_LOOP_TAKES,
  removePlayalongTake,
  resolvePlayalongMusicStartOffsetSeconds,
  refinePlayalongMusicStartOffsetSeconds,
  clearPlayalongTakesPatch,
  renderPlayalongTakesAbc,
  applyPlayalongTakePitchPct,
  clearPlayalongTakePitchPcts,
  shouldContinuePlayalongLoop,
  shouldShowPlayalongRecordButton,
  estimatePlayalongMusicDurationSeconds,
  isPlayalongTakeIncomplete,
  effectivePlayalongMusicOffsetSeconds,
  livePlayalongMusicOffsetSeconds,
  savedPlayalongMusicOffsetSeconds,
  residualPlayalongOutputLatencySeconds,
  playalongDetectorPitchLatencySeconds,
  getPlayalongOutputLatencySeconds,
  isHighPlayalongOutputLatency,
  readAudioContextOutputLatencySeconds,
  PLAYALONG_PITCH_LATENCY_SECONDS,
  PLAYALONG_HIGH_OUTPUT_LATENCY_SECONDS,
} from './playalongTakes'
import { displayFlagsToViewMode, viewModeToDisplayFlags } from './viewModeUtils'
import useAbcTools from './useAbcTools'

describe('playalongTakes', function() {
  test('appendPlayalongTake keeps older takes and adds the newest last', function() {
    const first = appendPlayalongTake([], {
      recordingId: 'a',
      createdAt: '2026-01-01T00:00:00.000Z',
      duration: 4,
      musicStartOffsetSeconds: 2,
      tempoBpm: 120,
    })
    const next = appendPlayalongTake(first, {
      recordingId: 'b',
      duration: 5,
      musicStartOffsetSeconds: 2,
      tempoBpm: 120,
    })
    expect(next.map(function(t) { return t.recordingId })).toEqual(['a', 'b'])
    expect(next[0].duration).toBe(4)
  })

  test('removePlayalongTake drops only the matching id', function() {
    const list = appendPlayalongTake(
      [{ recordingId: 'a' }, { recordingId: 'b' }],
      { recordingId: 'c' }
    )
    expect(removePlayalongTake(list, 'b').map(function(t) { return t.recordingId })).toEqual(['a', 'c'])
  })

  test('clearing playalongTakes drops ABC take comments on round-trip', function() {
    const abcTools = useAbcTools()
    const tune = abcTools.abc2json([
      'X:1',
      'T:Test',
      'M:4/4',
      'L:1/8',
      'K:C',
      'CDEF |',
    ].join('\n'))
    tune.playalongTakes = [{
      recordingId: 'abc123',
      createdAt: '2026-08-18T12:00:00.000Z',
      duration: 9,
      musicStartOffsetSeconds: 2,
      tempoBpm: 100,
    }]
    const withTakes = abcTools.json2abc(tune)
    expect(withTakes).toContain('% abcbook-playalong-take-0')
    const parsed = abcTools.abc2json(withTakes)
    Object.assign(parsed, clearPlayalongTakesPatch(parsed))
    const cleared = abcTools.json2abc(parsed)
    expect(cleared).not.toContain('% abcbook-playalong-take-')
    expect(abcTools.abc2json(cleared).playalongTakes || []).toEqual([])
  })

  test('ABC comments round-trip take metadata', function() {
    const abc = renderPlayalongTakesAbc({
      playalongTakes: [{
        recordingId: 'rec1',
        createdAt: '2026-08-18T00:00:00.000Z',
        duration: 12.5,
        musicStartOffsetSeconds: 2,
        tempoBpm: 100,
      }],
    })
    expect(abc).toContain('% abcbook-playalong-take-0')
    const parsed = parsePlayalongTakeComment(abc.trim().split('\n')[0])
    expect(parsed).toEqual(normalizePlayalongTake({
      recordingId: 'rec1',
      createdAt: '2026-08-18T00:00:00.000Z',
      duration: 12.5,
      musicStartOffsetSeconds: 2,
      tempoBpm: 100,
    }))
  })

  test('estimateMusicStartOffsetSeconds uses one bar of count-in at the tune tempo', function() {
    const seconds = estimateMusicStartOffsetSeconds({
      meter: '4/4',
      tempo: 120,
      playbackMetronomeCountIn: true,
      playbackMetronomeCountInBars: 1,
    }, {
      abcTools: { getTempo: function() { return 120 } },
    }, 1)
    expect(seconds).toBeCloseTo(2, 5)
  })

  test('estimateMusicStartOffsetSeconds is zero when count-in is off', function() {
    expect(estimateMusicStartOffsetSeconds({
      meter: '4/4',
      tempo: 120,
      playbackMetronomeCountIn: false,
    }, { abcTools: { getTempo: function() { return 120 } } }, 1)).toBe(0)
  })

  test('shouldShowPlayalongRecordButton requires MIDI notes and hides on file overlay', function() {
    const tunebook = {
      hasNotes: function(tune) { return !!(tune && tune.hasMelody) },
    }
    expect(shouldShowPlayalongRecordButton({ hasMelody: true }, tunebook, false)).toBe(true)
    expect(shouldShowPlayalongRecordButton({ hasMelody: false }, tunebook, false)).toBe(false)
    expect(shouldShowPlayalongRecordButton({ hasMelody: true }, tunebook, true)).toBe(false)
    expect(shouldShowPlayalongRecordButton({ hasMelody: true }, tunebook, false, { email: 'other@example.com' })).toBe(true)
    expect(shouldShowPlayalongRecordButton({ hasMelody: true }, tunebook, false, null)).toBe(true)
  })

  test('handlePlayalongTuneEnded stops recording and blocks playlist advance', function() {
    const stop = jest.fn()
    expect(handlePlayalongTuneEnded(true, stop)).toBe(true)
    expect(stop).toHaveBeenCalledWith('ended')
    expect(handlePlayalongTuneEnded(false, stop)).toBe(false)
    expect(stop).toHaveBeenCalledTimes(1)
  })

  test('shouldContinuePlayalongLoop repeats on natural end until 10 takes', function() {
    expect(shouldContinuePlayalongLoop('ended', 1, PLAYALONG_MAX_LOOP_TAKES)).toBe(true)
    expect(shouldContinuePlayalongLoop('ended', 9, PLAYALONG_MAX_LOOP_TAKES)).toBe(true)
    expect(shouldContinuePlayalongLoop('ended', 10, PLAYALONG_MAX_LOOP_TAKES)).toBe(false)
    expect(shouldContinuePlayalongLoop('click', 3, PLAYALONG_MAX_LOOP_TAKES)).toBe(false)
  })

  test('shouldContinuePlayalongLoop stops after a single take when maxTakes is 1', function() {
    expect(shouldContinuePlayalongLoop('ended', 1, 1)).toBe(false)
    expect(shouldContinuePlayalongLoop('ended', 0, 1)).toBe(true)
  })

  test('estimatePlayalongMusicDurationSeconds uses the last note end beat', function() {
    const seconds = estimatePlayalongMusicDurationSeconds([
      { midi: 60, startBeat: 0, endBeat: 1 },
      { midi: 62, startBeat: 1, endBeat: 4 },
    ], 120, 1)
    // 4 beats at 120bpm = 2 seconds
    expect(seconds).toBeCloseTo(2, 5)
  })

  test('isPlayalongTakeIncomplete is false on natural MIDI end', function() {
    expect(isPlayalongTakeIncomplete({
      reason: 'ended',
      recordedDurationSeconds: 1,
      musicStartOffsetSeconds: 0,
      expectedMusicDurationSeconds: 8,
    })).toBe(false)
  })

  test('isPlayalongTakeIncomplete is true when stopped early', function() {
    expect(isPlayalongTakeIncomplete({
      reason: 'click',
      recordedDurationSeconds: 3,
      musicStartOffsetSeconds: 1,
      expectedMusicDurationSeconds: 8,
    })).toBe(true)
  })

  test('isPlayalongTakeIncomplete is false when nearly finished', function() {
    expect(isPlayalongTakeIncomplete({
      reason: 'click',
      recordedDurationSeconds: 9.5,
      musicStartOffsetSeconds: 1,
      expectedMusicDurationSeconds: 8,
    })).toBe(false)
  })

  test('enableNotationInViewMode turns notation on without dropping lyrics', function() {
    const next = enableNotationInViewMode(
      'lyricsOnly',
      viewModeToDisplayFlags,
      displayFlagsToViewMode
    )
    const flags = viewModeToDisplayFlags(next)
    expect(flags.notation).toBe('lines')
    expect(flags.lyrics).toBe(true)
  })

  test('json2abc / abc2json round-trip playalongTakes', function() {
    const abcTools = useAbcTools()
    const tune = abcTools.abc2json([
      'X:1',
      'T:Test',
      'M:4/4',
      'L:1/8',
      'K:C',
      'CDEF |',
    ].join('\n'))
    tune.playalongTakes = [{
      recordingId: 'abc123',
      createdAt: '2026-08-18T12:00:00.000Z',
      duration: 9,
      musicStartOffsetSeconds: 2,
      tempoBpm: 100,
    }]
    const exported = abcTools.json2abc(tune)
    expect(exported).toContain('% abcbook-playalong-take-0')
    const parsed = abcTools.abc2json(exported)
    expect(parsed.playalongTakes).toEqual([{
      recordingId: 'abc123',
      createdAt: '2026-08-18T12:00:00.000Z',
      duration: 9,
      musicStartOffsetSeconds: 2,
      tempoBpm: 100,
      outputLatencySeconds: 0,
      onsetAlignSeconds: 0,
      pitchPct: null,
    }])
  })

  test('isPlayalongMusicBeat waits for music-only audioSeconds after count-in', function() {
    expect(isPlayalongMusicBeat({
      musicStartMs: 2400,
      audioSeconds: 0,
    })).toBe(false)
    expect(isPlayalongMusicBeat({
      musicStartMs: 2400,
      audioSeconds: 2e-16,
    })).toBe(false)
    expect(isPlayalongMusicBeat({
      musicStartMs: 2400,
      audioSeconds: 0.05,
    })).toBe(true)
    expect(isPlayalongMusicBeat({
      musicStartMs: 0,
      audioSeconds: 0,
    })).toBe(true)
  })

  test('playalongMusicStartWallClockMs rewinds by music-only audioSeconds', function() {
    expect(playalongMusicStartWallClockMs(5000, {
      audioSeconds: 0.6,
    })).toBeCloseTo(4400, 5)
    expect(playalongMusicStartWallClockMs(5000, {
      audioSeconds: 0,
    })).toBe(5000)
  })

  test('resolvePlayalongMusicStartOffsetSeconds prefers measured beat-0 time', function() {
    expect(resolvePlayalongMusicStartOffsetSeconds({
      samplerStartedAtMs: 1000,
      musicStartedAtMs: 3400,
      estimatedOffsetSeconds: 2.4,
    })).toBeCloseTo(2.4, 5)
    expect(resolvePlayalongMusicStartOffsetSeconds({
      samplerStartedAtMs: 1000,
      playbackStartedAtMs: 1300,
      estimatedOffsetSeconds: 2.4,
    })).toBeCloseTo(2.7, 5)
    expect(resolvePlayalongMusicStartOffsetSeconds({
      samplerStartedAtMs: 12523.6,
      musicStartedAtMs: 12722.3,
      playbackStartedAtMs: 15065.5,
      estimatedOffsetSeconds: 2.4,
    })).toBeCloseTo(2.5419, 3)
    expect(resolvePlayalongMusicStartOffsetSeconds({
      samplerStartedAtMs: 232291.7,
      musicStartedAtMs: 234272.375,
      playbackStartedAtMs: 234563,
      estimatedOffsetSeconds: 2.4,
    })).toBeCloseTo(2.2713, 3)
  })

  test('resolvePlayalongMusicStartOffsetSeconds rejects slightly-early count-in stamps', function() {
    // Cheer Boys-style: measured ~2.20s vs estimate 2.4s made pitch look ~400ms late.
    expect(resolvePlayalongMusicStartOffsetSeconds({
      samplerStartedAtMs: 13604,
      musicStartedAtMs: 13604 + 2198,
      playbackStartedAtMs: 13604 + 2613,
      estimatedOffsetSeconds: 2.4,
    })).toBeCloseTo(2.613, 3)
  })

  test('refinePlayalongMusicStartOffsetSeconds nudges early stamps using first pitch', function() {
    expect(refinePlayalongMusicStartOffsetSeconds(2.198, [
      { timeMs: 2622, rawMidi: 69 },
    ], { firstExpectedMidi: 69 })).toBeCloseTo(2.542, 2)
    expect(refinePlayalongMusicStartOffsetSeconds(2.613, [
      { timeMs: 2680, rawMidi: 69 },
    ], { firstExpectedMidi: 69 })).toBeCloseTo(2.613, 3)
  })

  test('livePlayalongMusicOffsetSeconds omits detector latency used for saved takes', function() {
    expect(livePlayalongMusicOffsetSeconds(2.4)).toBeCloseTo(2.4, 5)
    expect(effectivePlayalongMusicOffsetSeconds(2.4)).toBeCloseTo(
      2.4 + PLAYALONG_PITCH_LATENCY_SECONDS,
      5
    )
    expect(effectivePlayalongMusicOffsetSeconds(2.4, 0)).toBeCloseTo(2.4, 5)
  })

  test('reported output latency increases live and saved mapping offsets', function() {
    const opts = { outputLatencySeconds: 0.2 }
    expect(livePlayalongMusicOffsetSeconds(2.4, opts)).toBeCloseTo(2.6, 5)
    expect(savedPlayalongMusicOffsetSeconds(2.4, opts)).toBeCloseTo(2.6, 5)
    expect(effectivePlayalongMusicOffsetSeconds(
      savedPlayalongMusicOffsetSeconds(2.4, opts)
    )).toBeCloseTo(2.6 + PLAYALONG_PITCH_LATENCY_SECONDS, 5)
    expect(livePlayalongMusicOffsetSeconds(2.4, opts)).toBeLessThan(
      effectivePlayalongMusicOffsetSeconds(savedPlayalongMusicOffsetSeconds(2.4, opts))
    )
  })

  test('residual output latency skips latency already applied to the timeline', function() {
    expect(residualPlayalongOutputLatencySeconds({
      outputLatencySeconds: 0.25,
      outputLatencyAlreadyInTimeline: true,
      outputLatencyAppliedSeconds: 0.1,
    })).toBeCloseTo(0.15, 5)
    expect(residualPlayalongOutputLatencySeconds({
      outputLatencySeconds: 0.25,
      outputLatencyAlreadyInTimeline: true,
    })).toBe(0)
    expect(livePlayalongMusicOffsetSeconds(2.0, {
      outputLatencySeconds: 0.25,
      outputLatencyAlreadyInTimeline: true,
      outputLatencyAppliedSeconds: 0.25,
    })).toBeCloseTo(2.0, 5)
  })

  test('getPlayalongOutputLatencySeconds reads AudioContext device latency', function() {
    expect(readAudioContextOutputLatencySeconds({
      outputLatency: 0.18,
      baseLatency: 0.02,
    })).toBeCloseTo(0.2, 5)
    expect(getPlayalongOutputLatencySeconds({
      audioContext: { outputLatency: 0.15, baseLatency: 0.01 },
      pitchShifter: { getOutputLatencySec: function() { return 0.05 } },
    })).toBeCloseTo(0.21, 5)
    expect(isHighPlayalongOutputLatency(PLAYALONG_HIGH_OUTPUT_LATENCY_SECONDS)).toBe(true)
    expect(isHighPlayalongOutputLatency(0.02)).toBe(false)
  })

  test('playalongDetectorPitchLatencySeconds skips pad after onset align', function() {
    expect(playalongDetectorPitchLatencySeconds({
      onsetAlignSeconds: 0.12,
    })).toBe(0)
    expect(playalongDetectorPitchLatencySeconds({
      outputLatencySeconds: 0.28,
    })).toBeCloseTo(0.06, 5)
    expect(playalongDetectorPitchLatencySeconds({})).toBe(PLAYALONG_PITCH_LATENCY_SECONDS)
  })

  test('ABC comments round-trip pitchPct on takes', function() {
    const abc = renderPlayalongTakesAbc({
      playalongTakes: [{
        recordingId: 'rec1',
        createdAt: '2026-08-18T00:00:00.000Z',
        duration: 12.5,
        musicStartOffsetSeconds: 2,
        tempoBpm: 100,
        pitchPct: 91,
      }],
    })
    expect(abc).toContain('"pitchPct":91')
    const parsed = parsePlayalongTakeComment(abc.trim().split('\n')[0])
    expect(parsed.pitchPct).toBe(91)
  })

  test('applyPlayalongTakePitchPct keeps the higher score', function() {
    const list = [{ recordingId: 'a', pitchPct: 70 }]
    const lower = applyPlayalongTakePitchPct(list, 'a', 60)
    expect(lower.changed).toBe(false)
    expect(lower.takes[0].pitchPct).toBe(70)
    const higher = applyPlayalongTakePitchPct(list, 'a', 85)
    expect(higher.changed).toBe(true)
    expect(higher.takes[0].pitchPct).toBe(85)
  })

  test('clearPlayalongTakePitchPcts strips scores from takes', function() {
    const cleared = clearPlayalongTakePitchPcts([
      { recordingId: 'a', pitchPct: 80 },
      { recordingId: 'b' },
    ])
    expect(cleared.changed).toBe(true)
    expect(cleared.takes[0].pitchPct).toBeNull()
    expect(cleared.takes[1].pitchPct).toBeNull()
    expect(clearPlayalongTakePitchPcts([{ recordingId: 'c' }]).changed).toBe(false)
  })
})
