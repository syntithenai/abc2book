import {
  ENHANCE_OPTION_GROUPS,
  createEmptyEnhanceSelection,
  enhanceGroupOptionIds,
  hasAnyEnhanceSelection,
  isEnhanceOptionAvailable,
  mediaAnalysisSuggestionKindsFromSelection,
  setEnhanceGroupSelection,
} from './enhanceOptions'

describe('enhanceOptions', function() {
  test('defaults to none selected', function() {
    const selection = createEmptyEnhanceSelection()
    expect(hasAnyEnhanceSelection(selection)).toBe(false)
    ENHANCE_OPTION_GROUPS.forEach(function(group) {
      group.options.forEach(function(option) {
        expect(selection[option.id]).toBe(false)
      })
    })
  })

  test('select all/none applies to a group', function() {
    let selection = createEmptyEnhanceSelection()
    selection = setEnhanceGroupSelection(selection, 'lookup', true)
    enhanceGroupOptionIds('lookup').forEach(function(id) {
      expect(selection[id]).toBe(true)
    })
    expect(selection.background).toBe(false)
    selection = setEnhanceGroupSelection(selection, 'lookup', false)
    enhanceGroupOptionIds('lookup').forEach(function(id) {
      expect(selection[id]).toBe(false)
    })
  })

  test('select all applies to every option in a group', function() {
    const selection = setEnhanceGroupSelection(
      createEmptyEnhanceSelection(),
      'audio',
      true
    )
    expect(selection.playRange).toBe(true)
    expect(selection.key).toBe(true)
    expect(selection.lyrics).toBe(true)
    expect(selection.notation).toBe(true)
    expect(selection.chords).toBe(true)
  })

  test('notation and chords need OMR or audio analysis', function() {
    expect(isEnhanceOptionAvailable('notation', {
      resolverAvailable: true,
      features: { sheetImageOmr: true },
    })).toBe(true)
    expect(isEnhanceOptionAvailable('chords', {
      resolverAvailable: true,
      features: { practiceAnalysis: true },
    })).toBe(true)
    expect(isEnhanceOptionAvailable('notation', {
      resolverAvailable: true,
      features: {},
    })).toBe(false)
  })

  test('mediaAnalysisSuggestionKindsFromSelection maps ticked audio options', function() {
    expect(mediaAnalysisSuggestionKindsFromSelection({
      key: true,
      lyrics: true,
      playRange: true,
    })).toEqual(['key', 'lyrics'])
  })
})
