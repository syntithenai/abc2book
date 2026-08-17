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
    ],
  },
  {
    id: 'research',
    label: 'Research',
    options: [
      { id: 'background', label: 'Background info' },
    ],
  },
  {
    id: 'media',
    label: 'Media',
    options: [
      {
        id: 'youtube',
        label: 'Search YouTube for a match if links is empty',
      },
    ],
  },
  {
    id: 'audio',
    label: 'Audio Analysis',
    options: [
      { id: 'playRange', label: 'Play range' },
      { id: 'key', label: 'Key' },
      { id: 'notation', label: 'Notation (if OMR available)' },
      { id: 'chords', label: 'Chords (if OMR available)' },
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

export const LOOKUP_FIELD_KIND_BY_OPTION = {
  artist: 'artists',
  album: 'albums',
  genre: 'genre',
  aliases: 'aliases',
}

export const AUDIO_ANALYSIS_KIND_BY_OPTION = {
  key: 'key',
  notation: 'notation',
  chords: 'chords',
  lyrics: 'lyrics',
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

  if (optionId === 'notation' || optionId === 'chords') {
    return resolverAvailable && !!(features.sheetImageOmr || features.practiceAnalysis)
  }
  if (optionId === 'key') {
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
  return true
}

export function enhanceOptionUnavailableReason(optionId, context) {
  if (isEnhanceOptionAvailable(optionId, context)) return ''
  if (optionId === 'notation' || optionId === 'chords') {
    return 'OMR is not available'
  }
  if (optionId === 'key' || optionId === 'lyrics' || optionId === 'playRange' || optionId === 'youtube') {
    return 'Audio analysis is not available'
  }
  if (optionId === 'background') {
    return 'Background research is not available'
  }
  return 'Not available'
}

export function setEnhanceGroupSelection(selection, groupId, checked) {
  const next = Object.assign({}, selection || createEmptyEnhanceSelection())
  enhanceGroupOptionIds(groupId).forEach(function(id) {
    next[id] = !!checked
  })
  return next
}

export function selectedEnhanceOptionIds(selection) {
  const current = selection || {}
  return ENHANCE_OPTION_IDS.filter(function(id) {
    return !!current[id]
  })
}

export function hasAnyEnhanceSelection(selection) {
  return selectedEnhanceOptionIds(selection).length > 0
}

export function mediaAnalysisSuggestionKindsFromSelection(selection) {
  const current = selection || {}
  const kinds = []
  Object.keys(AUDIO_ANALYSIS_KIND_BY_OPTION).forEach(function(optionId) {
    if (current[optionId]) kinds.push(AUDIO_ANALYSIS_KIND_BY_OPTION[optionId])
  })
  return kinds
}
