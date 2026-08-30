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

export function allGenres(tune) {
  if (!tune) return []
  normalizeTuneGenres(tune)
  return Array.isArray(tune.genres) ? tune.genres.slice() : []
}

/** Migrate legacy tune.genre / meta.G into genres[] and remove obsolete fields. */
export function normalizeTuneGenres(tune) {
  if (!tune || typeof tune !== 'object') return tune
  if (!Array.isArray(tune.genres)) tune.genres = []

  if (tune.meta && tune.meta.G != null) {
    const legacyGenres = Array.isArray(tune.meta.G) ? tune.meta.G : [tune.meta.G]
    tune.genres = mergeBibliographicList(tune.genres, legacyGenres)
    delete tune.meta.G
  }

  if (tune.genre != null && String(tune.genre).trim()) {
    tune.genres = mergeBibliographicList(tune.genres, tune.genre)
    delete tune.genre
  }

  return tune
}

/** True if any selected genre filter matches genres[] (case-insensitive). */
export function tuneMatchesGenreFilter(tune, filterGenres) {
  if (!Array.isArray(filterGenres) || filterGenres.length === 0) return true
  const genres = allGenres(tune)
  if (genres.length === 0) return false
  const genreKeys = {}
  genres.forEach(function(genre) {
    genreKeys[normalizeKey(genre)] = true
  })
  return filterGenres.some(function(filter) {
    const key = normalizeKey(filter)
    return key && genreKeys[key]
  })
}

export function allAlbums(tune) {
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
  if (tune && Array.isArray(tune.albums)) {
    tune.albums.forEach(add)
  }
  return result
}

/** True if any selected album filter matches albums[] (case-insensitive). */
export function tuneMatchesAlbumFilter(tune, filterAlbums) {
  if (!Array.isArray(filterAlbums) || filterAlbums.length === 0) return true
  const albums = allAlbums(tune)
  if (albums.length === 0) return false
  const albumKeys = {}
  albums.forEach(function(album) {
    albumKeys[normalizeKey(album)] = true
  })
  return filterAlbums.some(function(filter) {
    const key = normalizeKey(filter)
    return key && albumKeys[key]
  })
}

export function renderBibliographicGenreLines(tune) {
  const lines = []
  allGenres(tune).forEach(function(genre) {
    const text = String(genre || '').trim()
    if (text) lines.push('G: ' + text)
  })
  return lines
}

/** ABC info-header fields stored as string arrays on the tune (not folded into H:). */
export const ABC_INFO_HEADER_FIELDS = [
  { key: 'origin', abc: 'O', label: 'Origin' },
  { key: 'area', abc: 'A', label: 'Area' },
  { key: 'source', abc: 'S', label: 'Source' },
  { key: 'transcription', abc: 'Z', label: 'Transcription' },
  { key: 'discography', abc: 'D', label: 'Discography' },
  { key: 'infoNotes', abc: 'N', label: 'Notes' },
]

const BACKGROUND_SEED_LABEL_TO_FIELD = {
  Origin: 'origin',
  Area: 'area',
  Source: 'source',
  Transcription: 'transcription',
  Discography: 'discography',
  Notes: 'infoNotes',
}

const NON_TITLE_SLASH_SEGMENTS = {
  'and/or': true,
  'w/': true,
  'c/o': true,
}

const MOJIBAKE_RE = /[\uFFFD\u00C3\u00C2]|â€|â€™/

function hasLetter(text) {
  try {
    return /\p{L}/u.test(text)
  } catch (e) {
    return /[A-Za-z\u00C0-\u024F]/.test(text)
  }
}

function partLooksCorrupted(part) {
  if (MOJIBAKE_RE.test(part)) return true
  if (part.length === 1) return true
  return false
}

/**
 * Conservatively split "Title / Alias" (or Title/Alias) into primary + aliases.
 * @param {string} rawTitle
 * @param {{ force?: boolean }} [options] force skips short-segment / spaced-slash gates
 * @returns {{ name: string, aliases: string[], split: boolean } | null}
 */
export function splitSlashJoinedTitle(rawTitle, options) {
  const force = !!(options && options.force)
  const raw = String(rawTitle || '').trim()
  if (!raw || raw.indexOf('/') < 0) return null

  const hasSpacedSlash = / \/\s/.test(raw) || /\s\/ /.test(raw)
  const parts = raw.split(/\s*\/\s*/).map(function(part) {
    return String(part || '').trim()
  }).filter(Boolean)

  if (parts.length < 2) return null
  if (parts.length > 5) return null

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i]
    const lower = part.toLowerCase()
    if (NON_TITLE_SLASH_SEGMENTS[lower] || NON_TITLE_SLASH_SEGMENTS[lower + '/'] || lower === 'and/or') {
      return null
    }
    // Whole-title idioms like "and/or" appear as a single segment only after bad splits;
    // also refuse if the raw contains them as a token with slashes.
    if (part.length < 3) return null
    if (!hasLetter(part)) return null
    if (/^[\d\W_]+$/.test(part)) return null
    if (partLooksCorrupted(part)) return null
  }

  if (/\band\/or\b/i.test(raw) || /(^|[\s])(w\/|c\/o)([\s]|$)/i.test(raw)) {
    return null
  }

  if (!force && !hasSpacedSlash) {
    const hasShortOneWord = parts.some(function(part) {
      return part.length < 5 && part.split(/\s+/).filter(Boolean).length === 1
    })
    if (hasShortOneWord) return null
  }

  return {
    name: parts[0],
    aliases: parts.slice(1),
    split: true,
  }
}

