import { primaryArtist, allArtists, allTitles } from './tuneBibliographicUtils'

function simpleHash(str) {
  var h = 0
  var s = String(str || '')
  for (var i = 0; i < s.length; i++) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return 'fh_' + (h >>> 0).toString(16)
}

export function factHash(candidate) {
  if (!candidate) return simpleHash('')
  return simpleHash([
    candidate.predicate || '',
    candidate.subjectName || '',
    candidate.objectText || '',
    candidate.tuneId || '',
  ].join('|'))
}

function splitSentences(text) {
  return String(text || '')
    .split(/(?<=[.!?])\s+/)
    .map(function(s) { return s.trim() })
    .filter(function(s) { return s.length > 20 })
}

function parseBackgroundSections(markdown) {
  const text = String(markdown || '').trim()
  if (!text) return []
  const parts = text.split(/^##\s+/m)
  const sections = []
  parts.forEach(function(part, idx) {
    if (!part.trim()) return
    if (idx === 0 && text.indexOf('##') !== 0) {
      sections.push({ title: '', body: part.trim() })
      return
    }
    const nl = part.indexOf('\n')
    const title = nl === -1 ? part.trim() : part.slice(0, nl).trim()
    const body = nl === -1 ? '' : part.slice(nl + 1).trim()
    sections.push({ title: title, body: body })
  })
  return sections
}

function yearFromText(text) {
  const m = String(text || '').match(/\b((?:19|20)\d{2})\b/)
  return m ? parseInt(m[1], 10) : null
}

export function extractFactsFromTune(tune) {
  if (!tune || typeof tune !== 'object') return []
  const facts = []
  const tuneId = tune.id != null ? String(tune.id) : null
  const title = String(tune.name || '').trim() || 'Untitled'
  const artist = primaryArtist(tune)
  const artists = allArtists(tune)
  const titles = allTitles(tune)

  titles.forEach(function(alias) {
    if (alias === title) return
    const c = {
      subjectType: 'tune',
      subjectName: title,
      tuneId: tuneId,
      predicate: 'also_known_as',
      objectText: alias,
      objectYear: null,
      objectImageUrl: null,
      confidence: 0.9,
      source: 'local_bg',
      sourceUrl: '',
      rawSnippet: alias,
    }
    c.factHash = factHash(c)
    facts.push(c)
  })

  if (artist) {
    const c = {
      subjectType: 'tune',
      subjectName: title,
      tuneId: tuneId,
      predicate: 'written_by',
      objectText: artist,
      objectYear: null,
      objectImageUrl: null,
      confidence: 0.85,
      source: 'local_bg',
      sourceUrl: '',
      rawSnippet: artist,
    }
    c.factHash = factHash(c)
    facts.push(c)
  }

  artists.slice(1).forEach(function(name) {
    const c = {
      subjectType: 'tune',
      subjectName: title,
      tuneId: tuneId,
      predicate: 'recorded_by',
      objectText: name,
      objectYear: null,
      objectImageUrl: null,
      confidence: 0.7,
      source: 'local_bg',
      sourceUrl: '',
      rawSnippet: name,
    }
    c.factHash = factHash(c)
    facts.push(c)
  })

  const prefer = /origin|recording|performer|release|anecdote|histor|about/i
  const sections = parseBackgroundSections(tune.backgroundInfo)
  const preferred = sections.filter(function(s) { return prefer.test(s.title) })
  const useSections = preferred.length ? preferred : sections
  const artistKeys = {}
  artists.forEach(function(a) { artistKeys[String(a).toLowerCase()] = true })

  useSections.forEach(function(section) {
    splitSentences(section.body).forEach(function(sentence) {
      const hasYear = yearFromText(sentence)
      const lower = sentence.toLowerCase()
      let mentionsArtist = false
      Object.keys(artistKeys).forEach(function(k) {
        if (k && lower.indexOf(k) !== -1) mentionsArtist = true
      })
      if (!hasYear && !mentionsArtist && preferred.length === 0) return
      const predicate = hasYear ? 'anecdote' : 'bio_snippet'
      const c = {
        subjectType: 'tune',
        subjectName: title,
        tuneId: tuneId,
        predicate: predicate,
        objectText: sentence,
        objectYear: hasYear,
        objectImageUrl: null,
        confidence: hasYear ? 0.75 : 0.55,
        source: 'local_bg',
        sourceUrl: '',
        rawSnippet: sentence,
      }
      c.factHash = factHash(c)
      facts.push(c)
    })
  })

  return facts
}

export function factsToNewsBody(facts, maxSentences) {
  const max = maxSentences || 3
  const lines = []
  ;(facts || []).forEach(function(f) {
    if (lines.length >= max) return
    if (f.predicate === 'anecdote' || f.predicate === 'bio_snippet') {
      lines.push(f.objectText)
    }
  })
  return lines.join(' ')
}
