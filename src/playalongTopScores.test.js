import {
  PLAYALONG_TOP_SCORES_MAX,
  PLAYALONG_TOP_SCORES_STORAGE_KEY,
  averagePlayalongTopScores,
  clearPlayalongTopScores,
  getPlayalongTopScoresAverage,
  loadPlayalongTopScores,
  normalizePlayalongTopScore,
  normalizePlayalongTopScores,
  recordPlayalongTopScore,
  collectPlayalongTopScoresFromTunes,
  resolvePlayalongTopScores,
  summarizePlayalongScoresByTune,
  removePlayalongTopScoresForTune,
  clearPlayalongScorePitchPctFromTunes,
} from './playalongTopScores'

describe('playalongTopScores', function() {
  beforeEach(function() {
    if (typeof localStorage !== 'undefined') localStorage.clear()
  })

  test('normalizes and clamps pitch percent', function() {
    expect(normalizePlayalongTopScore({ recordingId: 'a', pitchPct: 92.4 })).toEqual({
      recordingId: 'a',
      pitchPct: 92,
      createdAt: '',
      title: '',
      tuneId: '',
    })
    expect(normalizePlayalongTopScore({ recordingId: 'a', pitchPct: 140 }).pitchPct).toBe(100)
    expect(normalizePlayalongTopScore({ recordingId: '', pitchPct: 50 })).toBeNull()
    expect(normalizePlayalongTopScore({ recordingId: 'a', pitchPct: 'nope' })).toBeNull()
  })

  test('keeps highest score per recording and trims to max pool', function() {
    const rows = []
    for (let i = 0; i < PLAYALONG_TOP_SCORES_MAX + 2; i += 1) {
      rows.push({
        recordingId: 'r' + i,
        pitchPct: 100 - i,
        createdAt: '2026-01-01T00:00:00.000Z',
      })
    }
    const top = normalizePlayalongTopScores(rows)
    expect(top).toHaveLength(PLAYALONG_TOP_SCORES_MAX)
    expect(top[0]).toEqual(expect.objectContaining({ recordingId: 'r0', pitchPct: 100 }))
    expect(top[top.length - 1].pitchPct).toBe(1)
    expect(top.some(function(row) { return row.recordingId === 'r' + PLAYALONG_TOP_SCORES_MAX })).toBe(false)
  })

  test('averages the stored top scores', function() {
    expect(averagePlayalongTopScores([])).toBeNull()
    expect(averagePlayalongTopScores([
      { recordingId: 'a', pitchPct: 80 },
      { recordingId: 'b', pitchPct: 90 },
    ])).toBe(85)
  })

  test('recordPlayalongTopScore persists up to max pool and average', function() {
    for (let i = 0; i < PLAYALONG_TOP_SCORES_MAX + 2; i += 1) {
      recordPlayalongTopScore({
        recordingId: 'take-' + i,
        pitchPct: 100 - i,
        title: 'Tune ' + i,
      })
    }
    const scores = loadPlayalongTopScores()
    expect(scores).toHaveLength(PLAYALONG_TOP_SCORES_MAX)
    expect(scores[0].pitchPct).toBe(100)
    expect(scores[scores.length - 1].pitchPct).toBe(1)
    expect(getPlayalongTopScoresAverage()).toBe(
      Math.round((scores.reduce(function(sum, row) { return sum + row.pitchPct }, 0)) / scores.length)
    )
    expect(localStorage.getItem(PLAYALONG_TOP_SCORES_STORAGE_KEY)).toContain('take-0')
    expect(localStorage.getItem(PLAYALONG_TOP_SCORES_STORAGE_KEY)).not.toContain(
      'take-' + PLAYALONG_TOP_SCORES_MAX
    )
  })

  test('same recording keeps the higher score', function() {
    recordPlayalongTopScore({ recordingId: 'same', pitchPct: 70, title: 'A' })
    recordPlayalongTopScore({ recordingId: 'same', pitchPct: 65, title: 'A' })
    expect(loadPlayalongTopScores()).toEqual([
      expect.objectContaining({ recordingId: 'same', pitchPct: 70 }),
    ])
    recordPlayalongTopScore({ recordingId: 'same', pitchPct: 88, title: 'A' })
    expect(loadPlayalongTopScores()[0].pitchPct).toBe(88)
  })

  test('clearPlayalongTopScores empties storage', function() {
    recordPlayalongTopScore({ recordingId: 'x', pitchPct: 99 })
    clearPlayalongTopScores()
    expect(loadPlayalongTopScores()).toEqual([])
    expect(getPlayalongTopScoresAverage()).toBeNull()
  })

  test('collectPlayalongTopScoresFromTunes reads pitchPct from take comments', function() {
    const scores = collectPlayalongTopScoresFromTunes({
      t1: {
        name: 'Cooley\'s',
        playalongTakes: [
          { recordingId: 'a', pitchPct: 80, createdAt: '2026-01-01T00:00:00.000Z' },
          { recordingId: 'b', pitchPct: 95, createdAt: '2026-01-02T00:00:00.000Z' },
        ],
      },
      t2: {
        name: 'Kesh',
        playalongTakes: [
          { recordingId: 'c', pitchPct: 70 },
        ],
      },
    })
    expect(scores).toHaveLength(3)
    expect(scores[0]).toEqual(expect.objectContaining({
      recordingId: 'b',
      pitchPct: 95,
      title: "Cooley's",
      tuneId: 't1',
    }))
    expect(resolvePlayalongTopScores({
      t1: { name: 'X', playalongTakes: [{ recordingId: 'z', pitchPct: 88 }] },
    })[0].pitchPct).toBe(88)
  })

  test('summarizePlayalongScoresByTune reports min max average per tune', function() {
    const summary = summarizePlayalongScoresByTune([
      { recordingId: 'a', pitchPct: 80, title: "Cooley's", tuneId: 't1' },
      { recordingId: 'b', pitchPct: 90, title: "Cooley's", tuneId: 't1' },
      { recordingId: 'c', pitchPct: 70, title: 'Kesh', tuneId: 't2' },
      { recordingId: 'd', pitchPct: 100, title: 'Kesh', tuneId: 't2' },
    ])
    expect(summary).toEqual([
      expect.objectContaining({
        tuneId: 't1',
        title: "Cooley's",
        min: 80,
        max: 90,
        average: 85,
        count: 2,
      }),
      expect.objectContaining({
        tuneId: 't2',
        title: 'Kesh',
        min: 70,
        max: 100,
        average: 85,
        count: 2,
      }),
    ])
  })

  test('removePlayalongTopScoresForTune drops only matching tune scores', function() {
    recordPlayalongTopScore({ recordingId: 'a', pitchPct: 80, title: 'A', tuneId: 't1' })
    recordPlayalongTopScore({ recordingId: 'b', pitchPct: 90, title: 'B', tuneId: 't2' })
    const next = removePlayalongTopScoresForTune('t1', 'A')
    expect(next).toEqual([
      expect.objectContaining({ recordingId: 'b', tuneId: 't2' }),
    ])
  })

  test('clearPlayalongScorePitchPctFromTunes strips pitchPct and saves', function() {
    const saved = []
    const tunes = {
      t1: {
        name: 'A',
        playalongTakes: [
          { recordingId: 'a', pitchPct: 80 },
          { recordingId: 'b', pitchPct: 70 },
        ],
      },
      t2: {
        name: 'B',
        playalongTakes: [{ recordingId: 'c', pitchPct: 90 }],
      },
    }
    const count = clearPlayalongScorePitchPctFromTunes(tunes, {
      saveTune: function(tune) { saved.push(tune) },
    }, { tuneId: 't1' })
    expect(count).toBe(1)
    expect(tunes.t1.playalongTakes.every(function(t) { return t.pitchPct == null })).toBe(true)
    expect(tunes.t2.playalongTakes[0].pitchPct).toBe(90)
    expect(saved).toHaveLength(1)
  })
})
