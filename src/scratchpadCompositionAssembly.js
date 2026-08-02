import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { splitMelodyStrainsWithBarlines } from './chordBlockMerge'
import { commitChordSearchResultToTune } from './commitChordSearchResultToTune'
import { extractBarsFromMelodyText } from './lyricBarAlignmentUtils'
import { getScratchpadItem, blankNotationTune } from './scratchpadStore'
import { appendVoiceNoteLines } from './scratchpadNotationMerge'
import { applyNoteSpacingToTune } from './noteSpacingUtils'
import {
  createChordSheetNotationChunk,
  plainLyricLinesFromText,
  standardizeTextToChordProOnTune,
  sectionTextForChunk,
  generateCompositionChunkId,
} from './scratchpadCompositionChordImport'
import { setPlainLyricLines, getPlainLyricLines } from './wLinesUtils'
import { buildAbcFromTune } from './components/SuggestionPreviewDialog'

function cloneTune(tune) {
  return JSON.parse(JSON.stringify(tune || {}))
}

function sortChunks(chunks) {
  return (Array.isArray(chunks) ? chunks.slice() : []).sort(function(a, b) {
    const ao = Number(a && a.order) || 0
    const bo = Number(b && b.order) || 0
    return ao - bo
  })
}

function enabledChunks(chunks) {
  return sortChunks(chunks).filter(function(chunk) {
    return chunk && chunk.enabled !== false
  })
}

function textFromTextSection(item, sectionIndex) {
  return sectionTextForChunk(item, { sourceKind: 'text-section', sectionIndex: sectionIndex })
}

function textFromImageBlock(item, blockId) {
  return sectionTextForChunk(item, { sourceKind: 'image-text-block', sourceBlockId: blockId })
}

export function resolveChunkSourceText(item, chunk) {
  if (!item || !chunk) return ''
  if (chunk.sourceKind === 'image-text-block') {
    return textFromImageBlock(item, chunk.sourceBlockId)
  }
  if (chunk.sourceKind === 'text-section' || chunk.sourceKind === 'chord-sheet') {
    return textFromTextSection(item, chunk.sectionIndex)
  }
  if (item.type === 'text' && item.text) {
    return String(item.text.body || '')
  }
  if (item.type === 'image' && chunk.sourceBlockId) {
    return textFromImageBlock(item, chunk.sourceBlockId)
  }
  return ''
}

export function extractLyricsChunkLines(item, chunk) {
  const text = resolveChunkSourceText(item, chunk)
  if (!text.trim()) return []
  if (chunk && chunk.plainLyricsOnly) {
    return plainLyricLinesFromText(text)
  }
  return text.split(/\r?\n/)
}

function melodyNoteLinesFromTune(tune) {
  if (!tune || !tune.voices) return []
  const voiceKey = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[voiceKey]
  return voice && Array.isArray(voice.notes) ? voice.notes.slice() : []
}

export function strainTextFromTune(tune, strainIndex, fromBar, toBar) {
  const noteLines = melodyNoteLinesFromTune(tune)
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const strain = strains[strainIndex || 0]
  if (!strain) return ''
  let text = String(strain.text || '').trim()
  if (!text) return ''
  const bars = extractBarsFromMelodyText(text)
  const start = Math.max(1, parseInt(fromBar, 10) || 1)
  const end = toBar == null || toBar === '' ? bars.length : Math.max(start, parseInt(toBar, 10) || start)
  const slice = bars.slice(start - 1, end)
  if (!slice.length) return text
  return slice.join(' | ')
}

/**
 * ABC for NotationPreview of a single notation chunk (strain or chord sheet).
 */
