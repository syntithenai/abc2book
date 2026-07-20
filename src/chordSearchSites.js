import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from './externalSearchLinks'

export const ALLOWED_CHORD_SITES = 'site:https://tabs.ultimate-guitar.com OR site:https://www.azchords.com/ OR site:https://www.chordsbase.com/ OR site:https://www.chords-and-tabs.net/ OR site:https://akordy.kytary.cz/ OR site:https://www.guitaretab.com/'

function hostFromUrl(url) {
  try {
    return new URL(String(url || '')).hostname.replace(/^www\./i, '').toLowerCase()
  } catch (e) {
    return ''
  }
}

export function buildGoogleChordsSearchUrl(title, artist, extraQuery) {
  let question = buildExternalSearchQuestion('chords', title, artist)
  if (!question) return ''
  const extra = String(extraQuery || '').trim()
  if (extra) question += ' ' + extra
  return buildGoogleSearchQuestionUrl(question)
}

export function isUltimateGuitarUrl(url) {
  const host = hostFromUrl(url)
  return host === 'ultimate-guitar.com' || host === 'tabs.ultimate-guitar.com'
    || host.endsWith('.ultimate-guitar.com')
}

export function isMuseScoreUrl(url) {
  const host = hostFromUrl(url)
  return host === 'musescore.com' || host.endsWith('.musescore.com')
}

/**
 * Ultimate Guitar title search (not a specific tab — used when web search
 * did not return a concrete tabs.ultimate-guitar.com URL).
 */
export function buildUltimateGuitarSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return 'https://www.ultimate-guitar.com/search.php?search_type=title&value='
    + encodeURIComponent(parts.join(' '))
}

export function buildMuseScoreSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return 'https://musescore.com/sheetmusic?text=' + encodeURIComponent(parts.join(' '))
}

/**
 * Prefer a concrete Ultimate Guitar tab from chord-search manualCandidates,
 * then any other locked chord page, then a UG search URL.
 */
export function pickChordPasteCandidate(manualCandidates, title, artist) {
  const list = Array.isArray(manualCandidates) ? manualCandidates : []
  let ug = null
  let other = null
  list.forEach(function(item) {
    if (!item || !item.url) return
    const candidate = {
      url: String(item.url),
      title: String(item.title || '').trim(),
      source: String(item.source || item.host || '').trim() || hostFromUrl(item.url),
      host: String(item.host || hostFromUrl(item.url)).trim(),
      contentType: item.contentType || 'chords',
      reason: String(item.reason || '').trim(),
    }
    if (!ug && isUltimateGuitarUrl(candidate.url)) ug = candidate
    else if (!other) other = candidate
  })
  if (ug) return ug
  if (other) return other
  const fallbackUrl = buildUltimateGuitarSearchUrl(title, artist)
    || buildGoogleChordsSearchUrl(title, artist, 'site:tabs.ultimate-guitar.com')
  if (!fallbackUrl) return null
  return {
    url: fallbackUrl,
    title: String(title || '').trim(),
    source: 'ultimate-guitar.com',
    host: 'ultimate-guitar.com',
    contentType: 'chords',
    reason: 'search',
    searchFallback: true,
  }
}

/**
 * Prefer a concrete MuseScore score URL from notation manualCandidates,
 * then any other locked notation page, then a MuseScore search URL so the
 * user can still import when discovery did not return a specific score.
 */
export function pickNotationPasteCandidate(manualCandidates, title, artist) {
  const list = Array.isArray(manualCandidates) ? manualCandidates : []
  let muse = null
  let other = null
  list.forEach(function(item) {
    if (!item || !item.url) return
    const candidate = {
      url: String(item.url),
      title: String(item.title || title || '').trim(),
      source: String(item.source || item.host || '').trim() || hostFromUrl(item.url),
      host: String(item.host || hostFromUrl(item.url)).trim(),
      contentType: item.contentType || 'notation',
      reason: String(item.reason || '').trim(),
    }
    if (!muse && isMuseScoreUrl(candidate.url)) muse = candidate
    else if (!other) other = candidate
  })
  if (muse) return muse
  if (other) return other
  const fallbackUrl = buildMuseScoreSearchUrl(title, artist)
  if (!fallbackUrl) return null
  return {
    url: fallbackUrl,
    title: String(title || '').trim(),
    source: 'musescore.com',
    host: 'musescore.com',
    contentType: 'notation',
    reason: 'search',
    searchFallback: true,
  }
}
