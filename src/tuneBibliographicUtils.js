function normalizeKey(value) {
  return String(value || '').trim().toLowerCase()
}

function pushUnique(list, value, excludeKeys) {
  const text = String(value || '').trim()
  if (!text) return list
  const key = normalizeKey(text)
  if (excludeKeys && excludeKeys[key]) return list
  if (!Array.isArray(list)) list = []
  const seen = {}
  list.forEach(function(item) {
    seen[normalizeKey(item)] = true
  })
  if (seen[key]) return list
  return list.concat([text])
}

export function mergeBibliographicList(list, values, excludeKeys) {
  let result = Array.isArray(list) ? list.slice() : []
  const items = Array.isArray(values) ? values : [values]
  items.forEach(function(value) {
    result = pushUnique(result, value, excludeKeys)
  })
  return result
}

export function primaryArtist(tune) {
  const composer = String(tune && tune.composer || '').trim()
  if (composer) return composer
  const artists = tune && Array.isArray(tune.artists) ? tune.artists : []
  for (let i = 0; i < artists.length; i++) {
    const artist = String(artists[i] || '').trim()
    if (artist) return artist
  }
  return ''
}

export function allArtists(tune) {
  const result = []
  const seen = {}
  function add(value) {
    const text = String(value || '').trim()
    if (!text) return
    const key = normalizeKey(text)
    if (seen[key]) return
    seen[key] = true
    result.push(text)
  }
  if (tune) {
    add(tune.composer)
    if (Array.isArray(tune.artists)) {
      tune.artists.forEach(add)
    }
  }
  return result
}

/** True if any selected artist filter matches composer or artists[] (case-insensitive). */
export function tuneMatchesArtistFilter(tune, filterArtists) {
  if (!Array.isArray(filterArtists) || filterArtists.length === 0) return true
  const artists = allArtists(tune)
  if (artists.length === 0) return false
  const artistKeys = {}
  artists.forEach(function(artist) {
    artistKeys[normalizeKey(artist)] = true
  })
  return filterArtists.some(function(filter) {
    const key = normalizeKey(filter)
    return key && artistKeys[key]
  })
}

export function allTitles(tune) {
  const result = []
  const seen = {}
  function add(value) {
    const text = String(value || '').trim()
    if (!text) return
    const key = normalizeKey(text)
    if (seen[key]) return
    seen[key] = true
    result.push(text)
  }
  if (tune) {
    add(tune.name)
    if (Array.isArray(tune.aliases)) {
      tune.aliases.forEach(add)
    }
  }
  return result
}

export function renderBibliographicTitleLines(tune) {
  const lines = []
  const name = tune && tune.name ? String(tune.name).trim() : ''
  if (name) lines.push('T: ' + name)
  if (tune && Array.isArray(tune.aliases)) {
    tune.aliases.forEach(function(alias) {
      const text = String(alias || '').trim()
      if (text) lines.push('T: ' + text)
    })
  }
  return lines
}

export function renderBibliographicComposerLines(tune) {
  const lines = []
  const composer = tune && tune.composer ? String(tune.composer).trim() : ''
  if (composer) lines.push('C:' + composer)
  if (tune && Array.isArray(tune.artists)) {
    tune.artists.forEach(function(artist) {
      const text = String(artist || '').trim()
      if (text) lines.push('C:' + text)
    })
  }
  return lines
}

export function normalizeBibliographicFields(tune) {
  if (!tune || typeof tune !== 'object') return tune

  if (!Array.isArray(tune.aliases)) tune.aliases = []
  if (!Array.isArray(tune.artists)) tune.artists = []

  const excludeTitleKeys = {}
  const primaryName = String(tune.name || '').trim()
  if (primaryName) excludeTitleKeys[normalizeKey(primaryName)] = true

  const excludeArtistKeys = {}
  const primaryComposer = String(tune.composer || '').trim()
  if (primaryComposer) excludeArtistKeys[normalizeKey(primaryComposer)] = true

  if (tune.meta && tune.meta.T != null) {
    const legacyTitles = Array.isArray(tune.meta.T) ? tune.meta.T : [tune.meta.T]
    tune.aliases = mergeBibliographicList(tune.aliases, legacyTitles, excludeTitleKeys)
    delete tune.meta.T
  }

  tune.aliases = mergeBibliographicList(tune.aliases, [], excludeTitleKeys)
    .filter(function(alias) { return normalizeKey(alias) !== normalizeKey(tune.name) })

  tune.artists = mergeBibliographicList(tune.artists, [], excludeArtistKeys)
    .filter(function(artist) { return normalizeKey(artist) !== normalizeKey(tune.composer) })

  return tune
}
