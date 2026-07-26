/**
 * Best-effort split of a YouTube video title into song title + artist.
 * Falls back to channel name as artist when the title has no separator.
 */

function stripVideoNoise(text) {
  return String(text || '')
    .replace(/\s*[\(\[][^\)\]]*(official|audio|video|lyrics|hd|4k|mv|music\s*video)[^\)\]]*[\)\]]/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

function stripSeriesPrefix(text) {
  return String(text || '')
    .replace(/^Old[- ]Time\s+TOTW\s*#\d+\s*:\s*/i, '')
    .trim()
}

function stripLeadingTrackNumber(text) {
  return String(text || '')
    .replace(/^\d{1,2}[\.\)]\s+/, '')
    .replace(/^\d{2}\s+(?=[A-Za-z])/, '')
    .trim()
}

function stripTrailingDate(text) {
  return String(text || '')
    .replace(/\s+\d{1,2}\/\d{1,2}\/\d{2,4}\s*$/, '')
    .trim()
}

function stripTrailingEventSuffix(text) {
  return String(text || '')
    .replace(/,\s*Clifftop\s+\d{4}\s*$/i, '')
    .trim()
}

function stripOuterQuotes(text) {
  const trimmed = String(text || '').trim()
  const m = trimmed.match(/^["'"](.+)["'"]$/)
  return m ? m[1].trim() : trimmed
}

function stripTrailingYear(text) {
  return String(text || '')
    .replace(/\s+\d{4}\s*$/, '')
    .trim()
}

function extractFeatSuffix(text) {
  const m = String(text || '').match(/\s*[\(\[]\s*feat\.?\s+([^)\]]+)\s*[\)\]]\s*$/i)
  if (!m) return { main: String(text || '').trim(), feat: '' }
  return {
    main: text.slice(0, m.index).trim(),
    feat: m[1].trim(),
  }
}

function extractParentheticalArtist(text) {
  const m = String(text || '').match(/^(.+?)\s*\(([^)]+)\)\s*$/)
  if (!m) return null
  const inner = m[2].trim()
  if (!inner || /live|official|remaster|hd|4k|feat/i.test(inner)) return null
  if (inner.length > 60) return null
  return { title: m[1].trim(), artist: inner }
}