export function buildAbcForNotationChunk(chunk) {
  if (!chunk) return ''
  if (chunk.sourceKind === 'chord-sheet') {
    if (chunk.derivedTuneSnapshot) {
      return buildAbcFromTune(chunk.derivedTuneSnapshot)
    }
    return ''
  }
  if (chunk.sourceKind === 'notation-strain') {
    const sourceItem = getScratchpadItem(chunk.sourceItemId)
    if (!sourceItem || sourceItem.type !== 'notation' || !sourceItem.notation) return ''
    const sourceTune = sourceItem.notation.tuneSnapshot
    const strainText = strainTextFromTune(
      sourceTune,
      chunk.strainIndex,
      chunk.fromBar,
      chunk.toBar
    )
    if (!String(strainText || '').trim()) return ''
    return buildAbcFromTune({
      meter: sourceTune.meter || '4/4',
      noteLength: sourceTune.noteLength || '1/8',
      key: sourceTune.key || 'C',
      voices: { V: { notes: [strainText] } },
    })
  }
  return ''
}

function reindexChunkOrders(chunks) {
  return (Array.isArray(chunks) ? chunks : []).map(function(chunk, index) {
    return Object.assign({}, chunk, { order: index })
  })
}

export function reorderCompositionChunks(composition, kind, chunkId, direction) {
  if (!composition || !chunkId) return composition
  const listKey = kind === 'lyrics' ? 'lyricsChunks' : 'notationChunks'
  const chunks = sortChunks(composition[listKey] || [])
  const index = chunks.findIndex(function(chunk) { return chunk && chunk.id === chunkId })
  if (index < 0) return composition
  const target = direction === 'up' ? index - 1 : index + 1
  if (target < 0 || target >= chunks.length) return composition
  const next = cloneTune(composition)
  const list = chunks.slice()
  const moving = list[index]
  list.splice(index, 1)
  list.splice(target, 0, moving)
  next[listKey] = reindexChunkOrders(list)
  return next
}

export function setCompositionPairing(composition, lyricsChunkId, notationChunkId) {
  if (!composition || !lyricsChunkId) return composition
  const next = cloneTune(composition)
  let pairings = Array.isArray(next.pairings) ? next.pairings.slice() : []
  const existingIndex = pairings.findIndex(function(pair) {
    return pair && pair.lyricsChunkId === lyricsChunkId
  })
  if (!notationChunkId) {
    if (existingIndex >= 0) pairings.splice(existingIndex, 1)
  } else if (existingIndex >= 0) {
    pairings[existingIndex] = Object.assign({}, pairings[existingIndex], {
      notationChunkId: notationChunkId,
    })
  } else {
    pairings.push({
      id: generateCompositionChunkId(),
      order: pairings.length,
      lyricsChunkId: lyricsChunkId,
      notationChunkId: notationChunkId,
    })
  }
  next.pairings = reindexPairingOrders(pairings)
  return next
}

function reindexPairingOrders(pairings) {
  return (Array.isArray(pairings) ? pairings : []).map(function(pair, index) {
    return Object.assign({}, pair, { order: index })
  })
}

function removeOrphanChunk(composition, kind, chunkId, pairingId) {
  const listKey = kind === 'lyrics' ? 'lyricsChunks' : 'notationChunks'
  const field = kind === 'lyrics' ? 'lyricsChunkId' : 'notationChunkId'
  const pairings = composition.pairings || []
  const stillUsed = pairings.some(function(pair) {
    return pair && pair.id !== pairingId && pair[field] === chunkId
  })
  if (stillUsed) return composition
  composition[listKey] = (composition[listKey] || []).filter(function(chunk) {
    return chunk && chunk.id !== chunkId
  })
  return composition
}

export function normalizeCompositionPairingRows(composition) {
  if (!composition) return composition
  const next = cloneTune(composition)
  const pairings = Array.isArray(next.pairings) ? next.pairings : []
  if (pairings.length && pairings.every(function(pair) { return pair && pair.id })) {
    next.pairings = reindexPairingOrders(pairings)
    return next
  }

  const built = buildCompositionPairings(next)
  const rows = []
  built.forEach(function(pair, index) {
    if (!pair.lyricsChunk && !pair.notationChunk) return
    rows.push({
      id: generateCompositionChunkId(),
      order: index,
      lyricsChunkId: pair.lyricsChunk ? pair.lyricsChunk.id : null,
      notationChunkId: pair.notationChunk ? pair.notationChunk.id : null,
    })
  })
  next.pairings = rows
  return next
}

