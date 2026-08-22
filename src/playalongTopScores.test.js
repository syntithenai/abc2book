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

  test('keeps highest score per recording and trims to top ten', function() {
    const rows = []
    for (let i = 0; i < 12; i += 1) {
      rows.push({ recordingId: 'r' + i, pitchPct: i * 5, createdAt: '2026-01-0' + ((i % 9) + 1) })
    }
    rows.push({ recordingId: 'r11', pitchPct: 40 })
    const top = normalizePlayalongTopScores(rows)
    expect(top).toHaveLength(PLAYALONG_TOP_SCORES_MAX)
    expect(top[0].recordingId).toBe('r11')
    expect(top[0].pitchPct).toBe(55)
    expect(top[top.length - 1].pitchPct).toBe(10)
  })

  test('averages the stored top scores', function() {
    expect(averagePlayalongTopScores([])).toBeNull()
    expect(averagePlayalongTopScores([
      { recordingId: 'a', pitchPct: 80 },
      { recordingId: 'b', pitchPct: 90 },
    ])).toBe(85)
  })

  test('recordPlayalongTopScore persists top ten and average', function() {
    for (let i = 0; i < 12; i += 1) {
      recordPlayalongTopScore({
        recordingId: 'take-' + i,
        pitchPct: 50 + i,
        title: 'Tune ' + i,
      })
    }
    const scores = loadPlayalongTopScores()
    expect(scores).toHaveLength(10)
    expect(scores[0].pitchPct).toBe(61)
    expect(scores[9].pitchPct).toBe(52)
    // 52..61 average = 56.5 → 57
    expect(getPlayalongTopScoresAverage()).toBe(57)
    expect(localStorage.getItem(PLAYALONG_TOP_SCORES_STORAGE_KEY)).toContain('take-11')
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
