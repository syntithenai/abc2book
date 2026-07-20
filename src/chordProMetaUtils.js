/**
 * ChordPro file metadata extraction for import (no network lookup).
 * Maps directives already present in the sheet into abc2book fields.
 */

const SECTION_COMMENT_RE =
  /^(verse|chorus|bridge|intro|outro|pre-?chorus|refrain|coda|tag|instrumental|solo|interlude|hook|v\d+)(\s+\d+)?$/i

const DIRECTIVE_RE = /^\{\s*([a-z][a-z0-9_-]*)\s*(?::\s*(.*))?\}$/i

function trimText(value) {
  return String(value == null ? '' : value).trim()
}

function normalizeKey(value) {
  return trimText(value).toLowerCase()
}

export function isSectionLabelComment(text) {
  const cleaned = trimText(text).replace(/^\[|\]$/g, '')
  return SECTION_COMMENT_RE.test(cleaned)
}

/**
 * Whether a ChordPro subtitle is safe to treat as artist/composer credit.
 * Rejects tempo markers ("180 bpm") and arrangement notes ("uke version").
 */
export function subtitleLooksLikeArtistCredit(text) {
  const t = trimText(text)
  if (!t) return false
  if (/^\d+(\.\d+)?\s*(bpm|q\.?)?$/i.test(t)) return false
  if (/\b\d{2,3}\s*bpm\b/i.test(t)) return false
  if (/\bbpm\b/i.test(t)) return false
  if (/\bversion\b/i.test(t)) return false
  if (/^(uke|ukulele|guitar|banjo|mandolin)\b/i.test(t)) return false
  return true
}

/** Extract bpm from free-text like "180 bpm" or "q=120". */
export function parseTempoHintFromText(raw) {
  const text = trimText(raw)
  if (!text) return 0
  let m = text.match(/\b(\d{2,3})\s*bpm\b/i)
  if (m) return parseInt(m[1], 10) || 0
  m = text.match(/^q\s*[:=]?\s*(\d{2,3})\b/i)
  if (m) return parseInt(m[1], 10) || 0
  m = text.match(/^(\d{2,3})\s*$/)
  if (m) {
    const n = parseInt(m[1], 10) || 0
    return n >= 40 && n <= 300 ? n : 0
  }
  return 0
}

/**
 * ChordPro brace tempo markers like `{164bpm}`, `{tempo: 120}`, `{bpm:118}`.
 * @returns {number} bpm or 0
 */
export function parseBraceTempoDirective(raw) {
  const text = trimText(raw)
  if (!text) return 0
  let m = text.match(/^\{\s*(\d{2,3})\s*bpm\s*\}$/i)
  if (m) {
    const n = parseInt(m[1], 10) || 0
    return n >= 40 && n <= 300 ? n : 0
  }
  m = text.match(/^\{\s*(?:tempo|bpm|metronome|q)\s*[:=]?\s*(\d{2,3})\s*\}$/i)
  if (m) {
    const n = parseInt(m[1], 10) || 0
    return n >= 40 && n <= 300 ? n : 0
  }
  return 0
}

export function isBraceTempoDirective(raw) {
  return parseBraceTempoDirective(raw) > 0
}

/** Drop whole-line brace tempo directives from lyric text. */
export function stripBraceTempoDirectiveLines(text) {
  const lines = String(text == null ? '' : text).split(/\r?\n/)
  const kept = lines.filter(function(line) {
    return !isBraceTempoDirective(line)
  })
  while (kept.length && !trimText(kept[0])) kept.shift()
  while (kept.length && !trimText(kept[kept.length - 1])) kept.pop()
  return kept.join('\n')
}

/**
 * Parse song duration from ChordPro {time:} / {duration:} when it looks like
 * length (m:ss), not meter (4/4).
 * @returns {number} seconds, or 0 if not a duration
 */
