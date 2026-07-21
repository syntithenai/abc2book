import { pdfjs } from './pdfJsConfig'
import { titleFromChordSheetFileName } from './chordProFormatUtils'
import { titleArtistFromFilename } from './audioFileMetadata'
import { createImportCandidate } from './importReviewSession'
import { freshTuneId } from './importReviewCandidateUtils'

const TITLE_LINE_RE = /^(.+?)\s*[-–—|]\s*(.+)$/
const JAMMED_TITLE_SPLIT_RE = /(?<=[a-z])(?=[A-Z])/
const JAMMED_FROM_SPLIT_RE = /(From(?:\s+the)?\s+)/i

function stripControlChars(text) {
  return String(text || '').replace(/[\x00-\x1f\x7f]/g, '').trim()
}

function normalizeTitleMatchKey(text) {
  return stripControlChars(text).toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()
}

export function splitJammedTitleRun(text) {
  return stripControlChars(text).split(JAMMED_TITLE_SPLIT_RE).map(function(part) {
    return part.trim()
  }).filter(function(part) {
    return part.length >= 2
  })
}

export function parseJammedSongHeader(line) {
  let cleaned = stripControlChars(line)
  if (!cleaned || cleaned.length < 4) return { title: '', composer: '' }
  cleaned = cleaned.replace(/^\d+/, '').trim()
  if (!cleaned) return { title: '', composer: '' }

  const fromMatch = JAMMED_FROM_SPLIT_RE.exec(cleaned)
  const head = fromMatch ? cleaned.slice(0, fromMatch.index).trim() : cleaned
  const parts = splitJammedTitleRun(head)
  if (parts.length >= 2) {
    return {
      title: parts[0],
      composer: parts.slice(1).join(' ').trim(),
    }
  }
  if (parts.length === 1 && parts[0].length <= 120) {
    return { title: parts[0], composer: '' }
  }
  return { title: '', composer: '' }
}

export function parseJammedTocPage(lines) {
  const list = Array.isArray(lines) ? lines : []
  for (let i = 0; i < list.length; i += 1) {
    const text = stripControlChars(list[i])
    if (text.length < 80) continue
    const body = text.replace(/^.*TRANSCRIPTIONS/i, '').trim()
    const source = body && body !== text ? body : text
    const titles = splitJammedTitleRun(source).filter(function(title) {
      return looksLikeTitleLine(title)
    })
    if (titles.length >= 5) return titles
  }
  return []
}

function titlesRoughlyMatch(left, right) {
  const a = normalizeTitleMatchKey(left)
  const b = normalizeTitleMatchKey(right)
  if (!a || !b) return false
  if (a === b) return true
  if (a.indexOf(b) !== -1 || b.indexOf(a) !== -1) return true
  const wordsA = a.split(' ').filter(function(word) { return word.length > 2 })
  const wordsB = new Set(b.split(' ').filter(function(word) { return word.length > 2 }))
  if (!wordsA.length) return false
  const overlap = wordsA.filter(function(word) { return wordsB.has(word) }).length
  return overlap >= 2 || (wordsA.length === 1 && overlap === 1)
}

function titleFromPageLines(lines) {
  const list = Array.isArray(lines) ? lines : []
  const guessed = guessTitleComposerFromLines(list)
  if (guessed.title) return guessed
  for (let i = 0; i < Math.min(list.length, 4); i += 1) {
    const jammed = parseJammedSongHeader(list[i])
    if (jammed.title && looksLikeTitleLine(jammed.title)) return jammed
  }
  return { title: '', composer: '' }
}