function looksLikePersonName(text) {
  const t = String(text || '').trim()
  if (!t || t.length > 80) return false
  const words = t.split(/\s+/).filter(Boolean)
  if (words.length < 1 || words.length > 6) return false
  if (/^(the|old|clifftop|old-time)\b/i.test(t) && words.length <= 2) return false
  if (/\d{4}/.test(t)) return false
  if (/[\/|]/.test(t) && words.length > 4) return false
  return /^[\w\s&.'-]+$/i.test(t)
}

function looksLikeFestivalPrefix(text) {
  return /^Clifftop\s+\d{4}\b/i.test(String(text || '').trim())
}

function mergeFeatArtist(artist, feat) {
  const base = String(artist || '').trim().replace(/\s{2,}/g, ' ')
  const extra = String(feat || '').trim().replace(/\s{2,}/g, ' ')
  if (!extra) return base
  if (!base) return extra
  if (base.toLowerCase().indexOf(extra.toLowerCase()) >= 0) return base
  return base + ' & ' + extra
}

function parseClifftopTripleDash(text) {
  const m = String(text || '').match(/^Clifftop\s+\d{4}\s*-\s*(.+?)\s*-\s*(.+)$/i)
  if (!m) return null
  return { title: m[1].trim(), artist: m[2].trim() }
}

function parseDateEmbeddedPerformer(text) {
  const m = String(text || '').match(/^(?:\d{1,2}\s+)?(.+?)\s+\d{4}-\d{2}-\d{2}\s+(.+)$/)
  if (!m) return null
  if (!looksLikePersonName(m[1])) return null
  return { title: m[2].trim(), artist: m[1].trim() }
}

function parsePlayedBy(text) {
  const m = String(text || '').match(/^(.+?)\s+played\s+by\s+(.+)$/i)
  if (!m) return null
  return { title: m[1].trim(), artist: m[2].trim() }
}

function parseArtistPlaysTitle(text) {
  const m = String(text || '').match(/^(.+?)\s+plays\s+(.+?)(?:\s+on\s+(?:the\s+)?\w+)?$/i)
  if (!m) return null
  if (!looksLikePersonName(m[1])) return null
  let title = m[2].trim()
  title = stripOuterQuotes(title)
  title = title.replace(/\s+for\s+.+$/i, '').trim()
  return { title: title, artist: m[1].trim() }
}

function parseArtistQuotedTitle(text) {
  const m = String(text || '').match(/^(.+?)\s+["'](.+?)["']\s*$/)
  if (!m) return null
  if (!looksLikePersonName(m[1])) return null
  return { title: m[2].trim(), artist: m[1].trim() }
}

function parseFiddlerCommaPattern(text) {
  const m = String(text || '').match(/^(.+?)\s+Fiddles,\s*(.+?)(?:,\s*from\s+.+)?$/i)
  if (!m) return null
  return { title: m[2].trim(), artist: m[1].trim() }
}

function parsePipeSeparator(text) {
  const m = String(text || '').match(/^(.+?)\s*\|\s*(.+)$/)
  if (!m) return null
  const left = m[1].trim()
  const right = m[2].trim()
  if (!looksLikePersonName(left)) return null
  return { title: right, artist: left }
}

function parseMultiDash(text) {
  const parts = String(text || '').split(/\s*-\s*/).map(function(p) { return p.trim(); }).filter(Boolean)
  if (parts.length < 3) return null
  if (looksLikeFestivalPrefix(parts[0])) {
    return { title: parts.slice(1, -1).join(' - '), artist: parts[parts.length - 1] }
  }
  const artist = parts[parts.length - 1]
  const title = parts.slice(0, -1).join(' - ')
  if (!looksLikePersonName(artist)) return null
  if (title.length < artist.length) return null
  return { title: title, artist: artist }
}

function parseTwoPartDash(text) {
  const dash = String(text || '').match(/^(.+?)\s*[—–\-]\s*(.+)$/)
  if (!dash) return null
  const left = dash[1].trim()
  const right = dash[2].trim()
  if (looksLikeFestivalPrefix(left)) return null
  if (left.split(/\s+/).length <= 4 && right.length >= left.length) {
    return { title: right, artist: left }
  }
  if (looksLikePersonName(left) && !looksLikePersonName(right)) {
    return { title: right, artist: left }
  }
  return { title: left, artist: right }
}

function parseTitleByArtist(text) {
  const byMatch = String(text || '').match(/^(.+?)\s+by\s+(.+)$/i)
  if (!byMatch) return null
  return { title: stripOuterQuotes(byMatch[1].trim()), artist: byMatch[2].trim() }
}

/**
 * @param {string} label
 * @param {string} [authorName]
 * @returns {{ title: string, artist: string }}
 */
export function parseTitleArtistFromYouTubeLabel(label, authorName) {
  let text = String(label || '').trim()
  const channel = String(authorName || '').trim()
  if (!text) {
    return { title: '', artist: channel }
  }

  text = stripVideoNoise(text)
  text = stripSeriesPrefix(text)
  text = stripLeadingTrackNumber(text)
  text = stripTrailingDate(text)
  text = stripTrailingEventSuffix(text)

  const featSplit = extractFeatSuffix(text)
  text = featSplit.main

  const tryPatterns = [
    parseClifftopTripleDash,
    parseDateEmbeddedPerformer,
    parsePlayedBy,
    parseTitleByArtist,
    parseArtistPlaysTitle,
    parseArtistQuotedTitle,
    parseFiddlerCommaPattern,
    parsePipeSeparator,
    function(t) { return extractParentheticalArtist(t) },
    parseMultiDash,
    parseTwoPartDash,
  ]

  for (let i = 0; i < tryPatterns.length; i += 1) {
    const hit = tryPatterns[i](text)
    if (hit && hit.title) {
      return {
        title: stripOuterQuotes(stripTrailingYear(hit.title)),
        artist: mergeFeatArtist(hit.artist, featSplit.feat),
      }
    }
  }

  const parenArtist = extractParentheticalArtist(text)
  if (parenArtist) {
    return {
      title: stripOuterQuotes(stripTrailingYear(parenArtist.title)),
      artist: mergeFeatArtist(parenArtist.artist, featSplit.feat),
    }
  }

  return {
    title: stripOuterQuotes(stripTrailingYear(text)),
    artist: mergeFeatArtist(channel, featSplit.feat),
  }
}
