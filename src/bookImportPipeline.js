/**
 * Import Book processing pipeline: pages → split → OMR → ABC candidates.
 */
import { splitSheetPageFile, jpegBase64ToBlob } from './sheetImageSplitClient'
import { transcribeSheetImageFile } from './sheetImageTranscriptionClient'
import { searchNotation } from './notationSearchClient'
import { runNotationChecks } from './useNotationCheck'
import { buildNotationCheckTune } from './notationCheckSnapshot'
import {
  buildCandidateList,
  pickBestAbcCandidate,
  autoSelectThreshold,
  looksWeakAbc,
  titleSimilarity,
} from './bookImportAbcLookup'
import {
  createBlankTuneRecord,
  putReviewBlob,
  appendTunesToReviewSet,
  updateReviewSet,
  filterBookImportFiles,
} from './bookImportReviewStore'
import {
  sheetFormatIsTextOnly,
  normalizeSheetFormat,
  SHEET_FORMATS,
} from './sheetImageFormats'
import {
  sniffPdfBook,
  needsRasterizeForPageKind,
  splitTextLayerIntoSongs,
  PDF_PAGE_KINDS,
} from './pdfBookPageSniff'
import { musicXmlToAbc } from './musicXmlToAbc'
import { extractMusicXmlFromMxl } from './mxlExtract'

