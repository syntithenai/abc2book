import {
  advanceBulkPlayalongSession,
  applyPlayalongTempoMultiplier,
  clearBulkPlayalongSession,
  clampPlayalongTempoMultiplier,
  createBulkPlayalongSession,
  estimateBulkPlayalongRecordingSeconds,
  formatApproximatePlayalongDuration,
  getBulkPlayalongProgress,
  getBulkPlayalongSession,
  isBulkPlayalongCurrentTune,
} from './bulkPlayalongSession'

describe('bulkPlayalongSession', function() {
  beforeEach(function() {
    clearBulkPlayalongSession()
  })

  test('createBulkPlayalongSession stores tune order and settings', function() {
    const session = createBulkPlayalongSession({
      tuneIds: ['a', 'b', 'c'],
      tempoMultiplier: 0.75,
      settings: { repeats: 2 },
    })
    expect(session.tuneIds).toEqual(['a', 'b', 'c'])
    expect(session.tempoMultiplier).toBe(0.75)
    expect(getBulkPlayalongSession()).toEqual(session)
    expect(isBulkPlayalongCurrentTune('a')).toBe(true)
    expect(isBulkPlayalongCurrentTune('b')).toBe(false)
    expect(getBulkPlayalongProgress()).toEqual({ current: 1, total: 3 })
  })

  test('advanceBulkPlayalongSession walks tunes and clears when done', function() {
    createBulkPlayalongSession({ tuneIds: ['a', 'b'] })
    expect(advanceBulkPlayalongSession()).toEqual({
      done: false,
      nextTuneId: 'b',
      progress: { current: 2, total: 2 },
    })
    expect(isBulkPlayalongCurrentTune('b')).toBe(true)
    expect(advanceBulkPlayalongSession()).toEqual({
      done: true,
      completed: 2,
    })
    expect(getBulkPlayalongSession()).toBeNull()
  })

  test('estimateBulkPlayalongRecordingSeconds multiplies music length by repeats', function() {
    const tunebook = {
      abcTools: {
        getTempo: function() { return 120 },
      },
    }
    const tunes = [
      {
        id: 't1',
        meter: '4/4',
        key: 'C',
        voices: { '1': { notes: ['C2 D2|E2 F2|'] } },
      },
      {
        id: 't2',
        meter: '4/4',
        key: 'C',
        voices: { '1': { notes: ['G4|'] } },
      },
    ]
    const onePass = estimateBulkPlayalongRecordingSeconds(tunes, tunebook, { repeats: 1 })
    const twoPass = estimateBulkPlayalongRecordingSeconds(tunes, tunebook, { repeats: 2 })
    expect(onePass).toBeGreaterThan(0)
    expect(twoPass).toBeCloseTo(onePass * 2, 5)
  })

  test('estimateBulkPlayalongRecordingSeconds scales with tempo multiplier', function() {
    const tunebook = {
      abcTools: {
        getTempo: function() { return 120 },
      },
    }
    const tunes = [
      {
        id: 't1',
        meter: '4/4',
        key: 'C',
        voices: { '1': { notes: ['C2 D2|E2 F2|'] } },
      },
    ]
    const normal = estimateBulkPlayalongRecordingSeconds(tunes, tunebook, {
      repeats: 1,
      tempoMultiplier: 1,
    })
    const half = estimateBulkPlayalongRecordingSeconds(tunes, tunebook, {
      repeats: 1,
      tempoMultiplier: 0.5,
    })
    expect(half).toBeCloseTo(normal * 2, 5)
  })

  test('applyPlayalongTempoMultiplier scales written tempo', function() {
    expect(applyPlayalongTempoMultiplier(120, 0.5)).toBe(60)
    expect(applyPlayalongTempoMultiplier(100, 1.5)).toBe(150)
    expect(clampPlayalongTempoMultiplier(3)).toBe(2)
    expect(clampPlayalongTempoMultiplier(0)).toBe(1)
  })

  test('formatApproximatePlayalongDuration uses minutes for longer totals', function() {
    expect(formatApproximatePlayalongDuration(45)).toMatch(/45 second/)
    expect(formatApproximatePlayalongDuration(180)).toMatch(/3 minute/)
  })
})
