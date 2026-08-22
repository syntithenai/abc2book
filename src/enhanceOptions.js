export const ENHANCE_OPTION_GROUPS = [
  {
    id: 'lookup',
    label: 'Lookup',
    options: [
      { id: 'composer', label: 'Composer' },
      { id: 'artist', label: 'Artist' },
      { id: 'album', label: 'Album' },
      { id: 'genre', label: 'Genre' },
      { id: 'aliases', label: 'Aliases' },
      { id: 'lookupLyrics', label: 'Chords and Lyrics' },
      { id: 'background', label: 'Background info' },
      { id: 'youtube', label: 'Discover playable media links' },
    ],
  },
  {
    id: 'audio',
    label: 'Audio Analysis',
    options: [
      { id: 'playRange', label: 'Play range' },
      { id: 'key', label: 'Key' },
      { id: 'tempo', label: 'Tempo' },
      { id: 'notation', label: 'Notation (from audio)' },
      { id: 'chords', label: 'Chords (from audio)' },
      { id: 'lyrics', label: 'Lyrics (stems then transcribe voice)' },
    ],
  },
]

export const ENHANCE_OPTION_IDS = ENHANCE_OPTION_GROUPS.reduce(function(ids, group) {
  group.options.forEach(function(option) {
    ids.push(option.id)
  })
  return ids
}, [])

export const AUDIO_ENHANCE_OPTION_IDS = [
  'playRange',
  'key',
  'tempo',
  'notation',
  'chords',
  'lyrics',
]

export const LOOKUP_FIELD_KIND_BY_OPTION = {
  artist: 'artists',
  album: 'albums',
  genre: 'genre',
  aliases: 'aliases',
  lookupLyrics: 'lyrics',
}

export const AUDIO_ANALYSIS_KIND_BY_OPTION = {
  key: 'key',
  tempo: 'tempo',
  notation: 'notation',
  chords: 'chords',
  lyrics: 'lyrics',
}

function isAudioEnhanceOption(optionId) {
  return AUDIO_ENHANCE_OPTION_IDS.indexOf(optionId) >= 0
}

export function createEmptyEnhanceSelection() {
  const selection = {}
  ENHANCE_OPTION_IDS.forEach(function(id) {
    selection[id] = false
  })
  return selection
}

export function enhanceGroupOptionIds(groupId) {
  const group = ENHANCE_OPTION_GROUPS.find(function(entry) {
    return entry.id === groupId
  })
  return group ? group.options.map(function(option) { return option.id }) : []
}

export function isEnhanceOptionAvailable(optionId, context) {
  const ctx = context || {}
  const features = ctx.features || {}
  const resolverAvailable = !!ctx.resolverAvailable

  if (isAudioEnhanceOption(optionId) && ctx.hasScannableLinkedMedia === false) {
    return false
  }
  if (optionId === 'notation' || optionId === 'chords') {
    return resolverAvailable && !!features.practiceAnalysis
  }
  if (optionId === 'key' || optionId === 'tempo') {
    return resolverAvailable && !!features.practiceAnalysis
  }
  if (optionId === 'lyrics') {
    return resolverAvailable && !!(features.whisper || features.practiceAnalysis || features.stems)
  }
  if (optionId === 'playRange') {
    return resolverAvailable && !!features.whisper
  }
  if (optionId === 'background') {
    return !!ctx.canResearchBackground
  }
  if (optionId === 'youtube') {
    return resolverAvailable
  }
  if (optionId === 'composer' && ctx.canAffordComposer === false) {
    return false
  }
  return true
}

export function enhanceOptionUnavailableReason(optionId, context) {
  if (isEnhanceOptionAvailable(optionId, context)) return ''
  if (isAudioEnhanceOption(optionId) && context && context.hasScannableLinkedMedia === false) {
    return 'No linked media to analyze'
  }
  if (optionId === 'notation' || optionId === 'chords' || optionId === 'key' || optionId === 'tempo') {
    return 'Audio analysis is not available'
  }
  if (optionId === 'lyrics' || optionId === 'playRange') {
    return 'Audio analysis is not available'
  }
  if (optionId === 'youtube') {
    return 'Resolver is not available'
  }
  if (optionId === 'background') {
    return 'Background research is not available'
  }
  if (optionId === 'composer') {
    return 'Composer discovery is not available'
  }
  return 'Not available'
}

/**
 * Select or clear a group. When selecting and availabilityContext is provided,
 * only available options are turned on.
 */
export function setEnhanceGroupSelection(selection, groupId, checked, availabilityContext) {
  const next = Object.assign({}, selection || createEmptyEnhanceSelection())
  const wantOn = !!checked
  enhanceGroupOptionIds(groupId).forEach(function(id) {
    if (wantOn && availabilityContext
      && !isEnhanceOptionAvailable(id, availabilityContext)) {
      next[id] = false
      return
    }
    next[id] = wantOn
  })
  return next
}

export function selectedEnhanceOptionIds(selection) {
  const current = selection || {}
  return ENHANCE_OPTION_IDS.filter(function(id) {
    return !!current[id]
  })
}

export function filterEnhanceSelectionByAvailability(selection, availabilityContext) {
  const next = Object.assign({}, selection || createEmptyEnhanceSelection())
  if (!availabilityContext) return next
  ENHANCE_OPTION_IDS.forEach(function(id) {
    if (next[id] && !isEnhanceOptionAvailable(id, availabilityContext)) {
      next[id] = false
    }
  })
  return next
}

export function hasAnyEnhanceSelection(selection, availabilityContext) {
  const filtered = availabilityContext
    ? filterEnhanceSelectionByAvailability(selection, availabilityContext)
    : selection
  return selectedEnhanceOptionIds(filtered).length > 0
}

export function mediaAnalysisSuggestionKindsFromSelection(selection) {
  const current = selection || {}
  const kinds = []
  Object.keys(AUDIO_ANALYSIS_KIND_BY_OPTION).forEach(function(optionId) {
    if (current[optionId]) kinds.push(AUDIO_ANALYSIS_KIND_BY_OPTION[optionId])
  })
  return kinds
}