export function parseSongDurationSeconds(raw) {
  const text = trimText(raw)
  if (!text) return 0
  if (/^\d+\s*\/\s*\d+$/.test(text)) return 0
  if (/^\d+$/.test(text)) {
    const sec = parseInt(text, 10)
    return sec > 0 && sec < 86400 ? sec : 0
  }
  const m = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return 0
  let hours = 0
  let minutes = 0
  let seconds = 0
  if (m[3] != null) {
    hours = parseInt(m[1], 10)
    minutes = parseInt(m[2], 10)
    seconds = parseInt(m[3], 10)
  } else {
    minutes = parseInt(m[1], 10)
    seconds = parseInt(m[2], 10)
  }
  if (minutes > 59 && hours === 0 && m[3] == null) {
    // treat as mm:ss still; mm can be > 59 for long tracks rarely — allow
  }
  if (seconds > 59) return 0
  const total = hours * 3600 + minutes * 60 + seconds
  return total > 0 && total < 86400 ? total : 0
}

/**
 * Parse capo fret from {capo: N} or comment text like "Capo at 2nd fret…".
 * @returns {{ capo: number, consumed: boolean }}
 */
export function parseCapoFromText(raw) {
  const text = trimText(raw)
  if (!text) return { capo: 0, consumed: false }
  let m = text.match(/^(\d+)\s*$/)
  if (m) {
    const capo = parseInt(m[1], 10) || 0
    return { capo: capo, consumed: capo > 0 }
  }
  m = text.match(/capo(?:\s+at)?\s*(?:the\s+)?(\d+)(?:st|nd|rd|th)?(?:\s*fret)?/i)
  if (m) {
    const capo = parseInt(m[1], 10) || 0
    return { capo: capo, consumed: capo > 0 }
  }
  m = text.match(/capo\s*[:=]?\s*(\d+)/i)
  if (m) {
    const capo = parseInt(m[1], 10) || 0
    return { capo: capo, consumed: capo > 0 }
  }
  return { capo: 0, consumed: false }
}

/**
 * Collect {directive: value} pairs from ChordPro / OnSong text.
 * Short forms: t→title, st→subtitle, c→comment, ci→comment_italic.
 * @returns {Object.<string, string[]>}
 */
export function extractChordProDirectives(text) {
  const found = {}
  String(text || '').split(/\r?\n/).forEach(function(raw) {
    const trimmed = trimText(raw)
    if (!trimmed) return
    const braceTempo = parseBraceTempoDirective(trimmed)
    if (braceTempo > 0) {
      if (!found.bpm) found.bpm = []
      found.bpm.push(String(braceTempo))
      return
    }
    // OnSong {{title: X}} already normalized to {title: X} by callers when needed
    const match = trimmed.match(DIRECTIVE_RE)
    if (!match) return
    let key = String(match[1] || '').toLowerCase()
    const value = trimText(match[2])
    if (key === 't') key = 'title'
    else if (key === 'st') key = 'subtitle'
    else if (key === 'c') key = 'comment'
    else if (key === 'ci') key = 'comment_italic'
    if (!found[key]) found[key] = []
    found[key].push(value)
  })
  return found
}

function firstNonEmpty(values) {
  if (!Array.isArray(values)) return ''
  for (let i = 0; i < values.length; i++) {
    const v = trimText(values[i])
    if (v) return v
  }
  return ''
}

function pushUnique(list, value) {
  const text = trimText(value)
  if (!text) return list
  const key = normalizeKey(text)
  if (!Array.isArray(list)) list = []
  for (let i = 0; i < list.length; i++) {
    if (normalizeKey(list[i]) === key) return list
  }
  return list.concat([text])
}

/**
 * Resolve bibliographic / musical / import fields from ChordSheetJS song
 * object (when available) plus raw directive map and optional COW preamble.
 *
 * @param {object} options
 * @param {object} [options.song] chordsheetjs song
 * @param {object} [options.directives] from extractChordProDirectives
 * @param {object} [options.preamble] from extractChordSheetPreambleMeta-like shape
 * @param {string} [options.fallbackTitle]
 */
