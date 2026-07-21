import { isSheetImageImportFile } from './importSourceParse'
import { extractSheetMetadataFile, probeSheetMetadataEndpoint } from './sheetImageMetadataClient'
import { normalizeAccessToken } from './mediaProxyClient'
import {
  composerHintFromFile,
  createSheetSnapshotCandidate,
  extractPdfPageTexts,
  fallbackTitleComposerFromFile,
  segmentMetadataPages,
} from './pdfSheetImportUtils'

let resolverMetadataUnavailable = false
let resolverMetadataUnavailableReason = ''

function isPdfFile(file) {
  if (!file) return false
  const name = String(file.name || '').toLowerCase()
  const type = String(file.type || '').toLowerCase()
  return type === 'application/pdf' || name.endsWith('.pdf')
}

function isResolverMetadataUnavailableError(error) {
  const message = String(error && error.message || '')
  return message.indexOf('Media proxy error 401') >= 0
    || message.indexOf('Bearer token') >= 0
    || message.indexOf('login_required') >= 0
    || message.indexOf('Media proxy error 404') >= 0
    || message.indexOf('Media proxy error 405') >= 0
    || message.indexOf('Media proxy error 500') >= 0
    || message.indexOf('unreadable metadata response') >= 0
    || message.indexOf('Sheet metadata extraction failed') >= 0
    || message.indexOf('No module named') >= 0
}

function resolverMetadataUnavailableReasonFromError(error) {
  const message = String(error && error.message || '')
  if (message.indexOf('401') >= 0
    || message.indexOf('Bearer token') >= 0
    || message.indexOf('login_required') >= 0) {
    return 'Log in with Google to read titles from scanned sheet music. Titles will come from filenames and folder names until you log in.'
  }
  return message
}

function metadataHasReadableTitle(metadata) {
  const segments = metadata && metadata.segments
  if (!Array.isArray(segments)) return false
  return segments.some(function(segment) {
    return !!String(segment && segment.title || '').trim()
  })
}

function metadataUsedCloudOcr(metadata) {
  const warnings = metadata && metadata.warnings
  return Array.isArray(warnings) && warnings.indexOf('cloud_title_ocr') >= 0
}

function titleSourceForMetadata(metadata) {
  if (metadataHasReadableTitle(metadata)) {
    return metadataUsedCloudOcr(metadata) ? 'cloud-ocr' : 'ocr'
  }
  return 'filename'
}

function fallbackMetadata(file, composerHint) {
  const fallback = fallbackTitleComposerFromFile(file, composerHint)
  return {
    numPages: 1,
    segments: [{
      page: 1,
      endPage: 1,
      title: fallback.title,
      composer: fallback.composer || composerHint,
    }],
    pageTitles: [],
    titleSource: 'filename',
  }
}

function reportProgress(options, payload) {
  if (typeof options.onProgress === 'function') {
    options.onProgress(payload)
  }
}

async function ensureMetadataSupport(options) {
  if (!options.resolverAvailable || !options.sheetImageOcr) {
    return {
      ok: false,
      reason: options.resolverAvailable
        ? 'Sheet OCR is not enabled on the media resolver.'
        : 'Media resolver is not available.',
    }
  }
  if (options.requireAuth && !normalizeAccessToken(options.accessToken)) {
    return {
      ok: false,
      reason: 'Log in with Google to read titles from scanned sheet music. Titles will come from filenames and folder names until you log in.',
    }
  }
  if (resolverMetadataUnavailable) {
    return {
      ok: false,
      reason: resolverMetadataUnavailableReason || 'Sheet metadata extraction is unavailable.',
    }
  }
  if (options.metadataSupport) {
    return options.metadataSupport
  }
  const support = await probeSheetMetadataEndpoint({
    resolverAvailable: options.resolverAvailable,
    accessToken: options.accessToken,
  })
  if (!support.ok) {
    resolverMetadataUnavailable = true
    resolverMetadataUnavailableReason = support.reason || ''
  }
  return support
}

async function metadataForFile(file, options) {
  const composerHint = options.composerHint || composerHintFromFile(file)
  if (options.metadataSupport && options.metadataSupport.ok) {
    try {
      const body = await extractSheetMetadataFile({
        file: file,
        accessToken: options.accessToken,
        composerHint: composerHint,
      })
      return Object.assign({}, body, {
        titleSource: titleSourceForMetadata(body),
      })
    } catch (e) {
      if (isResolverMetadataUnavailableError(e)) {
        resolverMetadataUnavailable = true
        resolverMetadataUnavailableReason = resolverMetadataUnavailableReasonFromError(e)
      }
      if (!isPdfFile(file)) throw e
      return fallbackMetadata(file, composerHint)
    }
  }
  if (isPdfFile(file) && !options.resolverAvailable) {
    try {
      const local = await extractPdfPageTexts(file)
      const segments = local.segments && local.segments.length
        ? local.segments
        : segmentMetadataPages(local.pageTitles)
      if (segments.length && metadataHasReadableTitle({ segments: segments })) {
        return {
          numPages: local.numPages,
          segments: segments,
          pageTitles: local.pageTitles,
          titleSource: 'pdf-text',
        }
      }
    } catch (e) {
      // fall through to filename hints
    }
  }
  return fallbackMetadata(file, composerHint)
}