export function buildCompositionPairingRows(composition) {
  const comp = composition || {}
  const lyricsById = {}
  const notationById = {}
  enabledChunks(comp.lyricsChunks).forEach(function(chunk) {
    lyricsById[chunk.id] = chunk
  })
  enabledChunks(comp.notationChunks).forEach(function(chunk) {
    notationById[chunk.id] = chunk
  })
  const rows = sortChunks(comp.pairings || []).filter(function(row) {
    return row && row.id
  })
  return rows.map(function(row) {
    return {
      id: row.id,
      order: row.order,
      lyricsChunk: row.lyricsChunkId ? lyricsById[row.lyricsChunkId] : null,
      notationChunk: row.notationChunkId ? notationById[row.notationChunkId] : null,
    }
  })
}

export function addCompositionPairingRow(composition) {
  if (!composition) return composition
  const next = cloneTune(composition)
  const pairings = Array.isArray(next.pairings) ? next.pairings.slice() : []
  pairings.push({
    id: generateCompositionChunkId(),
    order: pairings.length,
    lyricsChunkId: null,
    notationChunkId: null,
  })
  next.pairings = reindexPairingOrders(pairings)
  return next
}

export function removeCompositionPairingRow(composition, pairingId) {
  if (!composition || !pairingId) return composition
  const next = cloneTune(composition)
  const row = (next.pairings || []).find(function(pair) {
    return pair && pair.id === pairingId
  })
  if (!row) return composition
  next.pairings = reindexPairingOrders((next.pairings || []).filter(function(pair) {
    return pair && pair.id !== pairingId
  }))
  if (row.lyricsChunkId) {
    removeOrphanChunk(next, 'lyrics', row.lyricsChunkId, pairingId)
  }
  if (row.notationChunkId) {
    removeOrphanChunk(next, 'notation', row.notationChunkId, pairingId)
  }
  return next
}

export function assignLyricsChunkToPairingRow(composition, pairingId, chunk) {
  if (!composition || !pairingId || !chunk || !chunk.id) return composition
  const next = cloneTune(composition)
  const pairings = Array.isArray(next.pairings) ? next.pairings.slice() : []
  const index = pairings.findIndex(function(pair) { return pair && pair.id === pairingId })
  if (index < 0) return composition
  const row = pairings[index]
  if (row.lyricsChunkId && row.lyricsChunkId !== chunk.id) {
    removeOrphanChunk(next, 'lyrics', row.lyricsChunkId, pairingId)
  }
  const lyricsChunks = Array.isArray(next.lyricsChunks) ? next.lyricsChunks.slice() : []
  const existingIdx = lyricsChunks.findIndex(function(c) { return c && c.id === chunk.id })
  const nextChunk = Object.assign({}, chunk, { enabled: true })
  if (existingIdx >= 0) lyricsChunks[existingIdx] = Object.assign({}, lyricsChunks[existingIdx], nextChunk)
  else lyricsChunks.push(nextChunk)
  next.lyricsChunks = lyricsChunks
  pairings[index] = Object.assign({}, row, { lyricsChunkId: chunk.id })
  next.pairings = pairings
  return next
}

