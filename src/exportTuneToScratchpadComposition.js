import { toast } from 'react-toastify'
import {
  bestStanzaNameMatch,
  normalizeSectionType,
  normalizeStanzaNameKey,
} from './chordSheetUtils'
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { listLyricSections, sectionDisplayTitle, serializeLyricStructure } from './lyricStructureUtils'
import { registerLongRunningJob } from './longRunningJobRegistry'
import { assembleCompositionTune } from './scratchpadCompositionAssembly'
import { generateCompositionChunkId } from './scratchpadCompositionChordImport'
import { listNotationStrainsForTune } from './scratchpadCompositionNotation'
import {
  createScratchpadItem,
  updateScratchpadItem,
  blankNotationTune,
} from './scratchpadStore'
import { showScratchpadExportToast } from './scratchpadExportToast'
import { getPlainLyricLines } from './wLinesUtils'
import { voiceMetaToAbcString } from './notation/voiceMeta'

function cloneTune(tune) {
  return JSON.parse(JSON.stringify(tune || {}))
}

function normalizeTuneVoiceMeta(tune) {
  const next = cloneTune(tune)
  if (!next.voices || typeof next.voices !== 'object') return next
  Object.keys(next.voices).forEach(function(voiceKey) {
    const voice = next.voices[voiceKey]
    if (!voice) return
    voice.meta = voiceMetaToAbcString(voice.meta)
  })
  return next
}

function seedCompositionTuneSnapshot(tune) {
  const seed = blankNotationTune(null, tune && tune.name)
  if (!tune) return seed
  if (tune.composer) seed.composer = tune.composer
  if (tune.key) seed.key = tune.key
  if (tune.meter) seed.meter = tune.meter
  if (tune.noteLength) seed.noteLength = tune.noteLength
  if (tune.rhythm) seed.rhythm = tune.rhythm
  if (Array.isArray(tune.chordSectionLabels)) {
    seed.chordSectionLabels = tune.chordSectionLabels.slice()
  }
  if (tune.meta) seed.meta = cloneTune(tune.meta)
  seed.words = []
  seed.wLines = []
  seed.voices = {
    V: { notes: ['z4'], meta: seed.voices.V.meta },
  }
  return seed
}

function tuneHasNotation(tune) {
  if (!tune || !tune.voices) return false
  const voiceKey = resolvePrimaryVoiceKey(tune.voices)
  const voice = tune.voices[voiceKey]
  if (!voice || !Array.isArray(voice.notes)) return false
  return voice.notes.some(function(line) {
    return String(line || '').trim().length > 0
  })
}

function tuneHasLyrics(tune) {
  const lines = getPlainLyricLines(tune)
  return lines.some(function(line) {
    return String(line || '').trim().length > 0
  })
}