function assignInterpolatedPages(segments, pageTitles) {
  const list = Array.isArray(segments) ? segments : []
  if (!list.length) return list
  const anchors = []
  list.forEach(function(segment, index) {
    if (segment && segment.page > 0) {
      anchors.push({ index: index, page: segment.page })
    }
  })
  if (!anchors.length) {
    list.forEach(function(segment) {
      segment.page = 1
      segment.endPage = 1
    })
    return list
  }
  list.forEach(function(segment, index) {
    if (segment.page > 0) return
    let prev = anchors[0]
    let next = anchors[anchors.length - 1]
    anchors.forEach(function(anchor) {
      if (anchor.index <= index) prev = anchor
    })
    for (let i = 0; i < anchors.length; i += 1) {
      if (anchors[i].index >= index) {
        next = anchors[i]
        break
      }
    }
    if (prev.index === next.index) {
      segment.page = prev.page
    } else {
      const ratio = (index - prev.index) / (next.index - prev.index)
      segment.page = Math.max(1, Math.round(prev.page + ratio * (next.page - prev.page)))
    }
    if (!segment.endPage) segment.endPage = segment.page
  })

  const maxPage = pageTitles.length > 0
    ? Number(pageTitles[pageTitles.length - 1].page) || list[list.length - 1].page
    : list[list.length - 1].page
  for (let i = 0; i < list.length; i += 1) {
    if (i + 1 < list.length && list[i + 1].page > list[i].page) {
      list[i].endPage = Math.max(list[i].page, list[i + 1].page - 1)
    } else {
      list[i].endPage = Math.max(list[i].page, maxPage)
    }
  }
  return list
}

function segmentsFromJammedToc(tocTitles, pageTitles) {
  const pages = Array.isArray(pageTitles) ? pageTitles : []
  const titles = Array.isArray(tocTitles) ? tocTitles : []
  if (titles.length < 5) return null

  const pageMatches = []
  pages.forEach(function(entry) {
    const pageNumber = Number(entry && entry.page) || 0
    if (!pageNumber) return
    const parsed = titleFromPageLines(entry && entry.lines)
    const title = stripControlChars((parsed && parsed.title) || entry && entry.title || '')
    if (!title || !looksLikeTitleLine(title)) return
    pageMatches.push({
      page: pageNumber,
      title: title,
      composer: String((parsed && parsed.composer) || entry && entry.artist || '').trim(),
    })
  })
  pageMatches.sort(function(a, b) { return a.page - b.page })

  let pageCursor = 1
  const segments = titles.map(function(tocTitle) {
    let match = null
    for (let i = 0; i < pageMatches.length; i += 1) {
      const candidate = pageMatches[i]
      if (candidate.page < pageCursor) continue
      if (!titlesRoughlyMatch(tocTitle, candidate.title)) continue
      match = candidate
      pageCursor = candidate.page + 1
      break
    }
    return {
      page: match ? match.page : 0,
      endPage: match ? match.page : 0,
      title: tocTitle,
      composer: match ? match.composer : '',
    }
  })

  return assignInterpolatedPages(segments, pages)
}

export function humanizeFolderName(name) {
  const text = String(name || '').trim().replace(/[_-]+/g, ' ')
  if (!text) return ''
  return text.split(/\s+/).map(function(part) {
    if (!part) return ''
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase()
  }).join(' ')
}

export function composerHintFromFile(file) {
  const relative = String((file && file.webkitRelativePath) || '').replace(/\\/g, '/').trim()
  if (!relative) return ''
  const parts = relative.split('/').filter(Boolean)
  if (parts.length < 2) return ''
  const parent = parts[parts.length - 2]
  if (!parent || /^(pdf|sheet music|sheets|music)$/i.test(parent)) return ''
  return humanizeFolderName(parent)
}

export function guessTitleComposerFromLines(lines) {
  const list = Array.isArray(lines) ? lines : []
  for (let i = 0; i < Math.min(list.length, 6); i += 1) {
    const text = String(list[i] || '').trim()
    if (!text) continue
    const match = TITLE_LINE_RE.exec(text)
    if (match) {
      return {
        title: String(match[1] || '').trim(),
        composer: String(match[2] || '').trim(),
      }
    }
    if (text.length >= 80) {
      const jammed = parseJammedSongHeader(text)
      if (jammed.title) return jammed
      continue
    }
    if (text.length < 80 && !/\d/.test(text)) {
      return { title: text, composer: '' }
    }
  }
  return { title: '', composer: '' }
}

function looksLikeTitleLine(text) {
  const cleaned = String(text || '').trim()
  if (!cleaned || cleaned.length < 3) return false
  if (/^\d+$/.test(cleaned)) return false
  if (/^page\s+\d+$/i.test(cleaned)) return false
  if (/^\d+\s*[/|]\s*\d+$/.test(cleaned)) return false
  return !/^(verse|chorus|intro|bridge|outro)$/i.test(cleaned)
}

