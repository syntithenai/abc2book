import {
  getSkillTempoRange,
  getWarmupOptionsForSkill,
  clampSkillLevel,
  normalizePracticeInstrument,
  getPracticeInstrumentLabel,
  pushRecentInstrument,
  normalizeRecentInstruments,
  resolveVocalRange,
} from './practiceSessionSettings'
import {
  scientificNameToMidi,
  midiToScientificName,
  fitMidiSequenceToRange,
} from './practiceInstrumentProfiles'

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

  it('uses slower warmup tempo for voice', function() {
    const voice = getWarmupOptionsForSkill(5, { instrument: 'voice' })
    const mandolin = getWarmupOptionsForSkill(5, { instrument: 'mandolin' })
    expect(voice.tempo).toBeLessThan(mandolin.tempo)
    expect(voice.noteLength).toBe('1/4')
  })

  it('clamps skill level', function() {
    expect(clampSkillLevel(0)).toBe(1)
    expect(clampSkillLevel(99)).toBe(10)
  })

  it('normalizes practice instrument including banjo', function() {
    expect(normalizePracticeInstrument('fiddle')).toBe('violin')
    expect(normalizePracticeInstrument('Mandolin')).toBe('mandolin')
    expect(normalizePracticeInstrument('banjo')).toBe('banjo')
    expect(getPracticeInstrumentLabel('banjo')).toBe('Banjo - 5 string open G')
    expect(getPracticeInstrumentLabel('violin')).toBe('Violin')
  })

  it('tracks recent instruments excluding current', function() {
    const recent = pushRecentInstrument([], 'mandolin', 'violin')
    expect(recent).toEqual(['mandolin'])
    const next = pushRecentInstrument(recent, 'violin', 'cello')
    expect(next).toEqual(['violin', 'mandolin'])
    const third = pushRecentInstrument(next, 'cello', 'guitar')
    expect(third).toEqual(['cello', 'violin', 'mandolin'])
    const fourth = pushRecentInstrument(third, 'guitar', 'flute')
    expect(fourth).toEqual(['guitar', 'cello', 'violin'])
    expect(normalizeRecentInstruments(fourth, 'guitar')).toEqual(['cello', 'violin'])
  })

  it('resolves vocal range defaults and one-ended ranges', function() {
    expect(resolveVocalRange('', '')).toEqual({
      lowMidi: scientificNameToMidi('G3'),
      highMidi: scientificNameToMidi('G4'),
      lowName: 'G3',
      highName: 'G4',
    })
    const onlyLow = resolveVocalRange('C3', '')
    expect(onlyLow.lowName).toBe('C3')
    expect(onlyLow.highName).toBe('C4')
    const onlyHigh = resolveVocalRange('', 'E4')
    expect(onlyHigh.highName).toBe('E4')
    expect(onlyHigh.lowName).toBe('E3')
  })

  it('loads accuracy checking and vocal range settings', function() {
    const { loadPracticeSettings, savePracticeSettings, DEFAULT_PRACTICE_SETTINGS } = require('./practiceSessionSettings')
    const key = 'bookstorage_practice_settings'
    const prev = localStorage.getItem(key)
    savePracticeSettings(Object.assign({}, DEFAULT_PRACTICE_SETTINGS, {
      accuracyCheckingEnabled: true,
      practiceReferenceGain: 0.15,
      vocalRangeLow: 'A3',
      vocalRangeHigh: 'A4',
      recentInstruments: ['violin', 'cello'],
    }))
    const loaded = loadPracticeSettings()
    expect(loaded.accuracyCheckingEnabled).toBe(true)
    expect(loaded.headphoneMode).toBeUndefined()
    expect(loaded.practiceReferenceGain).toBe(0.15)
    expect(loaded.vocalRangeLow).toBe('A3')
    expect(loaded.vocalRangeHigh).toBe('A4')
    expect(loaded.recentInstruments).toEqual(['violin', 'cello'])
    if (prev == null) localStorage.removeItem(key)
    else localStorage.setItem(key, prev)
  })

  it('mergePracticeSettings ignores undefined fields', function() {
    const { mergePracticeSettings, loadPracticeSettings, DEFAULT_PRACTICE_SETTINGS } = require('./practiceSessionSettings')
    const key = 'bookstorage_practice_settings'
    const prev = localStorage.getItem(key)
    mergePracticeSettings(Object.assign({}, DEFAULT_PRACTICE_SETTINGS, {
      accuracyCheckingEnabled: true,
      vocalRangeLow: 'G3',
    }))
    mergePracticeSettings({
      instrument: 'cello',
      accuracyCheckingEnabled: undefined,
      vocalRangeLow: undefined,
    })
    const loaded = loadPracticeSettings()
    expect(loaded.instrument).toBe('cello')
    expect(loaded.accuracyCheckingEnabled).toBe(true)
    expect(loaded.vocalRangeLow).toBe('G3')
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

  it('maps reference gain through a squared quiet-end slider curve', function() {
    const {
      PRACTICE_REFERENCE_GAIN_MAX,
      referenceGainToSliderPercent,
      sliderPercentToReferenceGain,
      clampReferenceGain,
    } = require('./practiceSessionSettings')
    expect(PRACTICE_REFERENCE_GAIN_MAX).toBe(0.35)
    expect(sliderPercentToReferenceGain(0)).toBe(0)
    expect(sliderPercentToReferenceGain(100)).toBeCloseTo(PRACTICE_REFERENCE_GAIN_MAX, 5)
    expect(sliderPercentToReferenceGain(50)).toBeCloseTo(PRACTICE_REFERENCE_GAIN_MAX * 0.25, 5)
    expect(referenceGainToSliderPercent(PRACTICE_REFERENCE_GAIN_MAX * 0.25)).toBe(50)
    expect(clampReferenceGain(1)).toBe(PRACTICE_REFERENCE_GAIN_MAX)
  })

  it('fits midi sequences into a vocal range', function() {
    const low = scientificNameToMidi('G3')
    const high = scientificNameToMidi('G4')
    const fitted = fitMidiSequenceToRange([48, 60, 72], low, high)
    fitted.forEach(function(m) {
      expect(m).toBeGreaterThanOrEqual(low)
      expect(m).toBeLessThanOrEqual(high)
    })
    expect(midiToScientificName(60)).toBe('C4')
  })

  it('fits by octaves only — never chromatically slides pitch class', function() {
    // C major one-octave (60–72) on violin open high B4 (71): must stay pitch-class C,
    // not slide down a semitone to B.
    const fitted = fitMidiSequenceToRange([60, 62, 64, 65, 67, 69, 71, 72], 55, 71)
    fitted.forEach(function(m, i) {
      const original = [60, 62, 64, 65, 67, 69, 71, 72][i]
      expect(((m % 12) + 12) % 12).toBe(((original % 12) + 12) % 12)
      expect(m).toBeGreaterThanOrEqual(55)
      expect(m).toBeLessThanOrEqual(71)
    })
    expect(fitted[0] % 12).toBe(0) // C
  })
})
