import { buildExternalSearchQuestion, buildGoogleSearchQuestionUrl } from './externalSearchLinks'

export function buildImslpSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return 'https://imslp.org/wiki/Special:Search?search=' + encodeURIComponent(parts.join(' '))
}

export function buildCpdlSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return 'https://www.cpdl.org/wiki/index.php?search=' + encodeURIComponent(parts.join(' '))
}

export function buildJosquinSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return 'https://josquin.stanford.edu/?q=' + encodeURIComponent(parts.join(' '))
}

export function buildOpenScoreSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return 'https://musescore.com/sheetmusic?text=' + encodeURIComponent('openscore ' + parts.join(' '))
}

export function buildMusicalionSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return 'https://www.musicalion.com/en/scores/search.html?search=' + encodeURIComponent(parts.join(' '))
}

export function buildW3cMusicXmlSearchUrl(title, artist) {
  const parts = [String(title || '').trim(), String(artist || '').trim()].filter(Boolean)
  if (!parts.length) return ''
  return buildGoogleSearchQuestionUrl(
    buildExternalSearchQuestion('notation', parts.join(' '), '') + ' site:musicxml.com'
  )
}

export function buildExternalNotationArchiveChoices(title, artist) {
  const choices = []
  const entries = [
    { id: 'imslp', title: 'IMSLP', artist: 'imslp.org', source: 'imslp.org', buildUrl: buildImslpSearchUrl, preview: 'Search IMSLP public domain scores' },
    { id: 'cpdl', title: 'CPDL', artist: 'cpdl.org', source: 'cpdl.org', buildUrl: buildCpdlSearchUrl, preview: 'Search Choral Public Domain Library' },
    { id: 'josquin', title: 'Josquin', artist: 'josquin.stanford.edu', source: 'josquin', buildUrl: buildJosquinSearchUrl, preview: 'Search Josquin Research Project scores' },
    { id: 'openscore', title: 'OpenScore', artist: 'openscore.org', source: 'openscore', buildUrl: buildOpenScoreSearchUrl, preview: 'Search OpenScore public domain scores' },
    { id: 'musicalion', title: 'Musicalion', artist: 'musicalion.com', source: 'musicalion.com', buildUrl: buildMusicalionSearchUrl, preview: 'Search Musicalion (subscription may be required)' },
    { id: 'w3c', title: 'MusicXML examples', artist: 'musicxml.com', source: 'musicxml.com', buildUrl: buildW3cMusicXmlSearchUrl, preview: 'Search W3C MusicXML educational examples' },
  ]
  entries.forEach(function(entry) {
    const url = entry.buildUrl(title, artist)
    if (!url) return
    choices.push({
      id: entry.id,
      title: entry.title,
      artist: entry.artist,
      preview: entry.preview,
      source: entry.source,
      url: url,
    })
  })
  return choices
}

export function isArchiveNotationHost(host) {
  const value = String(host || '').replace(/^www\./i, '').toLowerCase()
  return value === 'imslp.org'
    || value.endsWith('.imslp.org')
    || value === 'cpdl.org'
    || value.endsWith('.cpdl.org')
    || value === 'josquin.stanford.edu'
    || value === 'data.josqu.in'
    || value === 'openscore.org'
    || value.endsWith('.openscore.org')
    || value === 'musicalion.com'
    || value.endsWith('.musicalion.com')
    || value === 'musicxml.com'
    || value.endsWith('.musicxml.com')
}

export function isSubscriptionNotationManualCandidate(item) {
  const tier = String(item && item.accessTier || '').trim().toLowerCase()
  return tier === 'subscription_required'
}

export function notationSourceBadgeLabel(source) {
  const value = String(source || '').trim().toLowerCase()
  if (!value) return ''
  if (value === 'musescore.com') return 'MuseScore'
  if (value === 'openscore.org') return 'OpenScore'
  if (value === 'imslp.org') return 'IMSLP'
  if (value === 'cpdl.org') return 'CPDL'
  if (value === 'josquin.stanford.edu') return 'Josquin'
  if (value === 'musicalion.com') return 'Musicalion'
  if (value === 'musicxml.com') return 'MusicXML'
  if (value === 'midi-resources') return 'Local MIDI'
  return source
}
