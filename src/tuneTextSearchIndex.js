/**
 * Inverted text search index for catalog rows.
 */
import localforage from 'localforage'
import { buildCatalogRowFromTune } from './tuneCatalogStore'

const tokenStore = localforage.createInstance({ name: 'tunesearch', storeName: 'tokens' })
const META_KEY = 'meta'

const COMMON_WORDS = {
  a: true, an: true, and: true, the: true, of: true, in: true, to: true, for: true,
}

function fold(text) {
  return String(text || '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ')
}

function tokenize(text) {
  const tokens = []
  fold(text).split(/\s+/).forEach(function(word) {
    if (word.length >= 3 && !COMMON_WORDS[word]) tokens.push(word)
  })
  return tokens
}

let memoryIndex = null

export async function loadTextSearchIndex() {
  if (memoryIndex) return memoryIndex
  const stored = await tokenStore.getItem('index')
  memoryIndex = stored && typeof stored === 'object' ? stored : {}
  return memoryIndex
}

async function saveTextSearchIndex(index) {
  memoryIndex = index
  await tokenStore.setItem('index', index)
  await tokenStore.setItem(META_KEY, { revision: Date.now() })
}

export async function indexCatalogRow(row) {
  if (!row || !row.id) return
  const index = await loadTextSearchIndex()
  const source = [row.name, (row.artists || []).join(' ')].join(' ')
  const tokens = tokenize(source)
  const id = String(row.id)
  Object.keys(index).forEach(function(token) {
    if (!Array.isArray(index[token])) return
    index[token] = index[token].filter(function(entryId) { return entryId !== id })
    if (index[token].length === 0) delete index[token]
  })
  tokens.forEach(function(token) {
    if (!Array.isArray(index[token])) index[token] = []
    if (index[token].indexOf(id) === -1) index[token].push(id)
  })
  await saveTextSearchIndex(index)
}

export async function indexTuneForSearch(tune) {
  const row = buildCatalogRowFromTune(tune)
  if (row) await indexCatalogRow(row)
}

export async function removeFromTextSearchIndex(tuneId) {
  if (tuneId == null) return
  const id = String(tuneId)
  const index = await loadTextSearchIndex()
  let changed = false
  Object.keys(index).forEach(function(token) {
    if (!Array.isArray(index[token])) return
    const next = index[token].filter(function(entryId) { return entryId !== id })
    if (next.length !== index[token].length) {
      changed = true
      if (next.length === 0) delete index[token]
      else index[token] = next
    }
  })
  if (changed) await saveTextSearchIndex(index)
}

export async function searchTextIndex(query) {
  const parts = tokenize(query)
  if (parts.length === 0) return null
  const index = await loadTextSearchIndex()
  const counts = {}
  parts.forEach(function(part) {
    (index[part] || []).forEach(function(id) {
      counts[id] = (counts[id] || 0) + 1
    })
  })
  const ids = Object.keys(counts)
  ids.sort(function(a, b) { return (counts[b] || 0) - (counts[a] || 0) })
  return ids
}

export async function rebuildTextSearchIndexFromTunes(tunes) {
  const index = {}
  const list = tunes && typeof tunes === 'object' ? Object.values(tunes) : []
  list.forEach(function(tune) {
    const row = buildCatalogRowFromTune(tune)
    if (!row) return
    const tokens = tokenize([row.name, (row.artists || []).join(' ')].join(' '))
    const id = String(row.id)
    tokens.forEach(function(token) {
      if (!Array.isArray(index[token])) index[token] = []
      if (index[token].indexOf(id) === -1) index[token].push(id)
    })
  })
  await saveTextSearchIndex(index)
  return index
}

export function invalidateTextSearchCache() {
  memoryIndex = null
}