export function assignNotationChunkToPairingRow(composition, pairingId, chunk) {
  if (!composition || !pairingId || !chunk || !chunk.id) return composition
  const next = cloneTune(composition)
  const pairings = Array.isArray(next.pairings) ? next.pairings.slice() : []
  const index = pairings.findIndex(function(pair) { return pair && pair.id === pairingId })
  if (index < 0) return composition
  const row = pairings[index]
  if (row.notationChunkId && row.notationChunkId !== chunk.id) {
    removeOrphanChunk(next, 'notation', row.notationChunkId, pairingId)
  }
  const notationChunks = Array.isArray(next.notationChunks) ? next.notationChunks.slice() : []
  const existingIdx = notationChunks.findIndex(function(c) { return c && c.id === chunk.id })
  const nextChunk = Object.assign({}, chunk, { enabled: true })
  if (existingIdx >= 0) notationChunks[existingIdx] = Object.assign({}, notationChunks[existingIdx], nextChunk)
  else notationChunks.push(nextChunk)
  next.notationChunks = notationChunks
  pairings[index] = Object.assign({}, row, { notationChunkId: chunk.id })
  next.pairings = pairings
  return next
}

function strainNoteLinesFromTune(tune, strainIndex, fromBar, toBar) {
  const text = strainTextFromTune(tune, strainIndex, fromBar, toBar)
  if (!text) return []
  return [text]
}

function chunkSourceKey(chunk) {
  if (!chunk) return ''
  return [
    chunk.sourceItemId || '',
    chunk.sourceKind || '',
    chunk.sectionIndex != null ? chunk.sectionIndex : '',
    chunk.sourceBlockId || '',
    chunk.strainIndex != null ? chunk.strainIndex : '',
  ].join(':')
}

function notationChunkCoversLyricsSource(notationChunk, lyricsChunk) {
  if (!notationChunk || !lyricsChunk) return false
  if (notationChunk.sourceKind !== 'chord-sheet') return false
  if (notationChunk.sourceItemId !== lyricsChunk.sourceItemId) return false
  if (notationChunk.sourceBlockId && lyricsChunk.sourceBlockId) {
    return notationChunk.sourceBlockId === lyricsChunk.sourceBlockId
  }
  if (notationChunk.sectionIndex != null && lyricsChunk.sectionIndex != null) {
    return notationChunk.sectionIndex === lyricsChunk.sectionIndex
  }
  return notationChunk.sourceItemId === lyricsChunk.sourceItemId
}

function mergeChordSheetIntoTune(tune, text, options) {
  const opts = options || {}
  if (!text || !String(text).trim()) return tune
  const committed = commitChordSearchResultToTune({
    result: { chordText: String(text) },
    tune: tune,
    tunebook: opts.tunebook,
    abcjsParser: opts.abcjsParser,
    abc: opts.abc,
    updateLyrics: opts.updateLyrics !== false,
    skipSave: true,
    historyLabel: 'Composition chord sheet merge',
  })
  if (!committed.ok) {
    throw new Error(
      (committed.error && committed.error.message)
        ? committed.error.message
        : 'Could not merge chord sheet'
    )
  }
  return committed.tune
}

function mergeDerivedTuneSnapshot(baseTune, derivedTune) {
  if (!derivedTune) return baseTune
  const next = cloneTune(baseTune)
  if (derivedTune.voices) {
    next.voices = cloneTune(derivedTune.voices)
  }
  if (derivedTune.meta) {
    next.meta = Object.assign({}, next.meta || {}, derivedTune.meta)
  }
  if (derivedTune.meter) next.meter = derivedTune.meter
  if (derivedTune.key) next.key = derivedTune.key
  if (derivedTune.noteLength) next.noteLength = derivedTune.noteLength
  if (derivedTune.timingScaffold) next.timingScaffold = derivedTune.timingScaffold
  return next
}

/**
 * Assemble composition working tune from chunk references.
 */
