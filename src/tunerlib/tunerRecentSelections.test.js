import {
  readRecentTunerSelections,
  pushRecentTunerSelection,
  formatRecentTunerSelectionLabel,
  tunerSelectionKey,
  MAX_RECENT_TUNER_SELECTIONS,
  LS_RECENT_TUNER_SELECTIONS
} from './tunerRecentSelections'

describe('tunerRecentSelections', function() {
  beforeEach(function() {
    localStorage.removeItem(LS_RECENT_TUNER_SELECTIONS)
  })

  test('pushRecentTunerSelection stores instrument and tuning label', function() {
    const list = pushRecentTunerSelection('violin', 'gdae')
    expect(list).toHaveLength(1)
    expect(list[0]).toEqual({ instrument: 'violin', presetId: 'gdae' })
    expect(formatRecentTunerSelectionLabel(list[0])).toBe('Violin · GDAE (standard)')
  })

  test('pushRecentTunerSelection moves duplicates to front and caps at five', function() {
    pushRecentTunerSelection('violin', 'gdae')
    pushRecentTunerSelection('guitar', 'standard')
    pushRecentTunerSelection('cello', 'cgda')
    pushRecentTunerSelection('viola', 'cgda')
    pushRecentTunerSelection('bass', 'eadg')
    pushRecentTunerSelection('uke', 'gceaHighG')
    const list = pushRecentTunerSelection('violin', 'gdae')
    expect(list).toHaveLength(MAX_RECENT_TUNER_SELECTIONS)
    expect(list[0]).toEqual({ instrument: 'violin', presetId: 'gdae' })
    expect(list[1]).toEqual({ instrument: 'uke', presetId: 'gceaHighG' })
    expect(list.filter(function(entry) {
      return entry.instrument === 'violin'
    })).toHaveLength(1)
  })

  test('chromatic selections omit tuning in label', function() {
    const entry = pushRecentTunerSelection('chromatic', '')[0]
    expect(entry).toEqual({ instrument: 'chromatic', presetId: '' })
    expect(formatRecentTunerSelectionLabel(entry)).toBe('Chromatic')
  })

  test('readRecentTunerSelections ignores invalid stored entries', function() {
    localStorage.setItem(LS_RECENT_TUNER_SELECTIONS, JSON.stringify([
      { instrument: 'violin', presetId: 'gdae' },
      { instrument: 'nope', presetId: 'x' }
    ]))
    expect(readRecentTunerSelections()).toEqual([{ instrument: 'violin', presetId: 'gdae' }])
  })

  test('tunerSelectionKey is stable for lookup', function() {
    expect(tunerSelectionKey('guitar', 'standard')).toBe('guitar\0standard')
    expect(tunerSelectionKey('chromatic', '')).toBe('chromatic\0')
  })
})