export function segmentMetadataPages(pageTitles) {
  const pages = Array.isArray(pageTitles) ? pageTitles : []
  const segments = []
  let current = null
  pages.forEach(function(entry) {
    const pageNumber = Number(entry && entry.page) || 0
    const title = String(entry && entry.title || '').trim()
    const composer = String(entry && entry.artist || '').trim()
    if (title && looksLikeTitleLine(title)) {
      if (current && String(current.title || '').toLowerCase() === title.toLowerCase()) {
        current.endPage = pageNumber
        if (composer && !current.composer) current.composer = composer
        return
      }
      if (current) segments.push(current)
      current = {
        page: pageNumber,
        endPage: pageNumber,
        title: title,
        composer: composer,
      }
      return
    }
    if (current) current.endPage = pageNumber
  })
  if (current) segments.push(current)
  return segments
}

const TOC_LINE_RE = /^\s*(\d+)\.\s+(.+?)\s*$/

function normalizeTitleKey(text) {
  return String(text || '').trim().toLowerCase().replace(/\s+/g, ' ')
}

export function parseTocLines(lines) {
  const list = Array.isArray(lines) ? lines : []
  const entries = []
  list.forEach(function(line) {
    const match = TOC_LINE_RE.exec(String(line || '').trim())
    if (!match) return
    const title = String(match[2] || '').trim()
    if (!title || !looksLikeTitleLine(title)) return
    entries.push({
      num: parseInt(match[1], 10),
      title: title,
    })
  })
  return entries
}

export function mapTocToPageTitles(tocEntries, pageTitles) {
  const toc = Array.isArray(tocEntries) ? tocEntries : []
  const pages = Array.isArray(pageTitles) ? pageTitles : []
  if (toc.length < 3) return null

  const pageByTitle = {}
  pages.forEach(function(entry) {
    const title = String(entry && entry.title || '').trim()
    const pageNumber = Number(entry && entry.page) || 0
    if (!title || !pageNumber) return
    const key = normalizeTitleKey(title)
    if (!pageByTitle[key]) pageByTitle[key] = pageNumber
  })

  const segments = []
  toc.forEach(function(entry) {
    const title = String(entry && entry.title || '').trim()
    if (!title) return
    const key = normalizeTitleKey(title)
    let page = pageByTitle[key]
    if (!page) {
      for (let i = 0; i < pages.length; i += 1) {
        const pageTitle = normalizeTitleKey(pages[i] && pages[i].title)
        if (!pageTitle) continue
        if (pageTitle.indexOf(key) !== -1 || key.indexOf(pageTitle) !== -1) {
          page = Number(pages[i].page) || 0
          break
        }
      }
    }
    if (!page) return
    segments.push({
      page: page,
      endPage: page,
      title: title,
      composer: '',
    })
  })

  if (segments.length < 3) return null
  for (let i = 0; i < segments.length; i += 1) {
    if (i + 1 < segments.length) {
      segments[i].endPage = Math.max(segments[i].page, segments[i + 1].page - 1)
    } else {
      const lastPage = pages.length > 0 ? Number(pages[pages.length - 1].page) || segments[i].page : segments[i].page
      segments[i].endPage = lastPage
    }
  }
  return segments
}

export function segmentsFromPageTitles(pageTitles) {
  const pages = Array.isArray(pageTitles) ? pageTitles : []
  for (let i = 0; i < Math.min(pages.length, 3); i += 1) {
    const toc = parseTocLines(pages[i] && pages[i].lines)
    if (toc.length >= 3) {
      const mapped = mapTocToPageTitles(toc, pages)
      if (mapped && mapped.length >= 3) return mapped
    }
    const jammedToc = parseJammedTocPage(pages[i] && pages[i].lines)
    if (jammedToc.length >= 5) {
      const mapped = segmentsFromJammedToc(jammedToc, pages)
      if (mapped && mapped.length >= 5) return mapped
    }
  }
  return segmentMetadataPages(pages)
}