export function resolveChordProImportMeta(options) {
  const opts = options || {}
  const song = opts.song || {}
  const directives = opts.directives || {}
  const preamble = opts.preamble || {}
  const fallbackTitle = trimText(opts.fallbackTitle) || 'Untitled'

  const title =
    trimText(song.title)
    || firstNonEmpty(directives.title)
    || trimText(preamble.title)
    || fallbackTitle

  const composerFromFile =
    trimText(song.composer)
    || firstNonEmpty(directives.composer)

  const artistFromFile =
    trimText(song.artist)
    || firstNonEmpty(directives.artist)

  const lyricist = firstNonEmpty(directives.lyricist)
  const arranger = firstNonEmpty(directives.arranger)

  const subtitle =
    trimText(song.subtitle)
    || firstNonEmpty(directives.subtitle)

  // COW labeled Artist:/By:/Author: lands in preamble.composer historically
  const cowArtist = trimText(preamble.composer)

  let composer = composerFromFile
  let artist = artistFromFile || cowArtist
  let subtitleUsedAsArtist = false
  const subtitleTempoHint = subtitle ? parseTempoHintFromText(subtitle) : 0
  const subtitleIsCredit = subtitle && subtitleLooksLikeArtistCredit(subtitle)

  if (!composer && !artist && subtitleIsCredit) {
    artist = subtitle
    subtitleUsedAsArtist = true
  }

  // Primary C: prefers composer; else artist (Books filter via primaryArtist)
  const primaryComposer = composer || artist || ''
  let artists = []
  if (composer && artist && normalizeKey(composer) !== normalizeKey(artist)) {
    artists = pushUnique(artists, artist)
  }
  artists = pushUnique(artists, lyricist)
  artists = pushUnique(artists, arranger)
  artists = artists.filter(function(name) {
    return normalizeKey(name) !== normalizeKey(primaryComposer)
  })

  const aliases = []
  if (subtitle && !subtitleUsedAsArtist) {
    // Pure tempo markers become tempo only; version/arrangement notes stay as aliases.
    const tempoOnlySubtitle = subtitleTempoHint > 0 && !subtitleLooksLikeArtistCredit(subtitle)
      && !/\bversion\b/i.test(subtitle)
      && !/^(uke|ukulele|guitar|banjo|mandolin)\b/i.test(subtitle)
    if (
      !tempoOnlySubtitle
      && normalizeKey(subtitle) !== normalizeKey(title)
      && normalizeKey(subtitle) !== normalizeKey(primaryComposer)
      && normalizeKey(subtitle) !== normalizeKey(artist)
    ) {
      aliases.push(subtitle)
    }
  }

  const genre = firstNonEmpty(directives.genre)

  const album = firstNonEmpty(directives.album) || trimText(song.album)
  const year = firstNonEmpty(directives.year) || trimText(song.year)
  let discography = ''
  if (album && year) discography = album + ' (' + year + ')'
  else if (album) discography = album
  else if (year) discography = year

  const copyright = firstNonEmpty(directives.copyright)
  const tags = []
  if (copyright) tags.push('©')

  const key =
    trimText(song.key)
    || firstNonEmpty(directives.key)
    || trimText(preamble.key)
    || 'C'

  let tempo = 100
  const tempoRaw =
    song.tempo
    || firstNonEmpty(directives.tempo)
    || firstNonEmpty(directives.metronome)
    || firstNonEmpty(directives.bpm)
    || preamble.tempo
  if (tempoRaw != null && String(tempoRaw).trim() !== '') {
    const parsedTempo = parseInt(String(tempoRaw).replace(/[^\d].*$/, ''), 10)
    if (parsedTempo > 0) tempo = parsedTempo
  } else if (subtitleTempoHint > 0) {
    tempo = subtitleTempoHint
  }

  let capo = 0
  if (song.capo != null && song.capo !== '') {
    capo = parseInt(song.capo, 10) || 0
  }
  if (!capo && preamble.capo) {
    capo = parseInt(preamble.capo, 10) || 0
  }
  if (!capo && firstNonEmpty(directives.capo)) {
    capo = parseCapoFromText(firstNonEmpty(directives.capo)).capo
  }

  // {ci:} maps to comment_italic — prefer capo parse before background
  const commentCandidates = [].concat(
    directives.comment || [],
    directives.comment_italic || []
  )
  const capoConsumedComments = {}
  if (!capo) {
    for (let i = 0; i < commentCandidates.length; i++) {
      const parsed = parseCapoFromText(commentCandidates[i])
      if (parsed.consumed) {
        capo = parsed.capo
        capoConsumedComments[normalizeKey(commentCandidates[i])] = true
        break
      }
    }
  }

  const backgroundParts = []
  if (copyright) backgroundParts.push('Copyright: ' + copyright)
  commentCandidates.forEach(function(raw) {
    const text = trimText(raw)
    if (!text || isSectionLabelComment(text)) return
    if (capoConsumedComments[normalizeKey(text)]) return
    backgroundParts.push(text)
  })

  let meter = '4/4'
  const meterCandidate =
    trimText(preamble.meter)
    || firstNonEmpty(directives.meter)
  // song.time in ChordPro may be duration in this corpus — only use as meter if N/N
  const songTime = trimText(song.time)
  if (meterCandidate && /^\d+\s*\/\s*\d+$/.test(meterCandidate)) {
    meter = meterCandidate.replace(/\s+/g, '')
  } else if (songTime && /^\d+\s*\/\s*\d+$/.test(songTime)) {
    meter = songTime.replace(/\s+/g, '')
  }

  let lyricsScrollDurationSec = 0
  const durationRaw =
    firstNonEmpty(directives.duration)
    || firstNonEmpty(directives.time)
    || (songTime && !/^\d+\s*\/\s*\d+$/.test(songTime) ? songTime : '')
  lyricsScrollDurationSec = parseSongDurationSeconds(durationRaw)

  const tuning = trimText(preamble.tuning) || firstNonEmpty(directives.tuning) || ''

  return {
    title: title || fallbackTitle,
    composer: primaryComposer,
    artists: artists,
    aliases: aliases,
    genre: genre,
    album: album,
    year: year,
    discography: discography,
    copyright: copyright,
    tags: tags,
    key: key || 'C',
    tempo: tempo || 100,
    capo: capo || 0,
    meter: meter || '4/4',
    tuning: tuning,
    lyricsScrollDurationSec: lyricsScrollDurationSec,
    backgroundInfo: backgroundParts.join('\n'),
  }
}