export function assembleCompositionTune(composition, options) {
  const opts = options || {}
  if (!composition) return null

  const baseSnapshot = composition.tuneSnapshot || blankNotationTune()
  let tune = cloneTune(baseSnapshot)
  const lyricsChunks = enabledChunks(composition.lyricsChunks)
  const notationChunks = enabledChunks(composition.notationChunks)
  const coveredLyricSources = {}

  notationChunks.forEach(function(notationChunk) {
    if (notationChunk.sourceKind !== 'chord-sheet') return
    const sourceItem = getScratchpadItem(notationChunk.sourceItemId)
    const text = notationChunk.sourceText || resolveChunkSourceText(sourceItem, notationChunk)
  if (!text.trim()) return

    const updateLyrics = notationChunk.chordMode === 'chords-and-lyrics'
    if (updateLyrics) {
      coveredLyricSources[chunkSourceKey(notationChunk)] = true
    }

    if (notationChunk.derivedTuneSnapshot) {
      tune = mergeDerivedTuneSnapshot(tune, notationChunk.derivedTuneSnapshot)
      if (updateLyrics && notationChunk.parsed && Array.isArray(notationChunk.parsed.lyricLines)) {
        setPlainLyricLines(tune, notationChunk.parsed.lyricLines)
      }
    } else if (opts.tunebook && opts.abcjsParser) {
      const abc = opts.tunebook.abcTools ? opts.tunebook.abcTools.json2abc(tune) : undefined
      tune = mergeChordSheetIntoTune(tune, text, {
        tunebook: opts.tunebook,
        abcjsParser: opts.abcjsParser,
        abc: abc,
        updateLyrics: updateLyrics,
      })
    }
  })

  let melodyLines = []
  notationChunks.forEach(function(notationChunk) {
    if (notationChunk.sourceKind !== 'notation-strain') return
    const sourceItem = getScratchpadItem(notationChunk.sourceItemId)
    if (!sourceItem || sourceItem.type !== 'notation' || !sourceItem.notation) return
    const sourceTune = sourceItem.notation.tuneSnapshot
    const strainLines = strainNoteLinesFromTune(
      sourceTune,
      notationChunk.strainIndex,
      notationChunk.fromBar,
      notationChunk.toBar
    )
    if (!strainLines.length) return
    if (!melodyLines.length) {
      melodyLines = strainLines.slice()
    } else {
      const separator = ' || '
      const lastIdx = melodyLines.length - 1
      melodyLines[lastIdx] = (melodyLines[lastIdx] + separator).trim()
      melodyLines = appendVoiceNoteLines(melodyLines, strainLines)
    }
  })

  if (melodyLines.length) {
    const voiceKey = resolvePrimaryVoiceKey(tune.voices || { V: { notes: ['z4'] } })
    tune.voices = Object.assign({}, tune.voices || {})
    tune.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey] || {}, {
      notes: melodyLines,
    })
  }

  const lyricLines = []
  lyricsChunks.forEach(function(lyricsChunk) {
    const key = chunkSourceKey(lyricsChunk)
    const covered = notationChunks.some(function(notationChunk) {
      return notationChunkCoversLyricsSource(notationChunk, lyricsChunk)
    })
    if (covered || coveredLyricSources[key]) return

    const sourceItem = getScratchpadItem(lyricsChunk.sourceItemId)
    const lines = extractLyricsChunkLines(sourceItem, lyricsChunk)
    lines.forEach(function(line) { lyricLines.push(line) })
    if (lyricLines.length && lines.length) lyricLines.push('')
  })
  while (lyricLines.length && String(lyricLines[lyricLines.length - 1]).trim() === '') {
    lyricLines.pop()
  }

  if (lyricLines.length) {
    const existing = getPlainLyricLines(tune)
    if (!existing.some(function(line) { return String(line || '').trim().length > 0 })) {
      setPlainLyricLines(tune, lyricLines)
    } else if (opts.mergeLyrics) {
      setPlainLyricLines(tune, existing.concat([''], lyricLines))
    }
  }

  try {
    const wLines = applyNoteSpacingToTune(tune)
    if (Array.isArray(wLines)) tune.wLines = wLines
  } catch (e) {
    // keep existing wLines on spacing failure
  }

  return tune
}

