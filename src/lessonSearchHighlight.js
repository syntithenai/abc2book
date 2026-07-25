/**
 * Highlight and scroll helpers for in-lesson search navigation.
 */

export const LESSON_SEARCH_HIGHLIGHT_STORAGE_KEY = 'lessonSearchHighlight'

export function normalizeHighlightTerm(term) {
  return String(term || '').trim()
}

export function highlightTermFromSearch(search) {
  try {
    return normalizeHighlightTerm(new URLSearchParams(search || '').get('q'))
  } catch (e) {
    return ''
  }
}

export function highlightTermFromLocation(location) {
  const loc = location || {}
  const fromSearch = highlightTermFromSearch(loc.search)
  if (fromSearch) return fromSearch
  if (typeof window !== 'undefined' && window.location && window.location.hash) {
    const hash = String(window.location.hash || '')
    const qIndex = hash.indexOf('?')
    if (qIndex !== -1) {
      const fromHash = highlightTermFromSearch(hash.slice(qIndex))
      if (fromHash) return fromHash
    }
  }
  return normalizeHighlightTerm(loc.state && loc.state.lessonSearchHighlight)
}

export function collectLessonSearchableText(lesson) {
  if (!lesson) return ''
  const parts = []
  ;(lesson.sections || []).forEach(function(section) {
    if (!section) return
    if (section.title) parts.push(section.title)
    ;(section.blocks || []).forEach(function(block) {
      if (!block) return
      if (block.type === 'markdown') parts.push(block.text || '')
      else if (block.type === 'entity') parts.push(block.id || '')
      else if (block.type === 'track') parts.push(block.label || block.id || '')
    })
  })
  ;(lesson.key_points || []).forEach(function(point) {
    if (point) parts.push(point)
  })
  ;(lesson.entities || []).forEach(function(entity) {
    if (entity && entity.name) parts.push(entity.name)
  })
  return parts.join('\n')
}

export function findBestHighlightTerm(query, lesson) {
  const q = normalizeHighlightTerm(query)
  if (!q) return ''
  const haystack = collectLessonSearchableText(lesson).toLowerCase()
  if (!haystack) return q
  if (haystack.indexOf(q.toLowerCase()) !== -1) return q

  const words = q.split(/\s+/).map(function(word) {
    return word.replace(/^[^\w]+|[^\w]+$/g, '')
  }).filter(function(word) { return word.length >= 3 })
  words.sort(function(a, b) { return b.length - a.length })
  for (let i = 0; i < words.length; i += 1) {
    if (haystack.indexOf(words[i].toLowerCase()) !== -1) return words[i]
  }
  return q
}

export function readStoredLessonSearchHighlight(lessonId) {
  const id = String(lessonId || '').trim()
  if (!id || typeof window === 'undefined' || !window.sessionStorage) return ''
  try {
    const raw = window.sessionStorage.getItem(LESSON_SEARCH_HIGHLIGHT_STORAGE_KEY)
    if (!raw) return ''
    const data = JSON.parse(raw)
    if (!data || data.lessonId !== id) return ''
    return normalizeHighlightTerm(data.term)
  } catch (e) {
    return ''
  }
}

export function writeStoredLessonSearchHighlight(lessonId, term) {
  const id = String(lessonId || '').trim()
  const normalized = normalizeHighlightTerm(term)
  if (!id || !normalized || typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.setItem(LESSON_SEARCH_HIGHLIGHT_STORAGE_KEY, JSON.stringify({
      lessonId: id,
      term: normalized,
    }))
  } catch (e) {
    // ignore quota errors
  }
}

export function clearStoredLessonSearchHighlight() {
  if (typeof window === 'undefined' || !window.sessionStorage) return
  try {
    window.sessionStorage.removeItem(LESSON_SEARCH_HIGHLIGHT_STORAGE_KEY)
  } catch (e) {
    // ignore
  }
}

export function resolveLessonHighlightQuery(options) {
  const lesson = options && options.lesson
  const lessonId = options && options.lessonId
  const pending = options && options.pending
  const location = options && options.location
  const searchParams = options && options.searchParams

  let rawTerm = ''
  if (pending && pending.lessonId === lessonId) {
    rawTerm = normalizeHighlightTerm(pending.term)
  }
  if (!rawTerm) {
    rawTerm = readStoredLessonSearchHighlight(lessonId)
  }
  if (!rawTerm && searchParams && typeof searchParams.get === 'function') {
    rawTerm = normalizeHighlightTerm(searchParams.get('q'))
  }
  if (!rawTerm && location) {
    const stateLessonId = location.state && location.state.lessonSearchHighlightLessonId
    if (!stateLessonId || stateLessonId === lessonId) {
      rawTerm = highlightTermFromLocation(location)
    }
  }
  if (!rawTerm || !lesson) return rawTerm
  return findBestHighlightTerm(rawTerm, lesson)
}

export function splitTextByHighlight(text, term) {
  const source = String(text || '')
  const needle = normalizeHighlightTerm(term)
  if (!needle || !source) return [{ text: source, match: false }]
  const parts = []
  const lowerSource = source.toLowerCase()
  const lowerNeedle = needle.toLowerCase()
  let start = 0
  let index = lowerSource.indexOf(lowerNeedle, start)
  while (index !== -1) {
    if (index > start) {
      parts.push({ text: source.slice(start, index), match: false })
    }
    parts.push({ text: source.slice(index, index + needle.length), match: true })
    start = index + needle.length
    index = lowerSource.indexOf(lowerNeedle, start)
  }
  if (start < source.length) {
    parts.push({ text: source.slice(start), match: false })
  }
  if (!parts.length) parts.push({ text: source, match: false })
  return parts
}

export function lessonTextContainsTerm(text, term) {
  const needle = normalizeHighlightTerm(term).toLowerCase()
  if (!needle) return false
  return String(text || '').toLowerCase().indexOf(needle) !== -1
}

export function scrollToLessonSearchHighlight(options) {
  const root = options && options.root
  const scope = root && root.querySelector
    ? root
    : document.querySelector('.lesson-content') || document
  const el = scope.querySelector('.lesson-search-highlight--scroll')
    || scope.querySelector('.lesson-search-highlight')
  if (!el) return false
  if (typeof el.scrollIntoView === 'function') {
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    return true
  }
  const offsetPx = options && typeof options.offsetPx === 'number' ? options.offsetPx : 120
  const top = el.getBoundingClientRect().top + window.pageYOffset - offsetPx
  window.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  return true
}
