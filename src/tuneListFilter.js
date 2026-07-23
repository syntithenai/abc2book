export const LIST_PROTECTION_LIMIT = 500
export const PREVIEW_LIST_LIMIT = 150
export const FILTER_STATUS_CHUNK_SIZE = 50
export const LARGE_LIST_WARNING_THRESHOLD = 1000

export function yieldToMain() {
  return new Promise(function(resolve) {
    setTimeout(resolve, 0)
  })
}

function compareTuneNames(a, b) {
  const nameA = a && a.name ? a.name.toLowerCase().trim() : ''
  const nameB = b && b.name ? b.name.toLowerCase().trim() : ''
  return nameA < nameB ? -1 : 1
}

export function filterTunes(tunes, filterSearchFn) {
  if (!tunes || typeof tunes !== 'object') return []
  const seen = {}
  const result = []
  Object.values(tunes).forEach(function(tune) {
    if (!tune || tune.id == null) return
    if (seen[tune.id]) return
    seen[tune.id] = true
    if (filterSearchFn(tune)) result.push(tune)
  })
  return result
}

export function dedupeTunesById(tunes) {
  return filterTunes(
    Array.isArray(tunes)
      ? tunes.reduce(function(acc, tune) {
        if (tune && tune.id != null) acc[tune.id] = tune
        return acc
      }, {})
      : (tunes || {}),
    function() { return true }
  )
}

export function sortTunesByName(tunes) {
  const list = Array.isArray(tunes) ? tunes.slice() : []
  list.sort(compareTuneNames)
  return list
}

export function filterSearchNoBooks(tune) {
  if ((tune && Array.isArray(tune.books) && tune.books.length > 0)
    || (tune && Array.isArray(tune.tags) && tune.tags.length > 0)) {
    return false
  }
  return true
}

function scanTuneNoteStatus(tune) {
  var hasNotes = false
  var hasChords = false
  if (tune && tune.voices) {
    Object.values(tune.voices).forEach(function(voice) {
      if (!Array.isArray(voice.notes)) return
      for (var i = 0; i < voice.notes.length; i += 1) {
        if (!voice.notes[i]) continue
        if (voice.notes[i].replaceAll('z', '').replaceAll('|', '').split('"').filter(function(a, ak) {
          return (ak % 2 === 0)
        }).join('').trim().length > 0) {
          hasNotes = true
        }
        if (voice.notes[i].indexOf('"') !== -1) {
          hasChords = true
        }
        if (hasNotes && hasChords) break
      }
    })
  }
  return { hasNotes: hasNotes, hasChords: hasChords }
}

export function buildTuneStatusEntry(tune, tunebook) {
  if (!tune || !tune.id) return null
  const noteStatus = scanTuneNoteStatus(tune)
  const hasLyrics = tunebook && typeof tunebook.hasLyrics === 'function' ? tunebook.hasLyrics(tune) : false
  const hasLinks = tunebook && typeof tunebook.hasLinks === 'function' ? tunebook.hasLinks(tune) : false
  return {
    hasLyrics: hasLyrics,
    hasNotes: noteStatus.hasNotes,
    hasChords: noteStatus.hasChords,
    hasLinks: hasLinks,
  }
}

export function buildTagCollation(filteredTunes) {
  const tc = {}
  ;(filteredTunes || []).forEach(function(tune) {
    if (!Array.isArray(tune.tags)) return
    tune.tags.forEach(function(tag) {
      tc[tag] = true
    })
  })
  return tc
}

export function buildTuneStatusGroups(filteredTunes, tuneStatus) {
  const tuneStatusGroups = {}
  ;(filteredTunes || []).forEach(function(tune, tuneKey) {
    if (!tune || !tune.id) return
    const status = tuneStatus[tune.id] || {}
    const tuneStatusKey = []
    if (status.hasLyrics) tuneStatusKey.push('lyrics')
    if (status.hasNotes) tuneStatusKey.push('notes')
    if (status.hasChords) tuneStatusKey.push('chords')
    if (status.hasLinks) tuneStatusKey.push('media')
    const key = tuneStatusKey.join(',')
    if (!tuneStatusGroups.hasOwnProperty(key)) tuneStatusGroups[key] = []
    tuneStatusGroups[key].push(tuneKey)
  })
  return tuneStatusGroups
}

