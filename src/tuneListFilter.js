import {
  LIST_PROTECTION_LIMIT,
  PREVIEW_LIST_LIMIT,
  FILTER_STATUS_CHUNK_SIZE,
  FILTER_MUSICAL_STATUS_CHUNK_SIZE,
  LARGE_LIST_WARNING_THRESHOLD,
  LARGE_BOOK_INDEX_THRESHOLD,
  CATALOG_PAGE_SIZE,
  BULK_SELECTION_LIMIT,
} from './tuneScaleConstants'
import { resolveCandidateTuneIds } from './tuneCandidateFilter'
import { isCatalogStorageEnabled } from './tuneStorageFlags'
import { listCatalogPage, getTune } from './tuneRepository'
import { hasLyricEmbeddedChords } from './chordSheetUtils'
import { getLyricLines } from './wLinesUtils'
import { scanTuneMusicalIssueStatus } from './tuneListMusicalStatus'
import { attachMediaCacheFlags, emptyTuneMediaLinkStatus, scanTuneMediaLinkStatus } from './tuneListMediaStatus'

import { isCapacitorNative } from './platformUtils'

export const GROUP_BY_TUNE_STATUS = 'tuneStatus'
export const GROUP_BY_TUNE_STATUS_DETAILED = 'tuneStatusDetailed'

export {
  LIST_PROTECTION_LIMIT,
  PREVIEW_LIST_LIMIT,
  FILTER_STATUS_CHUNK_SIZE,
  FILTER_MUSICAL_STATUS_CHUNK_SIZE,
  LARGE_LIST_WARNING_THRESHOLD,
  CATALOG_PAGE_SIZE,
  BULK_SELECTION_LIMIT,
}

export function yieldToMain() {
  return new Promise(function(resolve) {
    setTimeout(resolve, isCapacitorNative() ? 32 : 0)
  })
}

function compareTuneNames(a, b) {
  const nameA = a && a.name ? a.name.toLowerCase().trim() : ''
  const nameB = b && b.name ? b.name.toLowerCase().trim() : ''
  return nameA < nameB ? -1 : 1
}

export function filterTunes(tunes, filterSearchFn, candidateIds) {
  if (!tunes || typeof tunes !== 'object') return []
  const seen = {}
  const result = []
  const ids = Array.isArray(candidateIds) ? candidateIds : null

  function consider(tune) {
    if (!tune || tune.id == null) return
    if (seen[tune.id]) return
    seen[tune.id] = true
    if (filterSearchFn(tune)) result.push(tune)
  }

  if (ids) {
    ids.forEach(function(tuneId) {
      const tune = tunes[tuneId] || tunes[String(tuneId)]
      consider(tune)
    })
    return result
  }

  Object.values(tunes).forEach(consider)
  return result
}

export function dedupeTunesById(tunes) {
  const list = Array.isArray(tunes) ? tunes : Object.values(tunes || {})
  const byId = {}
  const order = []
  list.forEach(function(tune) {
    if (!tune || tune.id == null) return
    const key = String(tune.id)
    if (!byId[key]) order.push(key)
    byId[key] = tune
  })
  return order.map(function(key) { return byId[key] })
}

export function sortTunesByName(tunes) {
  const list = Array.isArray(tunes) ? tunes.slice() : []
  list.sort(compareTuneNames)
  return list
}

export function filterSearchNoBooks(tune) {
  if ((tune && Array.isArray(tune.books) && tune.books.length > 0)
    || (tune && Array.isArray(tune.tags) && tune.tags.length > 0)) {
    return false
  }
  return true
}

function scanTuneNoteStatus(tune) {
  var hasNotes = false
  var hasChords = false
  if (tune && tune.voices) {
    Object.values(tune.voices).forEach(function(voice) {
      if (!Array.isArray(voice.notes)) return
      for (var i = 0; i < voice.notes.length; i += 1) {
        if (!voice.notes[i]) continue
        if (voice.notes[i].replaceAll('z', '').replaceAll('|', '').split('"').filter(function(a, ak) {
          return (ak % 2 === 0)
        }).join('').trim().length > 0) {
          hasNotes = true
        }
        if (voice.notes[i].indexOf('"') !== -1) {
          hasChords = true
        }
        if (hasNotes && hasChords) break
      }
    })
  }
  return { hasNotes: hasNotes, hasChords: hasChords }
}

