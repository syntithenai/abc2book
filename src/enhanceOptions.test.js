import {
  ENHANCE_OPTION_GROUPS,
  createEmptyEnhanceSelection,
  enhanceGroupOptionIds,
  enhanceOptionUnavailableReason,
  filterEnhanceSelectionByAvailability,
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
    expect(selection.background).toBe(true)
    expect(selection.youtube).toBe(true)
    expect(selection.playRange).toBe(false)
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
    expect(selection.tempo).toBe(true)
    expect(selection.lyrics).toBe(true)
    expect(selection.notation).toBe(true)
    expect(selection.chords).toBe(true)
  })

  test('select all with availability context only enables available options', function() {
    const selection = setEnhanceGroupSelection(
      createEmptyEnhanceSelection(),
      'audio',
      true,
      { resolverAvailable: true, features: { whisper: true } }
    )
    expect(selection.playRange).toBe(true)
    expect(selection.key).toBe(false)
    expect(selection.tempo).toBe(false)
    expect(selection.notation).toBe(false)
    expect(selection.chords).toBe(false)
    expect(selection.lyrics).toBe(true)
  })

  test('notation and chords need practice analysis', function() {
    expect(isEnhanceOptionAvailable('notation', {
      resolverAvailable: true,
      features: { sheetImageOmr: true },
    })).toBe(false)
    expect(isEnhanceOptionAvailable('chords', {
      resolverAvailable: true,
      features: { practiceAnalysis: true },
    })).toBe(true)
    expect(isEnhanceOptionAvailable('notation', {
      resolverAvailable: true,
      features: {},
    })).toBe(false)
  })

  test('tempo needs practice analysis like key', function() {
    expect(isEnhanceOptionAvailable('tempo', {
      resolverAvailable: true,
      features: { practiceAnalysis: true },
    })).toBe(true)
    expect(isEnhanceOptionAvailable('tempo', {
      resolverAvailable: true,
      features: {},
    })).toBe(false)
  })

  test('youtube unavailable reason is resolver-specific', function() {
    expect(enhanceOptionUnavailableReason('youtube', {
      resolverAvailable: false,
      features: {},
    })).toBe('Resolver is not available')
    expect(enhanceOptionUnavailableReason('key', {
      resolverAvailable: true,
      features: {},
    })).toBe('Audio analysis is not available')
  })

  test('filterEnhanceSelectionByAvailability clears unavailable ticks', function() {
    const selection = createEmptyEnhanceSelection()
    selection.key = true
    selection.artist = true
    selection.youtube = true
    const filtered = filterEnhanceSelectionByAvailability(selection, {
      resolverAvailable: false,
      features: {},
    })
    expect(filtered.key).toBe(false)
    expect(filtered.youtube).toBe(false)
    expect(filtered.artist).toBe(true)
  })

  test('mediaAnalysisSuggestionKindsFromSelection maps ticked audio options', function() {
    expect(mediaAnalysisSuggestionKindsFromSelection({
      key: true,
      tempo: true,
      lyrics: true,
      playRange: true,
    })).toEqual(['key', 'tempo', 'lyrics'])
  })

  test('audio notation and chords labels describe audio analysis', function() {
    const audio = ENHANCE_OPTION_GROUPS.find(function(group) { return group.id === 'audio' })
    const notation = audio.options.find(function(option) { return option.id === 'notation' })
    const chords = audio.options.find(function(option) { return option.id === 'chords' })
    expect(notation.label).toContain('from audio')
    expect(chords.label).toContain('from audio')
  })

  test('lookup Lyrics option is labeled Chords and Lyrics', function() {
    const lookup = ENHANCE_OPTION_GROUPS.find(function(group) { return group.id === 'lookup' })
    const lyrics = lookup.options.find(function(option) { return option.id === 'lookupLyrics' })
    expect(lyrics.label).toBe('Chords and Lyrics')
  })

  test('audio options require scannable linked media when gated', function() {
    expect(isEnhanceOptionAvailable('key', {
      resolverAvailable: true,
      features: { practiceAnalysis: true },
      hasScannableLinkedMedia: false,
    })).toBe(false)
    expect(enhanceOptionUnavailableReason('key', {
      resolverAvailable: true,
      features: { practiceAnalysis: true },
      hasScannableLinkedMedia: false,
    })).toMatch(/No linked media/)
    expect(isEnhanceOptionAvailable('key', {
      resolverAvailable: true,
      features: { practiceAnalysis: true },
      hasScannableLinkedMedia: true,
    })).toBe(true)
  })

  test('lookup includes background and discover-media options', function() {
    const lookup = ENHANCE_OPTION_GROUPS.find(function(group) { return group.id === 'lookup' })
    expect(lookup.options.some(function(option) { return option.id === 'background' })).toBe(true)
    const youtube = lookup.options.find(function(option) { return option.id === 'youtube' })
    expect(youtube.label).toBe('Discover playable media links')
    expect(ENHANCE_OPTION_GROUPS.some(function(group) { return group.id === 'research' })).toBe(false)
    expect(ENHANCE_OPTION_GROUPS.some(function(group) { return group.id === 'media' })).toBe(false)
  })

})
