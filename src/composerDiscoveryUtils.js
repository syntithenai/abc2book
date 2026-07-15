import { titleArtistFromFilename } from './audioFileMetadata'
import { isGenericArtist, normalizeArtistKey } from './genericArtistUtils'

export function parseTitleComposerHints(title, composer, titleHint) {
  const composerText = String(composer || '').trim()
  const titleText = String(title || '').trim()
  const hintText = String(titleHint || titleText || '').trim()

  if (composerText && !isGenericArtist(composerText)) {
    return {
      title: titleText || hintText,
      artistHint: composerText,
      titleHint: hintText,
    }
  }

  for (let i = 0; i < 2; i += 1) {
    const candidate = i === 0 ? hintText : titleText
    if (!candidate) continue
    const parsed = titleArtistFromFilename(candidate + '.mp3')
    if (parsed.artist && parsed.title) {
      return {
        title: parsed.title,
        artistHint: parsed.artist,
        titleHint: candidate,
      }
    }
  }

  return {
    title: titleText || hintText,
    artistHint: '',
    titleHint: hintText,
  }
}

export function needsComposerDiscovery(composer) {
  return !String(composer || '').trim() || isGenericArtist(composer)
}

export function buildGoogleComposerSearchQuestion(title, artist) {
  const songName = String(title || '').trim()
  if (!songName) return ''
  let question = 'Who composed the song "'
    + songName
    + '", and which artists have performed it?'
  const artistName = String(artist || '').trim()
  if (artistName) {
    question = 'Who composed the song "'
      + songName
      + '" by '
      + artistName
      + ', and which artists have performed it?'
  }
  return question
}

export function shouldOfferTitleSuggestion(currentTitle, suggestedTitle) {
  const current = String(currentTitle || '').trim()
  const suggested = String(suggestedTitle || '').trim()
  if (!suggested) return false
  return normalizeArtistKey(current) !== normalizeArtistKey(suggested)
}

/**
 * Build title suggestion list from MusicBrainz (or other) + local collection matches.
 * Returns [{ title, source }] (distinct, excludes current title).
 */
export function buildTitleSuggestions(options) {
  const opts = options || {}
  const currentTitle = String(opts.currentTitle || '').trim()
  const musicBrainzTitle = String(opts.musicBrainzTitle || opts.suggestedTitle || '').trim()
  const tunes = opts.tunes
  const limit = typeof opts.limit === 'number' ? opts.limit : 5
  const findCandidates = typeof opts.findTuneCandidates === 'function'
    ? opts.findTuneCandidates
    : null

  const seen = {}
  const results = []

  function add(title, source) {
    const cleaned = String(title || '').trim()
    if (!cleaned || !shouldOfferTitleSuggestion(currentTitle, cleaned)) return
    const key = normalizeArtistKey(cleaned)
    if (!key || seen[key]) return
    seen[key] = true
    results.push({ title: cleaned, source: source || '' })
  }

  if (musicBrainzTitle) add(musicBrainzTitle, 'MusicBrainz')

  if (findCandidates && tunes && currentTitle) {
    const matches = findCandidates(currentTitle, tunes, {
      limit: limit + 2,
      minScore: typeof opts.minScore === 'number' ? opts.minScore : 4,
    }) || []
    matches.forEach(function(entry) {
      const name = entry && entry.tune && entry.tune.name
      if (name) add(name, 'Your collection')
    })
  }

  return results.slice(0, limit)
}

export function buildGoogleComposerSearchUrl(title, artist) {
  const question = buildGoogleComposerSearchQuestion(title, artist)
  if (!question) return ''
  return 'https://www.google.com/search?q=' + encodeURIComponent(question)
}

export function getEffectiveComposerSearchHints(title, composer, titleHint) {
  return parseTitleComposerHints(title, composer, titleHint)
}

export function buildComposerPickerCandidates(result, currentComposer) {
  const candidates = []
  const seen = new Set()

  function roleLabel(role) {
    return role === 'writer' ? 'Writer' : (role === 'performer' ? 'Performer' : '')
  }

  function add(artist, source, preview, role) {
    const name = String(artist || '').trim()
    const key = normalizeArtistKey(name)
    if (!name || !key || seen.has(key)) return
    seen.add(key)
    const normalizedRole = role === 'writer' || role === 'performer' ? role : ''
    const label = roleLabel(normalizedRole)
    let displaySource = source || ''
    if (label && displaySource && displaySource.toLowerCase().indexOf(label.toLowerCase()) < 0) {
      displaySource = label + ' · ' + displaySource
    } else if (label && !displaySource) {
      displaySource = label
    }
    candidates.push({
      artist: name,
      role: normalizedRole,
      source: displaySource,
      preview: preview || (label ? (label + ' of this song') : name),
    })
  }

  const current = String(currentComposer || '').trim()
  if (current) {
    add(current, 'Current value', 'Keep the current composer field value', '')
  }

  const incoming = []
  if (result && result.multiple && Array.isArray(result.candidates)) {
    result.candidates.forEach(function(candidate) {
      incoming.push(candidate)
    })
  } else if (result && result.artist) {
    incoming.push(result)
  }

  incoming
    .slice()
    .sort(function(a, b) {
      const aWriter = a && a.role === 'writer' ? 0 : 1
      const bWriter = b && b.role === 'writer' ? 0 : 1
      return aWriter - bWriter
    })
    .forEach(function(candidate) {
      add(candidate.artist, candidate.source, candidate.preview, candidate.role)
    })

  return candidates
}