function scanTuneInlineChords(tune) {
  return hasLyricEmbeddedChords(getLyricLines(tune))
}

export function shouldScanTuneStatusExtras(options) {
  const opts = options || {}
  if (opts.includeExtras === false) return false
  if (opts.includeExtras === true) return true
  if (opts.groupBy === GROUP_BY_TUNE_STATUS_DETAILED) return true
  const mode = opts.listDisplayMode
  return mode === 'detailed' || mode === 'preview'
}

export function shouldScanTuneMusicalStatus(options, filteredLength) {
  if (!shouldScanTuneStatusExtras(options)) return false
  const len = typeof filteredLength === 'number' ? filteredLength : 0
  return len < LIST_PROTECTION_LIMIT
}

export function buildTuneStatusGroupKey(status, detailed) {
  const flags = status || {}
  const tuneStatusKey = []
  if (flags.hasLyrics) tuneStatusKey.push('lyrics')
  if (flags.hasNotes) tuneStatusKey.push('notes')
  if (flags.hasChords) tuneStatusKey.push('chords')
  if (detailed && flags.hasInlineChords) tuneStatusKey.push('inline')
  if (flags.hasLinks) tuneStatusKey.push('media')
  if (detailed) {
    if (flags.hasMusicalErrors) tuneStatusKey.push('errors')
    else if (flags.hasMusicalWarnings) tuneStatusKey.push('warnings')
  }
  return tuneStatusKey.join(',')
}

export function buildTuneStatusEntry(tune, tunebook, options) {
  if (!tune || !tune.id) return null
  const opts = options || {}
  const noteStatus = scanTuneNoteStatus(tune)
  const hasLyrics = tunebook && typeof tunebook.hasLyrics === 'function' ? tunebook.hasLyrics(tune) : false
  const hasLinks = tunebook && typeof tunebook.hasLinks === 'function' ? tunebook.hasLinks(tune) : false
  const includeExtras = !!opts.includeExtras
  const includeMusical = includeExtras && opts.includeMusical !== false
  let hasInlineChords = false
  if (includeExtras) {
    hasInlineChords = scanTuneInlineChords(tune)
  }
  let hasMusicalErrors = false
  let hasMusicalWarnings = false
  if (includeMusical) {
    const abcTools = opts.abcTools || (tunebook && tunebook.abcTools) || null
    const musical = scanTuneMusicalIssueStatus(tune, { abcTools: abcTools })
    hasMusicalErrors = musical.hasMusicalErrors
    hasMusicalWarnings = musical.hasMusicalWarnings
  }
  const isYoutubeLink = tunebook && tunebook.utils && typeof tunebook.utils.isYoutubeLink === 'function'
    ? tunebook.utils.isYoutubeLink
    : null
  const media = includeExtras
    ? scanTuneMediaLinkStatus(tune, isYoutubeLink)
    : emptyTuneMediaLinkStatus()
  return {
    hasLyrics: hasLyrics,
    hasNotes: noteStatus.hasNotes,
    hasChords: noteStatus.hasChords,
    hasLinks: hasLinks,
    hasInlineChords: hasInlineChords,
    hasMusicalErrors: hasMusicalErrors,
    hasMusicalWarnings: hasMusicalWarnings,
    hasMidi: media.hasMidi,
    hasYoutube: media.hasYoutube,
    hasRecording: media.hasRecording,
    mediaSource: media.mediaSource,
    driveStatus: media.driveStatus,
    hasOwnedMedia: media.hasOwnedMedia,
    hasCachedMedia: media.hasCachedMedia,
    hasStems: media.hasStems,
    mediaCacheScanned: media.mediaCacheScanned,
    extrasScanned: includeExtras,
    musicalScanned: includeMusical,
  }
}