/** Normalize a bibliographic multi-value field to a trimmed unique string array. */
export function normalizeInfoHeaderList(value) {
  const items = Array.isArray(value) ? value : (value != null && value !== '' ? [value] : [])
  return mergeBibliographicList([], items)
}

export function pushInfoHeaderValue(tune, fieldKey, value) {
  if (!tune || !fieldKey) return
  const text = String(value || '').trim()
  if (!text) return
  tune[fieldKey] = mergeBibliographicList(tune[fieldKey], text)
}

export function renderAbcInfoHeaderLines(tune) {
  const lines = []
  ABC_INFO_HEADER_FIELDS.forEach(function(entry) {
    const values = normalizeInfoHeaderList(tune && tune[entry.key])
    values.forEach(function(text) {
      lines.push(entry.abc + ': ' + text)
    })
  })
  return lines
}

export function renderSourceBookCommentLines(tune) {
  const books = normalizeInfoHeaderList(tune && tune.sourceBooks)
  return books.map(function(book) {
    return '% abcbook-source-book ' + book
  })
}

/**
 * Lift legacy `**Origin:** …` seeds from backgroundInfo into typed fields when empty.
 */
export function salvageBackgroundMetaSeeds(tune) {
  if (!tune || typeof tune.backgroundInfo !== 'string') return tune
  const raw = tune.backgroundInfo
  if (!raw || raw.indexOf('**') < 0) return tune

  const kept = []
  const lines = raw.split('\n')
  lines.forEach(function(line) {
    const match = String(line || '').match(/^\*\*([^*]+):\*\*\s*(.*)$/)
    if (!match) {
      kept.push(line)
      return
    }
    const label = String(match[1] || '').trim()
    const text = String(match[2] || '').trim()
    const fieldKey = BACKGROUND_SEED_LABEL_TO_FIELD[label]
    if (!fieldKey || !text) {
      kept.push(line)
      return
    }
    const existing = normalizeInfoHeaderList(tune[fieldKey])
    if (existing.length > 0) {
      kept.push(line)
      return
    }
    pushInfoHeaderValue(tune, fieldKey, text)
  })

  const next = kept.join('\n').replace(/\n{3,}/g, '\n\n').trim()
  tune.backgroundInfo = next
  return tune
}

function applySlashTitleSplit(tune, force) {
  const primaryName = String(tune.name || '').trim()
  if (!primaryName || primaryName.indexOf('/') < 0) return tune

  const existingAliasKeys = {}
  if (Array.isArray(tune.aliases)) {
    tune.aliases.forEach(function(alias) {
      existingAliasKeys[normalizeKey(alias)] = true
    })
  }

  const result = splitSlashJoinedTitle(primaryName, { force: !!force })
  if (!result || !result.split) return tune

  // Skip if aliases already cover the slash parts (already split).
  const pendingAliases = result.aliases.filter(function(alias) {
    return !existingAliasKeys[normalizeKey(alias)]
  })
  const alreadyCovered = result.aliases.length > 0 && pendingAliases.length === 0
    && normalizeKey(result.name) === normalizeKey(primaryName.split(/\s*\/\s*/)[0])
  if (alreadyCovered && normalizeKey(tune.name) === normalizeKey(result.name)) {
    return tune
  }

  tune.name = result.name
  tune.aliases = mergeBibliographicList(tune.aliases, result.aliases, {
    [normalizeKey(result.name)]: true,
  })
  return tune
}

export function normalizeBibliographicFields(tune) {
  if (!tune || typeof tune !== 'object') return tune

  if (!Array.isArray(tune.aliases)) tune.aliases = []
  if (!Array.isArray(tune.artists)) tune.artists = []
  ABC_INFO_HEADER_FIELDS.forEach(function(entry) {
    tune[entry.key] = normalizeInfoHeaderList(tune[entry.key])
  })
  tune.sourceBooks = normalizeInfoHeaderList(tune.sourceBooks)
  normalizeTuneGenres(tune)

  applySlashTitleSplit(tune, false)
  salvageBackgroundMetaSeeds(tune)

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

/** Apply slash title split with force=true (Info-tab control). */
export function forceSplitSlashTitle(tune) {
  if (!tune || typeof tune !== 'object') return tune
  return applySlashTitleSplit(tune, true)
}