const TITLE_KEY_HINT_RE = /\(([A-G][#b]?(?:m|maj|min|dim|aug)?(?:\d)?(?:\/[A-G][#b]?)?)\)\s*$/i

function report(onProgress, payload) {
  if (typeof onProgress === 'function') onProgress(payload)
}

function isPdfFile(file) {
  if (!file) return false
  const name = String(file.name || '').toLowerCase()
  const type = String(file.type || '').toLowerCase()
  return type === 'application/pdf' || name.endsWith('.pdf')
}

function extractKeyFromTitle(title) {
  const match = TITLE_KEY_HINT_RE.exec(String(title || ''))
  return match ? match[1] : ''
}

async function filesToPageImages(files, options) {
  const list = filterBookImportFiles(files)
  const pages = []
  let pageNumber = options.startPage || 1
  for (let i = 0; i < list.length; i += 1) {
    const file = list[i]
    if (options.signal && options.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    report(options.onProgress, {
      phase: 'rasterize',
      current: i,
      total: list.length,
      message: 'Preparing ' + (file.name || 'file') + '…',
      fileName: file.name || '',
    })
    if (isPdfFile(file)) {
      let sniff = null
      try {
        report(options.onProgress, {
          phase: 'sniff',
          current: i,
          total: list.length,
          message: 'Sniffing PDF text layer…',
          fileName: file.name || '',
        })
        sniff = await sniffPdfBook(file, { signal: options.signal })
      } catch (e) {
        sniff = null
      }

      const pdfBlobKey = 'pdf-' + (options.setId || 'set') + '-' + Date.now() + '-' + i
      if (options.persistPdfSource) {
        await putReviewBlob(pdfBlobKey, file)
      }

      // Embedded MusicXML/ABC fast path (whole-doc attachments) — separate from page loop.
      const embedPages = []
      if (sniff && Array.isArray(sniff.embeds) && sniff.embeds.length) {
        sniff.embeds.forEach(function(embed, embedIndex) {
          embedPages.push({
            page: pageNumber + embedIndex,
            blob: null,
            name: (file.name || 'book').replace(/\.pdf$/i, '') + '-embed-' + (embedIndex + 1),
            sourceName: file.name || '',
            pageKind: PDF_PAGE_KINDS.EMBEDDED_SCORE,
            embed: embed,
            sourcePdfBlobKey: options.persistPdfSource ? pdfBlobKey : '',
            sniffLines: [],
            skipRasterize: true,
            isEmbed: true,
          })
        })
      }

      const pdfRasterizeMod = await import('./tuneFilePdfRasterize')
      const rasterizePdfPageToPng = pdfRasterizeMod.rasterizePdfPageToPng
      let numPages = sniff && sniff.numPages ? sniff.numPages : 0
      if (!numPages) {
        const { pdfjs } = await import('./pdfJsConfig')
        const data = await file.arrayBuffer()
        const doc = await pdfjs.getDocument({ data: data }).promise
        try {
          numPages = doc.numPages
        } finally {
          try {
            if (doc && typeof doc.destroy === 'function') await doc.destroy()
          } catch (e) {
            // ignore
          }
        }
      }

      for (let p = 1; p <= numPages; p += 1) {
        if (options.signal && options.signal.aborted) {
          throw new DOMException('Aborted', 'AbortError')
        }
        const sniffPage = sniff && sniff.pages ? sniff.pages[p - 1] : null
        const pageKind = (sniffPage && sniffPage.pageKind) || PDF_PAGE_KINDS.SCANNED_IMAGE
        const isTextFast = (
          pageKind === PDF_PAGE_KINDS.TEXT_CHORD
          || pageKind === PDF_PAGE_KINDS.TEXT_LYRICS
        )

        // Text chord/lyrics: skip rasterize by default (optional snapshot via alwaysRasterSnapshot).
        let blob = null
        let width = sniffPage ? sniffPage.width : 0
        let height = sniffPage ? sniffPage.height : 0
        let rasterScale = 0
        const shouldRaster = needsRasterizeForPageKind(pageKind)
          || (isTextFast && options.alwaysRasterSnapshot)
        if (shouldRaster) {
          const scale = sniffPage && sniffPage.suggestedScale ? sniffPage.suggestedScale : 2
          report(options.onProgress, {
            phase: 'rasterize',
            current: p - 1,
            total: numPages,
            message: 'Rasterizing PDF page ' + p + ' of ' + numPages
              + (list.length > 1 ? ' (' + (file.name || 'PDF') + ')' : '')
              + '…',
            fileName: file.name || '',
            fileIndex: i,
            fileCount: list.length,
          })
          const rendered = await rasterizePdfPageToPng(file, p, {
            scale: scale,
            signal: options.signal,
          })
          blob = rendered.blob
          width = rendered.width
          height = rendered.height
          rasterScale = scale
        }

        pages.push({
          page: pageNumber,
          blob: blob,
          name: (file.name || 'book').replace(/\.pdf$/i, '') + '-p' + p + '.png',
          sourceName: file.name || '',
          pageKind: pageKind,
          sniffLines: sniffPage ? sniffPage.lines : [],
          sourcePdfBlobKey: options.persistPdfSource ? pdfBlobKey : '',
          sourcePdfPage: p,
          width: width,
          height: height,
          rasterScale: rasterScale,
          skipSplit: isTextFast,
          textFast: isTextFast,
        })
        pageNumber += 1
      }
      embedPages.forEach(function(ep) {
        ep.page = pageNumber
        pages.push(ep)
        pageNumber += 1
      })
    } else {
      pages.push({
        page: pageNumber,
        blob: file,
        name: file.name || ('page-' + pageNumber + '.jpg'),
        sourceName: file.name || '',
        pageKind: PDF_PAGE_KINDS.SCANNED_IMAGE,
        sniffLines: [],
      })
      pageNumber += 1
    }
  }
  return pages
}

function looksLikeUntitled(title) {
  const t = String(title || '').trim()
  if (!t) return true
  return /^untitled/i.test(t) || /^cont\.?$/i.test(t) || /^continued$/i.test(t)
}

/** Weak / continuation-style titles (never treat as a new strong tune start). */
export function looksLikeContinuationTitle(title) {
  const t = String(title || '').trim()
  if (!t || looksLikeUntitled(t)) return true
  if (/^cont\.?\b/i.test(t) || /^continued\b/i.test(t)) return true
  if (/\(cont\.?\)/i.test(t) || /\bcontinued\b/i.test(t)) return true
  if (/^part\s*[2-9ivx]+\b/i.test(t)) return true
  if (/^[a-z]/.test(t)) return true
  return false
}

/** Strong titled new tune — never auto-suggest merge into / from these as next. */
export function hasStrongTuneTitle(title) {
  const t = String(title || '').trim()
  if (!t || looksLikeContinuationTitle(t)) return false
  if (t.length < 3) return false
  return /^[A-Z0-9]/.test(t)
}

function tunePrimaryAbc(tune) {
  if (!tune) return ''
  if (tune.abc) return String(tune.abc)
  if (tune.omrAbc) return String(tune.omrAbc)
  const c = Array.isArray(tune.candidates) && tune.candidates[0]
  return c && c.abc ? String(c.abc) : ''
}

/**
 * Heuristic: ABC body looks mid-strain (no final ], ends mid-bar / open repeat).
 */
export function abcLooksIncomplete(abc) {
  const text = String(abc || '')
  if (!text.trim()) return false
  const bodyLines = text.split(/\r?\n/).filter(function(line) {
    const t = line.trim()
    if (!t) return false
    if (/^[A-Za-z]:/.test(t)) return false
    if (/^%/.test(t)) return false
    return true
  })
  const body = bodyLines.join('').replace(/\s+/g, '')
  if (!body) return false
  if (/\|\]$/.test(body) || /\]$/.test(body)) return false
  if (/:\|\s*$/.test(String(abc || '').replace(/\s+/g, '')) || /:\|$/.test(body)) return false
  if (/\|:$/.test(body)) return true
  if (!/\|/.test(body)) return true
  // Ends after a barline with leftover notes, or ends with notes and no closer
  if (/\|[^|\]]+$/.test(body)) return true
  if (/[A-Ga-g][,']*\d*$/.test(body) && !/\|$/.test(body)) return true
  return false
}

function chordSheetLooksIncomplete(text) {
  const lines = String(text || '').split(/\r?\n/).map(function(l) {
    return l.trim()
  }).filter(Boolean)
  if (lines.length < 2) return false
  const last = lines[lines.length - 1]
  if (/[.!?…]"?$/.test(last)) return false
  if (/^(verse|chorus|bridge|outro)\b/i.test(last)) return true
  return last.length >= 3 && last.length < 48
}

function tuneLooksMidStrainEnd(tune) {
  if (!tune) return false
  if (looksLikeContinuationTitle(tune.title) || looksLikeUntitled(tune.title)) return true
  const abc = tunePrimaryAbc(tune)
  if (abc && abcLooksIncomplete(abc)) return true
  if (sheetFormatIsTextOnly(tune.sheetFormat) && chordSheetLooksIncomplete(tune.chordSheetText)) {
    return true
  }
  return false
}

/**
 * Mark cross-page continuations: last crop on page N untitled / mid-strain,
 * first crop on page N+1 also weak title → suggest merge.
 * Never silently suggest when the next crop has a strong new title.
 */
export function markCrossPageContinuations(tunes) {
  const list = Array.isArray(tunes) ? tunes.slice() : []
  for (let i = 0; i < list.length - 1; i += 1) {
    const cur = list[i]
    const next = list[i + 1]
    if (!cur || !next) continue
    const curPage = Number(cur.page) || 0
    const nextPage = Number(next.page) || 0
    if (nextPage !== curPage + 1) continue
    // Find if cur is last tune of its page
    let lastOnPage = true
    for (let j = i + 1; j < list.length; j += 1) {
      if (Number(list[j].page) === curPage) {
        lastOnPage = false
        break
      }
      if (Number(list[j].page) > curPage) break
    }
    if (!lastOnPage) continue

    // First crop on next page (or weak continuation standing in for first)
    const nextIsFirst = Number(next.tuneIndex) === 1 || looksLikeContinuationTitle(next.title)
    if (!nextIsFirst) continue

    // Never stitch into a clearly titled new tune
    if (hasStrongTuneTitle(next.title)) continue

    const nextWeak = looksLikeContinuationTitle(next.title) || looksLikeUntitled(next.title)
    const curMid = tuneLooksMidStrainEnd(cur)
    if (nextWeak && curMid) {
      list[i] = Object.assign({}, cur, { suggestedMergeWithNext: true })
    }
  }
  return list
}

function decoderText(bytes) {
  try {
    return new TextDecoder('utf-8').decode(bytes)
  } catch (e) {
    return ''
  }
}

function looksLikeZipBytes(bytes) {
  if (!bytes || bytes.length < 4) return false
  // PK\x03\x04
  return bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04
}

/**
 * Convert an embedded PDF attachment (ABC / MusicXML / MXL) to ABC text.
 * Exported for unit tests.
 */
export async function convertEmbeddedScoreToAbc(embed) {
  if (!embed) return ''
  if (embed.kind === 'abc') {
    return decoderText(embed.bytes).trim()
  }
  if (embed.kind === 'mxl' || embed.kind === 'musicxml') {
    let xml = ''
    try {
      if (embed.kind === 'mxl' || looksLikeZipBytes(embed.bytes)) {
        const buffer = embed.bytes.buffer.slice(
          embed.bytes.byteOffset,
          embed.bytes.byteOffset + embed.bytes.byteLength
        )
        xml = String(await extractMusicXmlFromMxl(buffer) || '').trim()
      } else {
        xml = decoderText(embed.bytes).trim()
      }
    } catch (e) {
      xml = decoderText(embed.bytes).trim()
    }
    if (!xml) return ''
    try {
      return String(musicXmlToAbc(xml, {
        fileName: (embed.filename || 'embed') + '.musicxml',
      }) || '').trim()
    } catch (e) {
      return ''
    }
  }
  return ''
}

async function enrichEmbeddedScore(tune, embed, options) {
  const opts = options || {}
  const abc = await convertEmbeddedScoreToAbc(embed)
  const issues = notationIssuesForAbc(abc, tune.title, opts.abcTools)
  return Object.assign({}, tune, {
    sheetFormat: SHEET_FORMATS.NOTATION_ONLY,
    pageType: SHEET_FORMATS.NOTATION_ONLY,
    pageKind: PDF_PAGE_KINDS.EMBEDDED_SCORE,
    abc: abc,
    abcSource: abc ? 'embed' : '',
    omrAbc: '',
    candidates: abc ? [{ id: 'embed', source: 'embed', abc: abc, score: 1, rankScore: 1 }] : [],
    selectedCandidateId: abc ? 'embed' : '',
    notationIssues: issues,
    status: abc ? 'ready' : 'needs-review',
    books: [opts.book],
  })
}

async function enrichTextLayerTune(tune, song, options) {
  const opts = options || {}
  const pageKind = song.pageKind || tune.pageKind
  const sheetFormat = pageKind === PDF_PAGE_KINDS.TEXT_LYRICS
    ? SHEET_FORMATS.LYRICS_ONLY
    : SHEET_FORMATS.CHORD_CHART
  const text = String(song.text || '').trim()
  return Object.assign({}, tune, {
    sheetFormat: sheetFormat,
    pageType: sheetFormat,
    pageKind: pageKind,
    chordSheetText: text,
    title: song.title || tune.title,
    abc: '',
    abcSource: text ? 'pdf-text' : '',
    omrAbc: '',
    candidates: [],
    selectedCandidateId: '',
    status: text ? 'ready' : 'needs-review',
    books: [opts.book],
    meta: {
      title: song.title || tune.title,
      artist: '',
      composer: '',
      key: tune.key || '',
      sourceFormat: sheetFormat,
      confidence: 0.75,
    },
  })
}

async function lookupTheSession(title) {
  const query = String(title || '')
    .replace(TITLE_KEY_HINT_RE, '')
    .trim()
  if (!query || query.length < 4) return null
  if (/untitled/i.test(query)) return null
  try {
    const url = 'https://thesession.org/tunes/search?format=json&q=' + encodeURIComponent(query)
    const response = await fetch(url, {
      headers: { Accept: 'application/json' },
    })
    if (!response.ok) return null
    const body = await response.json()
    const tunes = Array.isArray(body && body.tunes) ? body.tunes : []
    let best = null
    tunes.forEach(function(row) {
      const name = String(row && row.name || '')
      const score = titleSimilarity(query, name)
      if (!best || score > best.score) {
        best = { id: row.id, name: name, score: score, url: row.url || '' }
      }
    })
    if (!best || best.score < 0.7 || !best.id) return null
    const detailRes = await fetch('https://thesession.org/tunes/' + best.id + '?format=json', {
      headers: { Accept: 'application/json' },
    })
    if (!detailRes.ok) return null
    const detail = await detailRes.json()
    const settings = Array.isArray(detail && detail.settings) ? detail.settings : []
    const setting = settings[0]
    const abc = setting && setting.abc ? String(setting.abc).trim() : ''
    if (!abc) return null
    return {
      source: 'thesession:' + best.id,
      abc: abc,
      score: best.score,
      title: best.name,
      matchedTitle: best.name,
      url: best.url || ('https://thesession.org/tunes/' + best.id),
    }
  } catch (e) {
    return null
  }
}

function notationIssuesForAbc(abc, title, abcTools) {
  const text = String(abc || '').trim()
  if (!text || !abcTools) return []
  try {
    const parsed = abcTools.abc2json(text)
    if (!parsed || typeof parsed !== 'object') return []
    parsed.id = parsed.id || 'book-import-check'
    parsed.name = parsed.name || title || 'Untitled'
    const snapshot = buildNotationCheckTune(parsed)
    const report = runNotationChecks(snapshot, {
      abcTools: abcTools,
      abcText: text,
      skipRenderAbc: true,
    })
    return Array.isArray(report.issues) ? report.issues : []
  } catch (e) {
    return []
  }
}

async function enrichTuneWithOmrAndAbc(tune, cropBlob, options) {
  const opts = options || {}
  const title = tune.title
  const progressBase = {
    current: opts.progressCurrent,
    total: opts.progressTotal,
  }
  let omrAbc = ''
  let sheetFormat = normalizeSheetFormat(tune.sheetFormat || tune.pageType)
  let chordSheetText = ''
  let meta = null
  try {
    report(opts.onProgress, Object.assign({}, progressBase, {
      phase: 'omr',
      message: (sheetFormatIsTextOnly(sheetFormat) ? 'OCR: ' : 'OMR: ') + title,
      tuneId: tune.id,
    }))
    const file = cropBlob instanceof File
      ? cropBlob
      : new File([cropBlob], tune.cropName || 'crop.jpg', { type: 'image/jpeg' })
    const transcribed = await transcribeSheetImageFile({
      file: file,
      accessToken: opts.accessToken,
      signal: opts.signal,
      titleHints: title ? [title] : [],
      composerHint: String(
        (tune && tune.composer)
        || (tune && tune.meta && tune.meta.composer)
        || opts.composerHint
        || ''
      ).trim(),
    })
    sheetFormat = normalizeSheetFormat(
      (transcribed && (transcribed.sheetFormat || transcribed.pageType)) || sheetFormat
    )
    meta = transcribed && transcribed.meta ? transcribed.meta : null
    chordSheetText = transcribed && transcribed.chordSheet && transcribed.chordSheet.text
      ? String(transcribed.chordSheet.text).trim()
      : ''
    omrAbc = transcribed && transcribed.melody && transcribed.melody.abc
      ? String(transcribed.melody.abc).trim()
      : ''
  } catch (e) {
    omrAbc = ''
  }

  // Chord/lyrics crops: keep OCR text; skip notation candidate ranking when no melody.
  if (sheetFormatIsTextOnly(sheetFormat) && !omrAbc) {
    const issues = notationIssuesForAbc('', title, opts.abcTools)
    return Object.assign({}, tune, {
      sheetFormat: sheetFormat,
      pageType: sheetFormat,
      meta: meta,
      chordSheetText: chordSheetText,
      omrAbc: '',
      candidates: [],
      selectedCandidateId: '',
      abc: '',
      abcSource: chordSheetText ? 'chord-sheet' : '',
      key: tune.key || (meta && meta.key) || extractKeyFromTitle(title),
      notationIssues: issues,
      status: chordSheetText ? 'ready' : 'needs-review',
      books: [opts.book],
    })
  }

  let sessionHit = null
  try {
    report(opts.onProgress, Object.assign({}, progressBase, {
      phase: 'abc-search',
      message: 'ABC search: ' + title,
      tuneId: tune.id,
    }))
    sessionHit = await lookupTheSession(title)
  } catch (e) {
    sessionHit = null
  }

  let notationResult = null
  try {
    notationResult = await searchNotation({
      title: title,
      artist: '',
      accessToken: opts.accessToken,
      signal: opts.signal,
      resolverAvailable: opts.resolverAvailable,
      forceResolver: opts.resolverAvailable !== false,
      abcHint: omrAbc && looksWeakAbc(omrAbc) === false ? omrAbc : '',
    })
  } catch (e) {
    notationResult = null
  }

  // Contour-hinted retry when title match weak and OMR exists
  if (omrAbc && (!notationResult || !notationResult.candidates || !notationResult.candidates.length)) {
    try {
      notationResult = await searchNotation({
        title: title,
        artist: '',
        accessToken: opts.accessToken,
        signal: opts.signal,
        resolverAvailable: opts.resolverAvailable,
        forceResolver: opts.resolverAvailable !== false,
      })
    } catch (e) {
      // keep prior
    }
  }

  const candidates = buildCandidateList({
    title: title,
    omrAbc: omrAbc,
    sessionHit: sessionHit,
    notationResult: notationResult,
  })
  const best = pickBestAbcCandidate(candidates, { preferChords: opts.preferChords !== false })
  const threshold = autoSelectThreshold()
  const selected = best && (best.rankScore >= threshold || best.score >= threshold) ? best : null
  const abc = selected ? selected.abc : (best ? best.abc : omrAbc)
  const issues = notationIssuesForAbc(abc, title, opts.abcTools)

  return Object.assign({}, tune, {
    sheetFormat: sheetFormat,
    pageType: sheetFormat,
    meta: meta,
    chordSheetText: chordSheetText,
    omrAbc: omrAbc,
    candidates: candidates,
    selectedCandidateId: selected ? selected.id : (best ? best.id : ''),
    abc: abc || '',
    abcSource: selected ? selected.source : (best ? best.source : (omrAbc ? 'omr' : '')),
    key: tune.key || (meta && meta.key) || extractKeyFromTitle(title),
    notationIssues: issues,
    status: abc || chordSheetText ? 'ready' : 'needs-review',
    books: [opts.book],
  })
}

/**
 * Process source files into an existing review set (create or append).
 * @param {{ setId: string, files: File[], accessToken?: string, resolverAvailable?: boolean, abcTools?: object, signal?: AbortSignal, onProgress?: function, startPage?: number }} options
 */
export async function processFilesIntoReviewSet(options) {
  const opts = options || {}
  const setId = opts.setId
  if (!setId) throw new Error('Review set id is required')
  const { getReviewSet } = await import('./bookImportReviewStore')
  const set = await getReviewSet(setId)
  if (!set) throw new Error('Review set not found')
  const book = String(set.book || '').trim().toLowerCase()
  if (!book) throw new Error('Review set is missing a book')

  const pageImages = await filesToPageImages(opts.files, {
    onProgress: opts.onProgress,
    signal: opts.signal,
    startPage: opts.startPage || ((Array.isArray(set.pages) ? set.pages.length : 0) + 1),
    setId: setId,
    persistPdfSource: true,
  })

  if (!pageImages.length) {
    throw new Error('No image or PDF pages found')
  }

  await updateReviewSet(setId, { status: 'processing' })

  const newPages = []
  const newTunes = []

  for (let i = 0; i < pageImages.length; i += 1) {
    if (opts.signal && opts.signal.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const pageInfo = pageImages[i]
    report(opts.onProgress, {
      phase: 'split',
      current: i,
      total: pageImages.length,
      message: pageInfo.isEmbed
        ? ('Importing embedded score…')
        : ('Splitting page ' + pageInfo.page + '…'),
      fileName: pageInfo.name,
    })

    const pageBlobKey = 'page-' + setId + '-' + pageInfo.page + '-' + Date.now()
    if (pageInfo.blob) {
      await putReviewBlob(pageBlobKey, pageInfo.blob)
    }
    newPages.push({
      id: 'page-' + pageInfo.page,
      name: pageInfo.name,
      blobKey: pageInfo.blob ? pageBlobKey : '',
      page: pageInfo.page,
      sourceName: pageInfo.sourceName,
      pageKind: pageInfo.pageKind || '',
      sourcePdfBlobKey: pageInfo.sourcePdfBlobKey || '',
      sourcePdfPage: pageInfo.sourcePdfPage || null,
    })

    // Embedded MusicXML/ABC
    if (pageInfo.isEmbed && pageInfo.embed) {
      const cropBlobKey = 'crop-' + setId + '-' + pageInfo.page + '-1-' + Date.now()
      if (pageInfo.blob) await putReviewBlob(cropBlobKey, pageInfo.blob)
      let tune = createBlankTuneRecord({
        book: book,
        title: pageInfo.embed.filename || pageInfo.name,
        page: pageInfo.page,
        tuneIndex: 1,
        cropBlobKey: pageInfo.blob ? cropBlobKey : '',
        cropName: pageInfo.name,
        status: 'pending',
        pageKind: PDF_PAGE_KINDS.EMBEDDED_SCORE,
        sheetFormat: SHEET_FORMATS.NOTATION_ONLY,
        sourcePdfBlobKey: pageInfo.sourcePdfBlobKey || '',
        sourcePdfPage: pageInfo.sourcePdfPage,
        rasterScale: pageInfo.rasterScale || 0,
      })
      tune = await enrichEmbeddedScore(tune, pageInfo.embed, {
        abcTools: opts.abcTools,
        book: book,
      })
      newTunes.push(tune)
      continue
    }

    // Text-layer chord/lyrics fast path (no OMR)
    if (pageInfo.textFast || pageInfo.skipSplit) {
      const songs = splitTextLayerIntoSongs(pageInfo.sniffLines || [], pageInfo.pageKind)
      for (let s = 0; s < songs.length; s += 1) {
        const song = songs[s]
        const cropBlobKey = 'crop-' + setId + '-' + pageInfo.page + '-' + (s + 1) + '-' + Date.now()
        if (pageInfo.blob) await putReviewBlob(cropBlobKey, pageInfo.blob)
        let tune = createBlankTuneRecord({
          book: book,
          title: song.title || ('untitled-p' + pageInfo.page + '-' + (s + 1)),
          page: pageInfo.page,
          tuneIndex: s + 1,
          cropBlobKey: pageInfo.blob ? cropBlobKey : '',
          cropName: pageInfo.name,
          status: 'pending',
          pageKind: pageInfo.pageKind,
          sheetFormat: pageInfo.pageKind === PDF_PAGE_KINDS.TEXT_LYRICS
            ? SHEET_FORMATS.LYRICS_ONLY
            : SHEET_FORMATS.CHORD_CHART,
          chordSheetText: song.text || '',
          sourcePdfBlobKey: pageInfo.sourcePdfBlobKey || '',
          sourcePdfPage: pageInfo.sourcePdfPage,
          rasterScale: pageInfo.rasterScale || 0,
        })
        tune = await enrichTextLayerTune(tune, song, { book: book })
        newTunes.push(tune)
      }
      continue
    }

    if (!pageInfo.blob) {
      continue
    }

    let split
    try {
      split = await splitSheetPageFile({
        file: pageInfo.blob,
        fileName: pageInfo.name,
        accessToken: opts.accessToken,
        page: pageInfo.page,
        signal: opts.signal,
      })
    } catch (e) {
      // Fallback: whole page as one tune
      const cropBlobKey = 'crop-' + setId + '-' + pageInfo.page + '-1-' + Date.now()
      await putReviewBlob(cropBlobKey, pageInfo.blob)
      let tune = createBlankTuneRecord({
        book: book,
        title: pageInfo.name.replace(/\.[^.]+$/, ''),
        page: pageInfo.page,
        tuneIndex: 1,
        cropBlobKey: cropBlobKey,
        cropName: pageInfo.name,
        status: 'pending',
        pageKind: pageInfo.pageKind || '',
        sourcePdfBlobKey: pageInfo.sourcePdfBlobKey || '',
        sourcePdfPage: pageInfo.sourcePdfPage,
        rasterScale: pageInfo.rasterScale || 0,
      })
      tune = await enrichTuneWithOmrAndAbc(tune, pageInfo.blob, {
        accessToken: opts.accessToken,
        resolverAvailable: opts.resolverAvailable,
        abcTools: opts.abcTools,
        book: book,
        signal: opts.signal,
        onProgress: opts.onProgress,
        progressCurrent: i,
        progressTotal: pageImages.length,
      })
      newTunes.push(tune)
      continue
    }

    const segments = split.segments || []
    for (let s = 0; s < segments.length; s += 1) {
      const segment = segments[s]
      const cropBlob = jpegBase64ToBlob(segment.cropJpegBase64) || pageInfo.blob
      const cropName = 'p'
        + String(pageInfo.page).padStart(2, '0')
        + '_'
        + String(segment.tuneIndex || (s + 1)).padStart(2, '0')
        + '_'
        + (segment.slug || 'tune')
        + '.jpg'
      const cropBlobKey = 'crop-' + setId + '-' + pageInfo.page + '-' + (segment.tuneIndex || s + 1) + '-' + Date.now()
      await putReviewBlob(cropBlobKey, cropBlob)
      let tune = createBlankTuneRecord({
        book: book,
        title: segment.title || ('untitled-p' + pageInfo.page + '-' + (s + 1)),
        page: pageInfo.page,
        tuneIndex: segment.tuneIndex || (s + 1),
        cropBlobKey: cropBlobKey,
        cropName: cropName,
        bbox: segment.bbox,
        key: extractKeyFromTitle(segment.title),
        status: 'pending',
        pageKind: pageInfo.pageKind || '',
        sourcePdfBlobKey: pageInfo.sourcePdfBlobKey || '',
        sourcePdfPage: pageInfo.sourcePdfPage,
        rasterScale: pageInfo.rasterScale || 0,
      })
      report(opts.onProgress, {
        phase: 'enrich',
        current: i,
        total: pageImages.length,
        message: 'Processing ' + tune.title,
        tuneTitle: tune.title,
      })
      tune = await enrichTuneWithOmrAndAbc(tune, cropBlob, {
        accessToken: opts.accessToken,
        resolverAvailable: opts.resolverAvailable,
        abcTools: opts.abcTools,
        book: book,
        signal: opts.signal,
        onProgress: opts.onProgress,
        progressCurrent: i,
        progressTotal: pageImages.length,
      })
      newTunes.push(tune)
    }
  }

  const withContinuations = markCrossPageContinuations(newTunes)
  const updated = await appendTunesToReviewSet(setId, newPages, withContinuations)
  await updateReviewSet(setId, { status: 'review' })
  report(opts.onProgress, {
    phase: 'done',
    message: 'Ready for review (' + withContinuations.length + ' tune'
      + (withContinuations.length === 1 ? '' : 's') + ')',
    tuneCount: withContinuations.length,
  })
  return updated
}

/**
 * Re-run OMR + ABC search for one tune (after merge/split/rename/regenerate).
 * Pass opts.omrBlob to OMR from a zones-only (or other) image without replacing the stored crop.
 */
export async function reprocessReviewTune(setId, tuneId, options) {
  const opts = options || {}
  const { getReviewSet, getReviewBlob, updateTuneInReviewSet } = await import('./bookImportReviewStore')
  const set = await getReviewSet(setId)
  if (!set) throw new Error('Review set not found')
  const tune = (set.tunes || []).find(function(t) { return t && String(t.id) === String(tuneId) })
  if (!tune) throw new Error('Tune not found')
  let blob = opts.omrBlob || null
  if (!blob) {
    blob = await getReviewBlob(tune.cropBlobKey)
  }
  if (!blob) throw new Error('Crop image missing')
  const enriched = await enrichTuneWithOmrAndAbc(tune, blob, {
    accessToken: opts.accessToken,
    resolverAvailable: opts.resolverAvailable,
    abcTools: opts.abcTools,
    book: set.book,
    signal: opts.signal,
    onProgress: opts.onProgress,
  })
  return updateTuneInReviewSet(setId, tuneId, enriched)
}