export function buildTagCollation(filteredTunes) {
  const tc = {}
  ;(filteredTunes || []).forEach(function(tune) {
    if (!Array.isArray(tune.tags)) return
    tune.tags.forEach(function(tag) {
      tc[tag] = true
    })
  })
  return tc
}

export function buildTuneStatusGroups(filteredTunes, tuneStatus, options) {
  const detailed = !!(options && options.detailed)
  const tuneStatusGroups = {}
  ;(filteredTunes || []).forEach(function(tune, tuneKey) {
    if (!tune || !tune.id) return
    const key = buildTuneStatusGroupKey(tuneStatus[tune.id] || {}, detailed)
    if (!tuneStatusGroups.hasOwnProperty(key)) tuneStatusGroups[key] = []
    tuneStatusGroups[key].push(tuneKey)
  })
  return tuneStatusGroups
}

export function buildGroupedTunes(filteredTunes, groupBy, tunebook, tuneStatus) {
  if (!groupBy || !Array.isArray(filteredTunes) || filteredTunes.length >= LIST_PROTECTION_LIMIT * 5) {
    return null
  }
  if (groupBy === GROUP_BY_TUNE_STATUS) {
    return buildTuneStatusGroups(filteredTunes, tuneStatus)
  }
  if (groupBy === GROUP_BY_TUNE_STATUS_DETAILED) {
    return buildTuneStatusGroups(filteredTunes, tuneStatus, { detailed: true })
  }
  if (tunebook && typeof tunebook.groupTunes === 'function') {
    return tunebook.groupTunes(filteredTunes, groupBy)
  }
  return null
}

function statusEntryOptions(opts) {
  return {
    includeExtras: !!opts.includeExtras,
    includeMusical: opts.includeMusical !== false && !!opts.includeExtras,
    abcTools: opts.abcTools,
  }
}

export async function buildTuneStatusMetadata(filteredTunes, tunebook, options) {
  const opts = options || {}
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : function() { return false }
  const includeExtras = !!opts.includeExtras
  const includeMusical = includeExtras && opts.includeMusical !== false
  const chunkSize = opts.chunkSize > 0
    ? opts.chunkSize
    : (includeMusical ? FILTER_MUSICAL_STATUS_CHUNK_SIZE : FILTER_STATUS_CHUNK_SIZE)
  const entryOpts = statusEntryOptions({
    includeExtras: includeExtras,
    includeMusical: includeMusical,
    abcTools: opts.abcTools || (tunebook && tunebook.abcTools) || null,
  })
  const tuneStatus = {}
  let anyTunesHaveNotes = false
  let anyTunesHaveLinks = false

  if (!Array.isArray(filteredTunes) || filteredTunes.length >= LIST_PROTECTION_LIMIT * 5) {
    return { tuneStatus: tuneStatus, anyTunesHaveNotes: false, anyTunesHaveLinks: false }
  }

  for (let start = 0; start < filteredTunes.length; start += chunkSize) {
    if (shouldCancel()) return null
    const end = Math.min(start + chunkSize, filteredTunes.length)
    for (let i = start; i < end; i += 1) {
      const tune = filteredTunes[i]
      if (!tune || !tune.id) continue
      const entry = buildTuneStatusEntry(tune, tunebook, entryOpts)
      if (!entry) continue
      tuneStatus[tune.id] = entry
      if (entry.hasNotes) anyTunesHaveNotes = true
      if (entry.hasLinks) anyTunesHaveLinks = true
    }
    if (end < filteredTunes.length) {
      await yieldToMain()
      if (shouldCancel()) return null
    }
  }

  let nextStatus = tuneStatus
  if (includeExtras && opts.includeMediaCache !== false) {
    nextStatus = await attachMediaCacheFlags(tuneStatus, shouldCancel)
    if (!nextStatus) return null
  }

  return { tuneStatus: nextStatus, anyTunesHaveNotes: anyTunesHaveNotes, anyTunesHaveLinks: anyTunesHaveLinks }
}