/**
 * Append ABC header lines for resolved ChordPro import meta (after T: title).
 * Caller supplies X:/T:/B: and musical body separately as needed.
 */
export function appendChordProMetaAbcHeaders(lines, meta, options) {
  const draft = meta || {}
  const opts = options || {}
  const escape = typeof opts.escape === 'function'
    ? opts.escape
    : function(v) { return String(v == null ? '' : v).replace(/\r?\n/g, ' ').trim() }

  ;(Array.isArray(draft.aliases) ? draft.aliases : []).forEach(function(alias) {
    const text = escape(alias)
    if (text) lines.push('T:' + text)
  })

  const composer = escape(draft.composer)
  if (composer) lines.push('C:' + composer)
  ;(Array.isArray(draft.artists) ? draft.artists : []).forEach(function(artist) {
    const text = escape(artist)
    if (text && normalizeKey(text) !== normalizeKey(composer)) {
      lines.push('C:' + text)
    }
  })

  const genre = escape(draft.genre)
  if (genre) lines.push('G:' + genre)

  const discography = escape(draft.discography)
  if (discography) lines.push('D:' + discography)

  if (draft.backgroundInfo) {
    String(draft.backgroundInfo).split(/\n/).forEach(function(line) {
      const text = escape(line)
      if (text) lines.push('H:' + text)
    })
  }

  const tags = Array.isArray(draft.tags) ? draft.tags.filter(Boolean) : []
  if (tags.length) {
    lines.push('% abcbook-tags ' + tags.join(','))
  }

  const capo = parseInt(draft.capo, 10) || 0
  if (capo > 0) lines.push('% abcbook-capo ' + capo)

  const scrollDur = parseInt(draft.lyricsScrollDurationSec, 10) || 0
  if (scrollDur > 0) {
    lines.push('% abcbook-lyrics-scroll-duration ' + scrollDur)
  }
}
