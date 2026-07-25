import { getRecentTunes, RECENT_TUNES_DEFAULT } from './recentTunes'
import { isNotationBarPickerMode } from './scratchpadAssociate'

const STORAGE_KEY = 'bookstorage_scratchpad_associate_recent'
const MAX_ENTRIES = 24

const MODE_LABELS = {
  'notation': 'Notation',
  'notation:merge': 'Merged',
  'notation:insert': 'Inserted',
  'notation:replace': 'Replaced',
  'notation-merge': 'Merged',
  'notation-insert': 'Inserted',
  'notation-replace': 'Replaced',
  'midi': 'MIDI link',
  'lyrics': 'Lyrics',
  'background': 'Background',
  'snapshot': 'Snapshot',
  'media': 'Audio',
}

function readEntries() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch (e) {
    return []
  }
}

function writeEntries(entries) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries || []))
  } catch (e) {
    // ignore quota errors
  }
}

export function labelForAssociateMode(mode) {
  const key = String(mode || '').trim()
  if (MODE_LABELS[key]) return MODE_LABELS[key]
  if (key.indexOf('notation:') === 0) return MODE_LABELS[key] || 'Notation'
  return 'Recent'
}

function modesMatchForSuggestions(filterMode, entryMode) {
  if (!filterMode) return true
  if (entryMode === filterMode) return true
  if (!isNotationBarPickerMode(filterMode)) return false
  return isNotationBarPickerMode(entryMode) || String(entryMode || '').indexOf('notation:') === 0
}

export function recordScratchpadAssociateTarget(tuneId, tuneName, associateMode) {
  const id = String(tuneId || '').trim()
  if (!id) return
  const mode = String(associateMode || '').trim()
  const entries = readEntries().filter(function(entry) {
    return !(entry && entry.tuneId === id && entry.mode === mode)
  })
  entries.unshift({
    tuneId: id,
    tuneName: String(tuneName || '').trim(),
    mode: mode,
    at: Date.now(),
  })
  writeEntries(entries.slice(0, MAX_ENTRIES))
}

export function getScratchpadAssociateRecentEntries(associateMode, limit) {
  const max = typeof limit === 'number' && limit > 0 ? limit : 12
  const mode = String(associateMode || '').trim()
  const entries = readEntries()
  return entries.filter(function(entry) {
    if (!entry || !entry.tuneId) return false
    if (!mode) return true
    return modesMatchForSuggestions(mode, entry.mode)
  }).slice(0, max)
}

/**
 * @returns {Array<{ tune: object, reason: string }>}
 */
export function getScratchpadAssociateSuggestions(tunes, options) {
  const opts = options || {}
  const associateMode = opts.associateMode || ''
  const linkedTuneId = opts.linkedTuneId || ''
  const limit = typeof opts.limit === 'number' && opts.limit > 0 ? opts.limit : 10
  const seen = {}
  const suggestions = []

  function addTune(tune, reason) {
    if (!tune || !tune.id || seen[tune.id]) return
    if (!tunes || !tunes[tune.id]) return
    seen[tune.id] = true
    suggestions.push({ tune: tunes[tune.id], reason: reason || 'Recent' })
  }

  if (linkedTuneId && tunes[linkedTuneId]) {
    addTune(tunes[linkedTuneId], 'Linked')
  }

  getScratchpadAssociateRecentEntries(associateMode, MAX_ENTRIES).forEach(function(entry) {
    const tune = tunes[entry.tuneId]
    if (!tune) return
    addTune(tune, labelForAssociateMode(entry.mode))
  })

  getRecentTunes(tunes, RECENT_TUNES_DEFAULT).forEach(function(tune) {
    addTune(tune, 'Recent')
  })

  return suggestions.slice(0, limit)
}