function statusNeedsFill(existing, includeExtras, includeMusical) {
  if (!existing) return true
  if (includeExtras && !existing.extrasScanned) return true
  if (includeMusical && !existing.musicalScanned) return true
  return false
}

export async function fillMissingTuneStatusEntries(tuneList, prevStatus, tunebook, options) {
  const opts = options || {}
  const shouldCancel = typeof opts.shouldCancel === 'function' ? opts.shouldCancel : function() { return false }
  const includeExtras = opts.includeExtras !== false
  const includeMusical = includeExtras && opts.includeMusical !== false
  const chunkSize = opts.chunkSize > 0
    ? opts.chunkSize
    : (includeMusical ? FILTER_MUSICAL_STATUS_CHUNK_SIZE : FILTER_STATUS_CHUNK_SIZE)
  const entryOpts = statusEntryOptions({
    includeExtras: includeExtras,
    includeMusical: includeMusical,
    abcTools: opts.abcTools || (tunebook && tunebook.abcTools) || null,
  })
  const list = Array.isArray(tuneList) ? tuneList : []
  const toFill = []
  list.forEach(function(tune) {
    if (!tune || !tune.id) return
    if (statusNeedsFill(prevStatus && prevStatus[tune.id], includeExtras, includeMusical)) {
      toFill.push(tune)
    }
  })
  let nextStatus = Object.assign({}, prevStatus || {})
  if (toFill.length > 0) {
    for (let start = 0; start < toFill.length; start += chunkSize) {
      if (shouldCancel()) return null
      const end = Math.min(start + chunkSize, toFill.length)
      for (let i = start; i < end; i += 1) {
        const tune = toFill[i]
        const entry = buildTuneStatusEntry(tune, tunebook, entryOpts)
        if (!entry) continue
        nextStatus[tune.id] = entry
      }
      if (end < toFill.length) {
        await yieldToMain()
        if (shouldCancel()) return null
      }
    }
  }
  if (includeExtras) {
    const withCache = await attachMediaCacheFlags(nextStatus, shouldCancel)
    if (!withCache) return null
    if (toFill.length === 0 && withCache === nextStatus) return null
    return withCache
  }
  if (toFill.length === 0) return null
  return nextStatus
}

export async function runTuneListFilterAsync(params) {
  const {
    tunes,
    filterSearchFn,
    groupBy,
    tunebook,
    shouldCancel,
    indexes,
    filterContext,
    listDisplayMode,
    includeExtras,
  } = params || {}

  if (shouldCancel && shouldCancel()) return null

  let filtered
  let listPage = null
  const monolithIds = tunes && typeof tunes === 'object' ? Object.keys(tunes) : []
  // Prefer the hydrated in-memory monolith for text search. Catalog row metadata can lag
  // behind edits because not every save path used to update IndexedDB catalog rows.
  if (isCatalogStorageEnabled() && filterContext && monolithIds.length === 0) {
    const catalogContext = Object.assign({}, filterContext, {
      textFilter: filterContext.textFilter || filterContext.filter || '',
    })
    const page = await listCatalogPage(catalogContext, { offset: 0, limit: 10000 })
    const candidateIds = page.ids || (page.rows || []).map(function(r) { return r.id })
    const catalogTunes = []
    for (let i = 0; i < candidateIds.length; i += 1) {
      if (shouldCancel && shouldCancel()) return null
      const tune = await getTune(candidateIds[i])
      if (tune && filterSearchFn(tune)) catalogTunes.push(tune)
      if (i > 0 && i % 50 === 0) await yieldToMain()
    }
    filtered = sortTunesByName(catalogTunes)
    listPage = {
      total: filtered.length,
      offset: 0,
      limit: CATALOG_PAGE_SIZE,
      ids: filtered.map(function(t) { return t.id }),
    }
  } else {
    const allIds = tunes ? Object.keys(tunes) : []
    const candidateIds = resolveCandidateTuneIds(filterContext, indexes, allIds)
    filtered = sortTunesByName(filterTunes(tunes, filterSearchFn, candidateIds))
    if (filtered.length > CATALOG_PAGE_SIZE) {
      listPage = {
        total: filtered.length,
        offset: 0,
        limit: CATALOG_PAGE_SIZE,
        ids: filtered.map(function(t) { return t.id }),
      }
    }
  }
  const tagCollation = buildTagCollation(filtered)
  const extras = shouldScanTuneStatusExtras({
    groupBy: groupBy,
    listDisplayMode: listDisplayMode,
    includeExtras: includeExtras,
  })
  const musical = extras && shouldScanTuneMusicalStatus({
    groupBy: groupBy,
    listDisplayMode: listDisplayMode,
    includeExtras: includeExtras,
  }, filtered.length)
  const statusResult = await buildTuneStatusMetadata(filtered, tunebook, {
    shouldCancel: shouldCancel,
    includeExtras: extras,
    includeMusical: musical,
    includeMediaCache: listDisplayMode === 'detailed' || listDisplayMode === 'preview',
  })
  if (!statusResult) return null

  const grouped = buildGroupedTunes(filtered, groupBy, tunebook, statusResult.tuneStatus)

  return {
    filtered: filtered,
    grouped: grouped,
    tuneStatus: statusResult.tuneStatus,
    tagCollation: tagCollation,
    listPage: listPage,
  }
}

