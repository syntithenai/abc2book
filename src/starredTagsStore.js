/**
 * Starred tags for the Books page (local only; not synced with tune.starred).
 * Newest starred tags are kept at the front of the list.
 */

export const STARRED_TAGS_STORAGE_KEY = 'bookstorage_starred_tags'

function normalizeTag(tag) {
  if (tag == null) return ''
  return String(tag).trim()
}

function readList() {
  try {
    var raw = localStorage.getItem(STARRED_TAGS_STORAGE_KEY)
    if (!raw) return []
    var parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    var seen = {}
    var out = []
    parsed.forEach(function(entry) {
      var tag = normalizeTag(entry)
      if (!tag) return
      var key = tag.toLowerCase()
      if (seen[key]) return
      seen[key] = true
      out.push(tag)
    })
    return out
  } catch (e) {
    return []
  }
}

function writeList(list) {
  try {
    localStorage.setItem(STARRED_TAGS_STORAGE_KEY, JSON.stringify(list || []))
  } catch (e) {
    // ignore quota / private mode
  }
}

export function getStarredTags() {
  return readList()
}

export function isTagStarred(tag) {
  var needle = normalizeTag(tag).toLowerCase()
  if (!needle) return false
  return readList().some(function(entry) {
    return entry.toLowerCase() === needle
  })
}

export function setTagStarred(tag, starred) {
  var name = normalizeTag(tag)
  if (!name) return getStarredTags()
  var key = name.toLowerCase()
  var current = readList()
  var without = current.filter(function(entry) {
    return entry.toLowerCase() !== key
  })
  var next = starred ? [name].concat(without) : without
  writeList(next)
  return next
}

export function toggleTagStarred(tag) {
  var nextStarred = !isTagStarred(tag)
  setTagStarred(tag, nextStarred)
  return nextStarred
}