export function summarizeSheetSnapshotCandidates(candidates) {
  const list = Array.isArray(candidates) ? candidates : []
  let ocr = 0
  let cloudOcr = 0
  let pdfText = 0
  let filename = 0
  list.forEach(function(candidate) {
    const source = candidate && candidate.sheetSnapshotMeta && candidate.sheetSnapshotMeta.titleSource
    if (source === 'ocr' || source === 'cloud-ocr') ocr += 1
    else if (source === 'pdf-text') pdfText += 1
    else filename += 1
  })
  return {
    total: list.length,
    ocr: ocr,
    cloudOcr: list.filter(function(candidate) {
      return candidate && candidate.sheetSnapshotMeta && candidate.sheetSnapshotMeta.titleSource === 'cloud-ocr'
    }).length,
    pdfText: pdfText,
    filename: filename,
  }
}

export async function buildSheetSnapshotCandidatesFromFiles(files, options) {
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  const opts = options || {}
  const usedNames = new Set()
  const candidates = []
  const sheetFiles = list.filter(isSheetImageImportFile)
  const total = sheetFiles.length

  reportProgress(opts, {
    phase: 'checking',
    current: 0,
    total: total,
    fileName: '',
    message: 'Checking sheet OCR availability…',
  })

  const metadataSupport = await ensureMetadataSupport(opts)
  opts.metadataSupport = metadataSupport

  if (!metadataSupport.ok) {
    reportProgress(opts, {
      phase: 'unavailable',
      current: 0,
      total: total,
      fileName: '',
      message: metadataSupport.reason,
      warning: metadataSupport.reason,
    })
  } else {
    reportProgress(opts, {
      phase: 'prepare',
      current: 0,
      total: total,
      fileName: '',
      message: 'Reading titles from ' + total + ' sheet file' + (total === 1 ? '' : 's') + '…',
    })
  }

  for (let i = 0; i < sheetFiles.length; i += 1) {
    const file = sheetFiles[i]
    reportProgress(opts, {
      phase: metadataSupport.ok ? 'metadata' : 'fallback',
      current: i,
      total: total,
      fileName: file.name || 'file',
      message: metadataSupport.ok
        ? ('Reading title from ' + (file.name || 'file') + '…')
        : ('Using filename for ' + (file.name || 'file') + '…'),
      warning: metadataSupport.ok ? '' : metadataSupport.reason,
    })
    const metadata = await metadataForFile(file, opts)
    const segments = metadata.segments && metadata.segments.length
      ? metadata.segments
      : [{
        page: 1,
        endPage: metadata.numPages || 1,
        title: '',
        composer: composerHintFromFile(file),
      }]
    for (let s = 0; s < segments.length; s += 1) {
      const segment = segments[s]
      const candidate = await createSheetSnapshotCandidate(file, segment, {
        usedNames: usedNames,
        composerHint: composerHintFromFile(file),
        numPages: metadata.numPages,
        books: opts.books,
        titleSource: metadata.titleSource || 'filename',
      })
      candidates.push(candidate)
    }
    reportProgress(opts, {
      phase: metadataSupport.ok ? 'metadata' : 'fallback',
      current: i + 1,
      total: total,
      fileName: file.name || 'file',
      message: metadataSupport.ok
        ? ('Finished ' + (file.name || 'file'))
        : ('Named from filename: ' + (file.name || 'file')),
      warning: metadataSupport.ok ? '' : metadataSupport.reason,
    })
  }

  reportProgress(opts, {
    phase: 'done',
    current: total,
    total: total,
    fileName: '',
    message: 'Opening import review…',
    warning: metadataSupport.ok ? '' : metadataSupport.reason,
  })

  return {
    candidates: candidates,
    metadataSupport: metadataSupport,
  }
}

export function isBulkSheetSnapshotFileList(files) {
  const list = Array.isArray(files) ? files.filter(Boolean) : []
  if (!list.length) return false
  return list.every(isSheetImageImportFile)
}

export function resetBulkSheetSnapshotImportState() {
  resolverMetadataUnavailable = false
  resolverMetadataUnavailableReason = ''
}
