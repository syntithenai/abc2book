import utilsFunctions from './utilsFunctions'
import { allArtists, allTitles } from './tuneBibliographicUtils'
import { extractSheetMetadataFile } from './sheetImageMetadataClient'
import {
  composerHintFromFile,
  extractPdfPageTexts,
} from './pdfSheetImportUtils'
import {
  findTuneFileMeta,
  getTuneFiles,
  isPdfTuneFileType,
  normalizePdfSegments,
  updateTuneFileMeta,
} from './tuneFiles'
import { dedupeTunesById } from './tuneListFilter'
import {
  matchesMainSearchText,
  textMatchesSearchTokens,
  tokenizeMainSearchQuery,
} from './searchTextUtils'

const utils = utilsFunctions()

function normalizeFilterText(filterText) {
  return utils.toSearchText(String(filterText || '').trim())
}

export function applyPdfSegmentsToTuneFile(tune, fileId, segments) {
  const normalized = normalizePdfSegments(segments)
  if (!normalized.length) return tune
  return updateTuneFileMeta(tune, fileId, { pdfSegments: normalized })
}

export async function extractPdfSegmentsFromBlob(file, options) {
  const opts = options || {}
  const composerHint = opts.composerHint || composerHintFromFile(file)
  if (opts.resolverAvailable) {
    try {
      const body = await extractSheetMetadataFile({
        file: file,
        accessToken: opts.accessToken,
        composerHint: composerHint,
      })
      const segments = (body.segments || []).filter(function(segment) {
        return !!(segment && segment.title)
      })
      if (segments.length) return segments
    } catch (e) {
      // fall through to client extraction
    }
  }
  const local = await extractPdfPageTexts(file)
  return (local.segments || []).map(function(segment) {
    return {
      page: Number(segment && segment.page) || 1,
      endPage: Number(segment && segment.endPage) || Number(segment && segment.page) || 1,
      title: String(segment && segment.title || '').trim(),
      composer: String(segment && (segment.composer || segment.artist) || '').trim(),
    }
  }).filter(function(segment) {
    return !!segment.title
  })
}

export async function indexPdfTuneFile(tune, fileId, blob, options) {
  const opts = options || {}
  const fileName = opts.fileName || 'sheet.pdf'
  const file = blob instanceof File
    ? blob
    : new File([blob], fileName, { type: opts.type || 'application/pdf' })
  const segments = await extractPdfSegmentsFromBlob(file, opts)
  return applyPdfSegmentsToTuneFile(tune, fileId, segments)
}

export function listPdfSnapshotSegments(tune) {
  const results = []
  getTuneFiles(tune).forEach(function(meta) {
    if (!meta || !isPdfTuneFileType(meta.type)) return
    const segments = normalizePdfSegments(meta.pdfSegments)
    segments.forEach(function(segment) {
      results.push({
        title: segment.title,
        page: segment.page,
        endPage: segment.endPage,
        composer: segment.composer,
        fileId: meta.id,
        parentTune: tune,
        matchKind: 'segment',
      })
    })
  })
  return results
}

function listPdfFileNameSearchHits(tune, tokens) {
  const hits = []
  getTuneFiles(tune).forEach(function(meta) {
    if (!meta || !isPdfTuneFileType(meta.type)) return
    const name = String(meta.name || '').trim()
    const nameKey = normalizeFilterText(name)
    if (!nameKey || !textMatchesSearchTokens([nameKey], tokens)) return
    const page = meta.pdfPage > 0 ? parseInt(meta.pdfPage, 10) : 1
    hits.push({
      title: name || 'PDF',
      page: page,
      endPage: page,
      composer: '',
      fileId: meta.id,
      parentTune: tune,
      matchKind: 'fileName',
    })
  })
  return hits
}

function pushUniquePdfSearchHit(hits, seen, hit) {
  const key = [
    hit.fileId || '',
    hit.matchKind || 'segment',
    hit.page || 0,
    hit.title || '',
  ].join(':')
  if (seen.has(key)) return
  seen.add(key)
  hits.push(hit)
}

export function pdfSnapshotSearchHits(tune, filterText) {
  const tokens = tokenizeMainSearchQuery(filterText)
  if (tokens.length === 0 || !tune) return []
  const hits = []
  const seen = new Set()
  listPdfSnapshotSegments(tune).forEach(function(segment) {
    const titleKey = normalizeFilterText(segment.title)
    const composerKey = normalizeFilterText(segment.composer)
    const haystack = [titleKey, composerKey].filter(Boolean)
    if (textMatchesSearchTokens(haystack, tokens)) {
      pushUniquePdfSearchHit(hits, seen, segment)
    }
  })
  listPdfFileNameSearchHits(tune, tokens).forEach(function(hit) {
    pushUniquePdfSearchHit(hits, seen, hit)
  })
  return hits
}

export function tuneMatchesPdfSnapshotSearch(tune, filterText) {
  return pdfSnapshotSearchHits(tune, filterText).length > 0
}

export function parentTuneMatchesSearch(tune, filterText) {
  if (!tune) return false
  const searchableText = allTitles(tune).concat(allArtists(tune))
  return matchesMainSearchText(searchableText, filterText)
}

export function expandPdfSnapshotSearchRows(tunes, filterText) {
  const filter = String(filterText || '').trim()
  const tokens = tokenizeMainSearchQuery(filterText)
  const list = dedupeTunesById(Array.isArray(tunes) ? tunes : [])
  if (!filter || tokens.length === 0) {
    return list.map(function(tune) {
      return { tune: tune, snapshotMatch: null }
    })
  }
  const rows = []
  list.forEach(function(tune) {
    const parentMatch = parentTuneMatchesSearch(tune, filter)
    const hits = pdfSnapshotSearchHits(tune, filter)
    const row = bestPdfSnapshotSearchRow(tune, parentMatch, hits)
    if (row) rows.push(row)
  })
  return rows
}

function bestPdfSnapshotSearchRow(tune, parentMatch, hits) {
  if (!tune) return null
  if (parentMatch) {
    return { tune: tune, snapshotMatch: null }
  }
  if (hits.length > 0) {
    return { tune: tune, snapshotMatch: hits[0] }
  }
  return null
}

export function displayTitleForSearchRow(row) {
  if (!row || !row.tune) return 'Untitled Song'
  if (row.snapshotMatch && row.snapshotMatch.title) return row.snapshotMatch.title
  const name = row.tune.name && String(row.tune.name).trim()
  return name || 'Untitled Song'
}

export function buildSnapshotTuneLink(tuneId, snapshotMatch) {
  const base = '/tunes/' + encodeURIComponent(tuneId)
  if (!snapshotMatch || !snapshotMatch.fileId || !snapshotMatch.page) return base
  const params = new URLSearchParams()
  params.set('file', snapshotMatch.fileId)
  params.set('page', String(snapshotMatch.page))
  return base + '?' + params.toString()
}

export function tuneFileNeedsPdfIndexing(meta) {
  if (!meta || !isPdfTuneFileType(meta.type)) return false
  const segments = normalizePdfSegments(meta.pdfSegments)
  return segments.length === 0
}

export function findTuneFileMetaById(tune, fileId) {
  return findTuneFileMeta(tune, fileId)
}
