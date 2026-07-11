import { getSkillTempoRange, getWarmupOptionsForSkill, clampSkillLevel, normalizePracticeInstrument, getPracticeInstrumentLabel } from './practiceSessionSettings'

describe('practiceSessionSettings', function() {
  it('maps each skill level to the configured tempo range', function() {
    const expected = [
      { tempoStart: 0.35, tempoEnd: 0.50 },
      { tempoStart: 0.40, tempoEnd: 0.55 },
      { tempoStart: 0.40, tempoEnd: 0.60 },
      { tempoStart: 0.40, tempoEnd: 0.65 },
      { tempoStart: 0.50, tempoEnd: 0.70 },
      { tempoStart: 0.50, tempoEnd: 0.75 },
      { tempoStart: 0.55, tempoEnd: 0.80 },
      { tempoStart: 0.55, tempoEnd: 0.85 },
      { tempoStart: 0.80, tempoEnd: 0.95 },
      { tempoStart: 1.00, tempoEnd: 1.00 },
    ]
    expected.forEach(function(range, index) {
      expect(getSkillTempoRange(index + 1)).toEqual(range)
    })
  })

  it('clamps out-of-range skill levels', function() {
    expect(getSkillTempoRange(0)).toEqual({ tempoStart: 0.35, tempoEnd: 0.50 })
    expect(getSkillTempoRange(99)).toEqual({ tempoStart: 1.00, tempoEnd: 1.00 })
  })

  it('provides easier warmups at low skill', function() {
    const low = getWarmupOptionsForSkill(1, { key: 'D' })
    const high = getWarmupOptionsForSkill(10, { key: 'D' })
    expect(low.tempo).toBeLessThan(high.tempo)
    expect(low.noteLength).toBe('1/4')
  })

  it('clamps skill level', function() {
    expect(clampSkillLevel(0)).toBe(1)
    expect(clampSkillLevel(99)).toBe(10)
  })

  it('normalizes practice instrument', function() {
    expect(normalizePracticeInstrument('fiddle')).toBe('violin')
    expect(normalizePracticeInstrument('Mandolin')).toBe('mandolin')
    expect(normalizePracticeInstrument('banjo')).toBe('mandolin')
    expect(getPracticeInstrumentLabel('violin')).toBe('Violin')
  })

  it('loads accuracy checking settings', function() {
    const { loadPracticeSettings, savePracticeSettings, DEFAULT_PRACTICE_SETTINGS } = require('./practiceSessionSettings')
    const key = 'bookstorage_practice_settings'
    const prev = localStorage.getItem(key)
    savePracticeSettings(Object.assign({}, DEFAULT_PRACTICE_SETTINGS, {
      accuracyCheckingEnabled: true,
      headphoneMode: true,
      practiceReferenceGain: 0.15,
    }))
    const loaded = loadPracticeSettings()
    expect(loaded.accuracyCheckingEnabled).toBe(true)
    expect(loaded.headphoneMode).toBe(true)
    expect(loaded.practiceReferenceGain).toBe(0.15)
    if (prev == null) localStorage.removeItem(key)
    else localStorage.setItem(key, prev)
  })

  it('mergePracticeSettings ignores undefined fields', function() {
    const { mergePracticeSettings, loadPracticeSettings, DEFAULT_PRACTICE_SETTINGS } = require('./practiceSessionSettings')
    const key = 'bookstorage_practice_settings'
    const prev = localStorage.getItem(key)
    mergePracticeSettings(Object.assign({}, DEFAULT_PRACTICE_SETTINGS, {
      accuracyCheckingEnabled: true,
      headphoneMode: true,
    }))
    mergePracticeSettings({
      instrument: 'cello',
      accuracyCheckingEnabled: undefined,
      headphoneMode: undefined,
    })
    const loaded = loadPracticeSettings()
    expect(loaded.instrument).toBe('cello')
    expect(loaded.accuracyCheckingEnabled).toBe(true)
    expect(loaded.headphoneMode).toBe(true)
    if (prev == null) localStorage.removeItem(key)
    else localStorage.setItem(key, prev)
  })

  it('startSession-style partial save must not wipe accuracy via merge', function() {
    const { mergePracticeSettings, loadPracticeSettings, DEFAULT_PRACTICE_SETTINGS } = require('./practiceSessionSettings')
    const key = 'bookstorage_practice_settings'
    const prev = localStorage.getItem(key)
    mergePracticeSettings(Object.assign({}, DEFAULT_PRACTICE_SETTINGS, {
      accuracyCheckingEnabled: true,
    }))
    // Mimic startSession writing core fields only
    mergePracticeSettings({
      instrument: 'violin',
      totalMinutes: 10,
      includeWarmups: true,
      skillLevel: 5,
    })
    expect(loadPracticeSettings().accuracyCheckingEnabled).toBe(true)
    if (prev == null) localStorage.removeItem(key)
    else localStorage.setItem(key, prev)
  })
})