export function buildCompositionPairings(composition) {
  const lyricsChunks = enabledChunks(composition && composition.lyricsChunks)
  const notationChunks = enabledChunks(composition && composition.notationChunks)
  const explicit = Array.isArray(composition && composition.pairings) ? composition.pairings : []
  const pairings = []
  const usedNotationIds = new Set()

  explicit.forEach(function(pair) {
    if (pair && pair.notationChunkId) usedNotationIds.add(pair.notationChunkId)
  })

  lyricsChunks.forEach(function(lyricsChunk) {
    const explicitPair = explicit.find(function(pair) {
      return pair && pair.lyricsChunkId === lyricsChunk.id
    })
    let notationChunk = null
    if (explicitPair && explicitPair.notationChunkId) {
      notationChunk = notationChunks.find(function(chunk) {
        return chunk.id === explicitPair.notationChunkId
      })
    }
    if (!notationChunk) {
      notationChunk = notationChunks.find(function(chunk) {
        return chunk && !usedNotationIds.has(chunk.id)
      })
    }
    if (notationChunk) usedNotationIds.add(notationChunk.id)
    pairings.push({
      lyricsChunk: lyricsChunk,
      notationChunk: notationChunk || null,
    })
  })

  notationChunks.forEach(function(notationChunk) {
    const alreadyPaired = pairings.some(function(pair) {
      return pair.notationChunk && pair.notationChunk.id === notationChunk.id
    })
    if (!alreadyPaired) {
      pairings.push({ lyricsChunk: null, notationChunk: notationChunk })
    }
  })

  return pairings
}

export function applyEmbeddedChordAction(composition, action, context) {
  const ctx = context || {}
  const text = String(ctx.text || '').trim()
  if (!text || !composition) return { ok: false, error: { message: 'Missing text or composition' } }

  const compositionCopy = cloneTune(composition)
  compositionCopy.lyricsChunks = Array.isArray(composition.lyricsChunks) ? composition.lyricsChunks.slice() : []
  compositionCopy.notationChunks = Array.isArray(composition.notationChunks) ? composition.notationChunks.slice() : []

  if (action === 'chordpro') {
    const tune = cloneTune(composition.tuneSnapshot || blankNotationTune())
    const result = standardizeTextToChordProOnTune(tune, text, { skipLyrics: false })
    if (!result.ok) return result
    compositionCopy.tuneSnapshot = result.tune
    if (ctx.lyricsChunk) {
      compositionCopy.lyricsChunks.push(Object.assign({}, ctx.lyricsChunk, {
        plainLyricsOnly: false,
      }))
    }
    return { ok: true, composition: compositionCopy }
  }

  if (action === 'notation-block') {
    const chunkResult = createChordSheetNotationChunk(text, {
      tunebook: ctx.tunebook,
      abcjsParser: ctx.abcjsParser,
      title: ctx.label,
      label: ctx.label,
      sourceItemId: ctx.sourceItemId,
      sourceBlockId: ctx.sourceBlockId,
      sectionIndex: ctx.sectionIndex,
      chordMode: 'chords-only',
      order: compositionCopy.notationChunks.length,
    })
    if (!chunkResult.ok) return chunkResult
    compositionCopy.notationChunks.push(chunkResult.chunk)
    if (ctx.lyricsChunk) {
      compositionCopy.lyricsChunks.push(Object.assign({}, ctx.lyricsChunk, {
        plainLyricsOnly: true,
      }))
    }
    return { ok: true, composition: compositionCopy, notationChunk: chunkResult.chunk }
  }

  if (ctx.lyricsChunk) {
    compositionCopy.lyricsChunks.push(Object.assign({}, ctx.lyricsChunk, {
      plainLyricsOnly: true,
    }))
  }
  return { ok: true, composition: compositionCopy }
}