export function ensureUniqueTuneName(baseName, usedNames) {
  const seen = usedNames || new Set()
  let name = String(baseName || '').trim() || 'Untitled'
  if (!seen.has(name.toLowerCase())) {
    seen.add(name.toLowerCase())
    return name
  }
  let counter = 2
  while (seen.has((name + ' (' + counter + ')').toLowerCase())) {
    counter += 1
  }
  const unique = name + ' (' + counter + ')'
  seen.add(unique.toLowerCase())
  return unique
}

export function fallbackTitleComposerFromFile(file, composerHint) {
  const fileName = (file && file.name) || ''
  const parsed = titleArtistFromFilename(fileName)
  const fromName = titleFromChordSheetFileName(fileName)
  const title = parsed.title || fromName || fileName.replace(/\.[^.]+$/, '')
  const composer = String(composerHint || '').trim() || parsed.artist || ''
  return { title: title, composer: composer }
}

async function loadPdfDocument(file) {
  const data = await file.arrayBuffer()
  return pdfjs.getDocument({ data: data }).promise
}

export async function extractPdfPageTexts(file) {
  const doc = await loadPdfDocument(file)
  const pages = []
  for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
    const page = await doc.getPage(pageNumber)
    const textContent = await page.getTextContent()
    const lines = []
    let current = ''
    ;(textContent.items || []).forEach(function(item) {
      const chunk = String(item && item.str || '')
      if (!chunk) return
      if (item.hasEOL) {
        current += chunk
        if (current.trim()) lines.push(current.trim())
        current = ''
      } else {
        current += chunk
      }
    })
    if (current.trim()) lines.push(current.trim())
    const guessed = titleFromPageLines(lines)
    pages.push({
      page: pageNumber,
      title: guessed.title,
      artist: guessed.composer,
      lines: lines.slice(0, 12),
    })
  }
  return {
    numPages: doc.numPages,
    pageTitles: pages,
    segments: segmentsFromPageTitles(pages),
  }
}

export function buildSnapshotTune(options) {
  const opts = options || {}
  return {
    id: freshTuneId(),
    name: String(opts.title || '').trim() || 'Untitled',
    composer: String(opts.composer || '').trim(),
    books: Array.isArray(opts.books) ? opts.books.slice() : [],
    links: [],
  }
}

async function blobForSegment(file, segment) {
  const isPdf = /\.pdf$/i.test(file && file.name || '') || String(file && file.type || '').toLowerCase() === 'application/pdf'
  const page = Number(segment && segment.page) || 1
  const endPage = Number(segment && segment.endPage) || page
  if (!isPdf || (page === 1 && endPage >= (segment.numPages || endPage))) {
    return {
      blob: file,
      name: file.name || 'sheet.pdf',
      type: file.type || 'application/pdf',
    }
  }
  const { rasterizePdfPageToPng } = await import('./tuneFilePdfRasterize')
  const rendered = await rasterizePdfPageToPng(file, page, { scale: 2 })
  const base = String(segment.title || file.name || 'sheet').replace(/\.[^.]+$/, '')
  return {
    blob: rendered.blob,
    name: base + '-p' + page + '.png',
    type: 'image/png',
  }
}

export async function createSheetSnapshotCandidate(file, metadata, options) {
  const opts = options || {}
  const composerHint = opts.composerHint || composerHintFromFile(file)
  const segment = metadata || { page: 1, endPage: 1, title: '', composer: composerHint }
  const fallback = fallbackTitleComposerFromFile(file, composerHint)
  const title = String(segment.title || fallback.title || '').trim()
  const composer = String(segment.composer || segment.artist || fallback.composer || composerHint || '').trim()
  const uniqueTitle = ensureUniqueTuneName(title || fallback.title, opts.usedNames)
  const filePayload = await blobForSegment(file, Object.assign({}, segment, {
    numPages: opts.numPages,
  }))
  const tune = buildSnapshotTune({
    title: uniqueTitle,
    composer: composer || 'Unknown',
    books: opts.books,
  })
  const candidate = createImportCandidate({
    tune: tune,
    sourceKind: 'sheetimage',
    skipEnrich: true,
  })
  candidate.pendingFile = {
    name: filePayload.name,
    type: filePayload.type,
    blob: filePayload.blob,
    source: 'import',
  }
  candidate.sheetSnapshotMeta = {
    titleSource: opts.titleSource || 'filename',
    sourceFileName: (file && file.name) || '',
  }
  return candidate
}
