/**
 * Client-side search over /lessons/search-index.json (lazy-loaded).
 */

const LESSON_EXPORT_HINT = 'Run: python3 scripts/lesson_plans/export_lessons.py --ireland-only'

const lessonByIdCache = new Map()
let searchIndexCache = null
let searchIndexPromise = null

export function lessonAssetBase() {
  const base = typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL
    ? process.env.PUBLIC_URL
    : ''
  return (base || '') + '/lessons/'
}

export function lessonAssetUrl(relativePath) {
  const rel = String(relativePath || '').replace(/^\/+/, '')
  return lessonAssetBase() + rel
}

export async function fetchLessonAssetJson(url, options) {
  const res = await fetch(url)
  const text = await res.text()
  if (!res.ok) {
    const err = new Error('Failed to load lesson data (' + res.status + '): ' + url)
    err.code = 'LESSON_HTTP_ERROR'
    throw err
  }
  const trimmed = text.trimStart()
  if (trimmed.indexOf('<') === 0) {
    if (options && options.missingAsNotFound) {
      const err = new Error('Lesson asset not found: ' + url)
      err.code = 'LESSON_ASSET_NOT_FOUND'
      throw err
    }
    throw new Error('Lesson data not found. ' + LESSON_EXPORT_HINT)
  }
  try {
    return JSON.parse(text)
  } catch (err) {
    const parseErr = new Error('Invalid lesson JSON at ' + url)
    parseErr.code = 'LESSON_JSON_ERROR'
    throw parseErr
  }
}

export function clearLessonSearchCaches() {
  lessonByIdCache.clear()
  searchIndexCache = null
  searchIndexPromise = null
}

export function normalizeSearchQuery(query) {
  return String(query || '').trim().toLowerCase()
}

function searchRecordHaystack(record) {
  if (!record) return ''
  return [
    record.title,
    record.snippet,
    (record.section_titles || []).join(' '),
    (record.entity_names || []).join(' '),
    (record.key_points || []).join(' '),
    (record.playlist_labels || []).join(' '),
    (record.tags || []).join(' '),
    record.text,
  ].join(' ').toLowerCase()
}

export function scoreSearchRecord(record, query) {
  if (!query || !record) return 0
  const title = String(record.title || '').toLowerCase()
  const haystack = searchRecordHaystack(record)
  const names = (record.entity_names || []).map(function(n) { return String(n).toLowerCase() })
  const sections = (record.section_titles || []).map(function(n) { return String(n).toLowerCase() })
  let score = 0
  if (title === query) score += 100
  else if (title.indexOf(query) !== -1) score += 40
  if (haystack.indexOf(query) !== -1) score += 20
  names.forEach(function(name) {
    if (name === query) score += 50
    else if (name.indexOf(query) !== -1) score += 25
  })
  sections.forEach(function(name) {
    if (name.indexOf(query) !== -1) score += 15
  })
  if ((record.tags || []).join(' ').toLowerCase().indexOf(query) !== -1) score += 10
  return score
}

export function searchLessons(index, query, limit) {
  const q = normalizeSearchQuery(query)
  if (!q || !Array.isArray(index)) return []
  const max = typeof limit === 'number' ? limit : 30
  return index
    .map(function(record) {
      return { record: record, score: scoreSearchRecord(record, q) }
    })
    .filter(function(row) { return row.score > 0 })
    .sort(function(a, b) { return b.score - a.score })
    .slice(0, max)
    .map(function(row) { return row.record })
}

export async function loadLessonSearchIndex() {
  if (searchIndexCache) return searchIndexCache
  if (!searchIndexPromise) {
    searchIndexPromise = fetchLessonAssetJson(lessonAssetUrl('search-index.json'))
      .then(function(data) {
        searchIndexCache = Array.isArray(data) ? data : []
        return searchIndexCache
      })
      .catch(function(err) {
        searchIndexPromise = null
        throw err
      })
  }
  return searchIndexPromise
}

export async function loadLessonManifest() {
  return fetchLessonAssetJson(lessonAssetUrl('manifest.json'))
}

export async function loadLessonById(lessonId, options) {
  const id = String(lessonId || '').trim()
  if (!id) throw new Error('Lesson id is required')
  const bypassCache = !!(options && options.bypassCache)
  if (!bypassCache && lessonByIdCache.has(id)) {
    return lessonByIdCache.get(id)
  }

  const manifestEntry = options && options.manifestEntry
  const candidates = []
  if (manifestEntry && manifestEntry.path) {
    const region = options && options.region
    if (region) candidates.push(lessonAssetUrl(region + '/' + manifestEntry.path))
    candidates.push(lessonAssetUrl(manifestEntry.path))
  }
  candidates.push(lessonAssetUrl('ireland/' + id + '.json'))
  candidates.push(lessonAssetUrl(id + '.json'))

  let lastError = null
  let sawMissingAsset = false
  for (let i = 0; i < candidates.length; i += 1) {
    const url = candidates[i]
    try {
      const lesson = await fetchLessonAssetJson(url, { missingAsNotFound: true })
      if (!bypassCache) lessonByIdCache.set(id, lesson)
      return lesson
    } catch (err) {
      lastError = err
      if (err && (err.code === 'LESSON_ASSET_NOT_FOUND' || err.code === 'LESSON_HTTP_ERROR')) {
        sawMissingAsset = true
        continue
      }
      throw err
    }
  }
  if (sawMissingAsset) {
    throw new Error('Lesson data not found. ' + LESSON_EXPORT_HINT)
  }
  throw lastError || new Error('Lesson not found: ' + id)
}

export function findManifestLesson(manifest, lessonId) {
  const id = String(lessonId || '').trim()
  if (!id || !manifest) return null
  let found = null
  ;(manifest.tracks || []).forEach(function(track) {
    ;(track.units || []).forEach(function(unit) {
      ;(unit.lessons || []).forEach(function(lesson) {
        if (lesson && lesson.id === id) {
          found = Object.assign({}, lesson, {
            region: unit.region || lesson.region,
            unitId: unit.id,
          })
        }
      })
    })
    ;(track.lessons || []).forEach(function(lesson) {
      if (lesson && lesson.id === id) found = Object.assign({}, lesson)
    })
  })
  return found
}

export function flattenManifestLessons(manifest) {
  const out = []
  ;(manifest && manifest.tracks || []).forEach(function(track) {
    ;(track.units || []).forEach(function(unit) {
      ;(unit.lessons || []).forEach(function(lesson) {
        out.push(Object.assign({}, lesson, {
          trackId: track.id,
          trackLabel: track.label,
          unitId: unit.id,
          unitLabel: unit.label,
        }))
      })
    })
    ;(track.lessons || []).forEach(function(lesson) {
      out.push(Object.assign({}, lesson, {
        trackId: track.id,
        trackLabel: track.label,
      }))
    })
  })
  return out
}