export function buildGroupedTunes(filteredTunes, groupBy, tunebook, tuneStatus) {
  if (!groupBy || !Array.isArray(filteredTunes) || filteredTunes.length >= LIST_PROTECTION_LIMIT * 5) {
    return null
  }
  if (groupBy === 'tuneStatus') {
    return buildTuneStatusGroups(filteredTunes, tuneStatus)
  }
  if (tunebook && typeof tunebook.groupTunes === 'function') {
    return tunebook.groupTunes(filteredTunes, groupBy)
  }
  return null
}

export async function buildTuneStatusMetadata(filteredTunes, tunebook, options) {
  const opts = options || {}
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : function() { return false }
  const chunkSize = opts.chunkSize > 0 ? opts.chunkSize : FILTER_STATUS_CHUNK_SIZE
  const tuneStatus = {}
  let anyTunesHaveNotes = false
  let anyTunesHaveLinks = false

  if (!Array.isArray(filteredTunes) || filteredTunes.length >= LIST_PROTECTION_LIMIT * 5) {
    return { tuneStatus: tuneStatus, anyTunesHaveNotes: false, anyTunesHaveLinks: false }
  }

  for (let start = 0; start < filteredTunes.length; start += chunkSize) {
    if (shouldCancel()) return null
    const end = Math.min(start + chunkSize, filteredTunes.length)
    for (let i = start; i < end; i += 1) {
      const tune = filteredTunes[i]
      if (!tune || !tune.id) continue
      const entry = buildTuneStatusEntry(tune, tunebook)
      if (!entry) continue
      tuneStatus[tune.id] = entry
      if (entry.hasNotes) anyTunesHaveNotes = true
      if (entry.hasLinks) anyTunesHaveLinks = true
    }
    if (end < filteredTunes.length) {
      await yieldToMain()
      if (shouldCancel()) return null
    }
  }

  return { tuneStatus: tuneStatus, anyTunesHaveNotes: anyTunesHaveNotes, anyTunesHaveLinks: anyTunesHaveLinks }
}

export async function runTuneListFilterAsync(params) {
  const {
    tunes,
    filterSearchFn,
    groupBy,
    tunebook,
    shouldCancel,
  } = params || {}

  if (shouldCancel && shouldCancel()) return null

  const filtered = sortTunesByName(filterTunes(tunes, filterSearchFn))
  const tagCollation = buildTagCollation(filtered)
  const statusResult = await buildTuneStatusMetadata(filtered, tunebook, { shouldCancel: shouldCancel })
  if (!statusResult) return null

  const grouped = buildGroupedTunes(filtered, groupBy, tunebook, statusResult.tuneStatus)

  return {
    filtered: filtered,
    grouped: grouped,
    tuneStatus: statusResult.tuneStatus,
    tagCollation: tagCollation,
  }
}

export function runTuneListFilterSync(params) {
  const {
    tunes,
    filterSearchFn,
    groupBy,
    tunebook,
  } = params || {}

  const filtered = sortTunesByName(filterTunes(tunes, filterSearchFn))
  const tagCollation = buildTagCollation(filtered)
  const tuneStatus = {}
  if (Array.isArray(filtered) && filtered.length < LIST_PROTECTION_LIMIT * 5) {
    filtered.forEach(function(tune) {
      if (!tune || !tune.id) return
      const entry = buildTuneStatusEntry(tune, tunebook)
      if (entry) tuneStatus[tune.id] = entry
    })
  }
  const grouped = buildGroupedTunes(filtered, groupBy, tunebook, tuneStatus)
  return {
    filtered: filtered,
    grouped: grouped,
    tuneStatus: tuneStatus,
    tagCollation: tagCollation,
  }
}

export function pruneSelectionForStatus(selected, tuneStatus) {
  const next = Object.assign({}, selected || {})
  let count = 0
  Object.keys(next).forEach(function(tuneId) {
    if (!tuneStatus[tuneId]) {
      next[tuneId] = false
    } else if (next[tuneId]) {
      count += 1
    }
  })
  return { selected: next, selectedCount: count }
}

export function buildListHashKey(parts) {
  return JSON.stringify(parts)
}