export function runTuneListFilterSync(params) {
  const {
    tunes,
    filterSearchFn,
    groupBy,
    tunebook,
    indexes,
    filterContext,
    listDisplayMode,
    includeExtras,
  } = params || {}

  const allIds = tunes ? Object.keys(tunes) : []
  const candidateIds = resolveCandidateTuneIds(filterContext, indexes, allIds)
  const filtered = sortTunesByName(filterTunes(tunes, filterSearchFn, candidateIds))
  const tagCollation = buildTagCollation(filtered)
  const extras = shouldScanTuneStatusExtras({
    groupBy: groupBy,
    listDisplayMode: listDisplayMode,
    includeExtras: includeExtras,
  })
  const musical = extras && shouldScanTuneMusicalStatus({
    groupBy: groupBy,
    listDisplayMode: listDisplayMode,
    includeExtras: includeExtras,
  }, filtered.length)
  const entryOpts = {
    includeExtras: extras,
    includeMusical: musical,
  }
  const tuneStatus = {}
  if (Array.isArray(filtered) && filtered.length < LIST_PROTECTION_LIMIT * 5) {
    filtered.forEach(function(tune) {
      if (!tune || !tune.id) return
      const entry = buildTuneStatusEntry(tune, tunebook, entryOpts)
      if (entry) tuneStatus[tune.id] = entry
    })
  }
  const grouped = buildGroupedTunes(filtered, groupBy, tunebook, tuneStatus)
  return {
    filtered: filtered,
    grouped: grouped,
    tuneStatus: tuneStatus,
    tagCollation: tagCollation,
  }
}

/** Drop selections for tunes no longer in the current filtered list. */
export function pruneSelectionForStatus(selected, filteredTunes) {
  const next = Object.assign({}, selected || {})
  const visibleIds = {}
  const list = Array.isArray(filteredTunes) ? filteredTunes : []
  list.forEach(function(tune) {
    if (tune && tune.id) visibleIds[tune.id] = true
  })
  let count = 0
  Object.keys(next).forEach(function(tuneId) {
    if (!visibleIds[tuneId]) {
      next[tuneId] = false
    } else if (next[tuneId]) {
      count += 1
    }
  })
  return { selected: next, selectedCount: count }
}

export function buildListHashKey(parts) {
  return JSON.stringify(parts)
}

/**
 * True when list membership inputs are unchanged and a full refilter can be
 * skipped after an in-place tune edit (star, boost, and similar).
 * Starred-only lists still refilter because starring changes membership.
 */
export function shouldSkipListRebuildForTuneEdit(prevIdentity, nextIdentity, starredFilter) {
  if (prevIdentity == null || nextIdentity == null) return false
  if (prevIdentity !== nextIdentity) return false
  return !starredFilter
}