export function chordSectionLabelText(entry) {
  if (entry == null) return ''
  if (typeof entry === 'string') return entry.trim()
  if (typeof entry === 'object') {
    const title = String(entry.title || '').trim()
    if (title) return title
    const header = String(entry.header || '').trim()
    if (header) {
      return header
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .replace(/^#+\s*/, '')
        .trim() || header
    }
  }
  return ''
}

function strainLabelForIndex(strains, index, chordSectionLabels) {
  if (Array.isArray(chordSectionLabels) && chordSectionLabels[index]) {
    const label = chordSectionLabelText(chordSectionLabels[index])
    if (label) return label
  }
  const strain = strains[index]
  if (strain && strain.label) return String(strain.label).trim()
  return 'Strain ' + (index + 1)
}

function lyricSectionType(section) {
  if (!section) return null
  const header = String(section.header || '').trim()
  return header ? normalizeSectionType(header) : (section.type || null)
}

function buildLyricsChunks(textItemId, sections) {
  if (!sections.length) return []
  if (sections.length === 1) {
    const section = sections[0]
    return [{
      id: generateCompositionChunkId(),
      sourceKind: 'text-section',
      sourceItemId: textItemId,
      wholeItem: true,
      label: section.title || sectionDisplayTitle(section) || 'Lyrics',
      order: 0,
      enabled: true,
      plainLyricsOnly: true,
    }]
  }
  return sections.map(function(section, index) {
    return {
      id: generateCompositionChunkId(),
      sourceKind: 'text-section',
      sourceItemId: textItemId,
      sectionIndex: index,
      sectionMarker: section.header || '',
      label: section.title || sectionDisplayTitle(section) || ('Section ' + (index + 1)),
      order: index,
      enabled: true,
      plainLyricsOnly: true,
    }
  })
}

function buildNotationChunks(notationItemId, strains, chordSectionLabels) {
  if (!strains.length) return []
  if (strains.length === 1) {
    const strain = strains[0]
    return [{
      id: generateCompositionChunkId(),
      sourceKind: 'notation-strain',
      sourceItemId: notationItemId,
      wholeItem: true,
      label: strainLabelForIndex(strains, 0, chordSectionLabels),
      order: 0,
      enabled: true,
    }]
  }
  return strains.map(function(strain, index) {
    return {
      id: generateCompositionChunkId(),
      sourceKind: 'notation-strain',
      sourceItemId: notationItemId,
      strainIndex: index,
      strainMarker: strain.marker || '',
      label: strainLabelForIndex(strains, index, chordSectionLabels),
      order: index,
      enabled: true,
    }
  })
}

function notationChunkType(notationChunk, strains, chordSectionLabels) {
  const index = notationChunk.strainIndex != null ? notationChunk.strainIndex : 0
  if (Array.isArray(chordSectionLabels) && chordSectionLabels[index]) {
    const entry = chordSectionLabels[index]
    if (entry && typeof entry === 'object' && entry.type) {
      return entry.type
    }
  }
  const label = strainLabelForIndex(strains, index, chordSectionLabels)
  return label ? normalizeSectionType(label) : null
}

function lyricChunkType(lyricsChunk, sections) {
  if (lyricsChunk.wholeItem) {
    return lyricSectionType(sections[0])
  }
  const index = lyricsChunk.sectionIndex != null ? lyricsChunk.sectionIndex : 0
  return lyricSectionType(sections[index])
}

function lyricChunkTitle(lyricsChunk, sections) {
  if (lyricsChunk.wholeItem) {
    const section = sections[0]
    return section ? (section.title || sectionDisplayTitle(section)) : lyricsChunk.label
  }
  const index = lyricsChunk.sectionIndex != null ? lyricsChunk.sectionIndex : 0
  const section = sections[index]
  if (section) {
    return section.title || sectionDisplayTitle(section) || lyricsChunk.label
  }
  return lyricsChunk.label
}

/**
 * Guess lyrics↔notation pairings using type, title, fuzzy title, then positional fallback.
 * Returns pairings array: [{ id, order, lyricsChunkId, notationChunkId }]
 */
export function guessCompositionPairingsFromStructure(lyricsChunks, notationChunks, context) {
  const ctx = context || {}
  const sections = Array.isArray(ctx.lyricSections) ? ctx.lyricSections : []
  const strains = Array.isArray(ctx.strains) ? ctx.strains : []
  const chordSectionLabels = Array.isArray(ctx.chordSectionLabels) ? ctx.chordSectionLabels : null

  const lyrics = (Array.isArray(lyricsChunks) ? lyricsChunks.slice() : [])
    .sort(function(a, b) { return (a.order || 0) - (b.order || 0) })
  const notation = (Array.isArray(notationChunks) ? notationChunks.slice() : [])
    .sort(function(a, b) { return (a.order || 0) - (b.order || 0) })

  const usedNotationIds = new Set()
  const explicitPairs = []

  function findNotationByType(type) {
    if (!type) return null
    return notation.find(function(chunk) {
      if (!chunk || usedNotationIds.has(chunk.id)) return false
      return notationChunkType(chunk, strains, chordSectionLabels) === type
    })
  }

  function findNotationByTitle(title) {
    const want = normalizeStanzaNameKey(title)
    if (!want) return null
    return notation.find(function(chunk) {
      if (!chunk || usedNotationIds.has(chunk.id)) return false
      return normalizeStanzaNameKey(chunk.label) === want
    })
  }

  function findNotationByFuzzy(title) {
    const candidates = notation
      .filter(function(chunk) { return chunk && !usedNotationIds.has(chunk.id) })
      .map(function(chunk, index) {
        return { label: chunk.label, index: index, chunk: chunk }
      })
    const hit = bestStanzaNameMatch(title, candidates, { minScore: 0.85 })
    return hit && hit.candidate ? hit.candidate.chunk : null
  }

  function takeNextUnusedNotation() {
    return notation.find(function(chunk) {
      return chunk && !usedNotationIds.has(chunk.id)
    }) || null
  }

  lyrics.forEach(function(lyricsChunk) {
    let notationChunk = null
    const type = lyricChunkType(lyricsChunk, sections)
    const title = lyricChunkTitle(lyricsChunk, sections)

    if (type) notationChunk = findNotationByType(type)
    if (!notationChunk && title) notationChunk = findNotationByTitle(title)
    if (!notationChunk && title) notationChunk = findNotationByFuzzy(title)
    if (!notationChunk) notationChunk = takeNextUnusedNotation()

    if (notationChunk) usedNotationIds.add(notationChunk.id)
    explicitPairs.push({
      lyricsChunk: lyricsChunk,
      notationChunk: notationChunk,
    })
  })

  notation.forEach(function(notationChunk) {
    if (!notationChunk || usedNotationIds.has(notationChunk.id)) return
    explicitPairs.push({
      lyricsChunk: null,
      notationChunk: notationChunk,
    })
  })

  return explicitPairs.map(function(pair, index) {
    return {
      id: generateCompositionChunkId(),
      order: index,
      lyricsChunkId: pair.lyricsChunk ? pair.lyricsChunk.id : null,
      notationChunkId: pair.notationChunk ? pair.notationChunk.id : null,
    }
  })
}

export async function exportTuneToScratchpadComposition(options) {
  const opts = options || {}
  const tune = opts.tune
  const workspaceId = opts.workspaceId
  if (!tune || !tune.id) {
    throw new Error('Missing tune')
  }
  if (!workspaceId) {
    throw new Error('Choose a scratchpad workspace')
  }

  const unregister = registerLongRunningJob({ label: 'Copy tune to scratchpad' })
  try {
    const tuneName = String(tune.name || 'Tune').trim() || 'Tune'
    const hasLyrics = tuneHasLyrics(tune)
    const hasNotation = tuneHasNotation(tune)

    if (!hasLyrics && !hasNotation) {
      throw new Error('Tune has no lyrics or notation to export')
    }

    const lyricLines = getPlainLyricLines(tune)
    const lyricSections = hasLyrics ? listLyricSections(lyricLines) : []
    const strains = hasNotation ? listNotationStrainsForTune(tune) : []
    const chordSectionLabels = Array.isArray(tune.chordSectionLabels)
      ? tune.chordSectionLabels.slice()
      : null

    let textItem = null
    let notationItem = null

    if (hasLyrics) {
      const lyricsBody = lyricSections.length
        ? serializeLyricStructure(lyricSections)
        : lyricLines.join('\n')
      textItem = await createScratchpadItem({
        workspaceId: workspaceId,
        type: 'text',
        title: tuneName + ' — Lyrics',
        textBody: lyricsBody,
      })
    }

    if (hasNotation) {
      notationItem = await createScratchpadItem({
        workspaceId: workspaceId,
        type: 'notation',
        title: tuneName + ' — Notation',
        tuneSnapshot: normalizeTuneVoiceMeta(tune),
      })
    }

    const lyricsChunks = textItem
      ? buildLyricsChunks(textItem.id, lyricSections.length ? lyricSections : [{ header: '', lines: lyricLines, title: 'Lyrics' }])
      : []
    const notationChunks = notationItem
      ? buildNotationChunks(notationItem.id, strains, chordSectionLabels)
      : []

    const pairings = guessCompositionPairingsFromStructure(lyricsChunks, notationChunks, {
      lyricSections: lyricSections.length ? lyricSections : [{ header: '', lines: lyricLines, title: 'Lyrics' }],
      strains: strains,
      chordSectionLabels: chordSectionLabels,
    })

    const composition = {
      tuneSnapshot: seedCompositionTuneSnapshot(tune),
      lyricsChunks: lyricsChunks,
      notationChunks: notationChunks,
      pairings: pairings,
      mediaAttachments: [],
      assemblyStale: false,
    }

    const assembled = assembleCompositionTune(composition, {
      tunebook: opts.tunebook,
      abcjsParser: opts.abcjsParser,
    })
    if (assembled) composition.tuneSnapshot = assembled

    const item = await createScratchpadItem({
      workspaceId: workspaceId,
      type: 'composition',
      title: tuneName,
      composition: composition,
    })

    const linked = updateScratchpadItem(item.id, { linkedTuneId: tune.id })

    showScratchpadExportToast({
      message: 'Tune copied to scratchpad composition',
      itemId: item.id,
      onOpen: opts.onOpenItem,
    })

    return linked || item
  } catch (e) {
    if (!e || !e.message || e.message.indexOf('cancelled') === -1) {
      toast.error(e && e.message ? e.message : 'Could not copy tune to scratchpad')
    }
    throw e
  } finally {
    unregister()
  }
}
