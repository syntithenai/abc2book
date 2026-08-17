/**
 * Block-scoped chord merge: melody strains are canonical; chart/lyric attach
 * at extract. Lyric alignment never drives ABC merge.
 */
import {
  extractBarsFromMelodyText,
  flattenMelodyText,
  splitMelodyIntoBlocks,
} from './lyricBarAlignmentUtils'
import {
  splitMelodyStrainsWithBarlines,
  strainJoinSeparator,
  countFullBarsInMelodyStrain,
} from './melodyStrainSplit'
import {
  normalizeSectionType,
  splitChordChartIntoBlocks,
  splitChartHeaderAndBody,
  joinChartHeaderAndBody,
  extractChordBars,
  melodyTextHasSectionMarkerChord,
  firstSectionMarkerHeaderInMelodyText,
  expandLegacyBeatSlotsInChart,
  extractChartBarSlotGrids,
  isSectionMarkerToken,
  splitChordChartLineIntoBars,
  rebalanceChartPulseSlots,
  parseChartStructureMarkers,
  stripChartStructureMarkers,
  alignChordBlocksToLyrics,
  expandChartsToStrainSlices,
  isSectionMarkerChordName,
  isInlineSignatureToken,
  tokenIsChord,
  tokenIsChartStructureMarker,
} from './chordSheetUtils'
import { countFirstOccurrenceLyricSections, listLyricSections, sectionDisplayTitle } from './lyricStructureUtils'
import { normalizeMeter, getBarModel, beatPositionsForBarChords } from './barModel'
import { normalizeKeySignature } from './keySignatureNormalize'
import {
  chordSectionLabelsFromSections,
  extractKeyFromChartBlock,
  extractMeterFromChartBlock,
  extractTempoFromChartBlock,
  firstSectionKey,
  firstSectionMeter,
  firstSectionTempo,
  normalizeTempo,
  prependInlineSignatureMarkers,
  prependInlineSignatureMarkersRespectingMelody,
  rebuildChordGridFromSections,
  stripInlineSignatureMarkers,
} from './chordsEditorSections'
import { clearTransientTimedFields, noteLinesHaveRealMelody } from './timedImportFinalizer'
import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import {
  getPlainLyricLines,
  setNoteAlignedLyricLines,
  setPlainLyricLines,
} from './wLinesUtils'
import { buildNotationWLines } from './noteSpacingUtils'
import { applyChordDisplayTranspose } from './chordKeyMergeOptions'

const CACHE_VERSION = 5

const MERGE_FAILURE_FIX = {
  chart_parse_error: 'Fix the chord grid syntax in this section; one | per bar.',
  invalid_chord_symbol: 'Correct chord spelling in the grid (e.g. Am, G7, F#m).',
  invalid_meter: 'Set a valid time signature (e.g. 4/4, 3/4, 6/8).',
  chart_shorter_than_melody: 'Add bars to the chord grid, or shorten melody in Music / ABC tab.',
  chart_longer_no_room: 'Add bars in ABC / Music tab, or remove extra bars from the chord grid.',
  anchor_stale: 'Re-open the chords tab to refresh, then retry.',
  anchor_missing_range: 'Add matching bars in ABC for the new section, or remove the extra blank-line block.',
  block_count_mismatch: 'Re-open the chords tab to refresh the chord grid from notation, then retry.',
  anacrusis_bar_mismatch: 'Align pickup in the chord grid or Music tab.',
  meter_change_unsupported: 'Move [M:…] to the start of a bar line, or set meter in the ABC header.',
  strain_barline_conflict: 'Edit barlines in the ABC tab to match section structure, then retry.',
  ending_structure_conflict: 'Edit first/second endings in the ABC tab first.',
  no_primary_voice: 'Add a voice in the ABC tab or import notation first.',
  abc_parse_error: 'Fix syntax errors in the ABC tab.',
  timed_media_conflict: 'This tune has timed media — add/remove bars in Music tab first, or edit only chord names without changing bar count.',
  invariant_violation: 'Use Undo; re-open the chords tab to refresh anchors.',
}

export function mergeFailure(code, message, extras) {
  const extra = extras || {}
  return Object.assign({
    code: code,
    message: message || code,
    fixHint: MERGE_FAILURE_FIX[code] || 'Fix the chord grid or ABC notation, then retry.',
  }, extra)
}

export function hashAbcNotes(noteLines) {
  const normalized = noteLinesForMelodyMerge(noteLines)
    .map(function(line) { return String(line || '').replace(/\s+/g, ' ').trim() })
    .filter(Boolean)
    .join('\n')
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i)
    h1 = Math.imul(h1 ^ ch, 2654435761)
    h2 = Math.imul(h2 ^ ch, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return String(4294967296 * (2097151 & h2) + (h1 >>> 0))
}

/** Drop voice-local %%MIDI and % comment lines before strain split / mergeChords. */
export function noteLinesForMelodyMerge(noteLines) {
  return (Array.isArray(noteLines) ? noteLines : []).filter(function(line) {
    const trimmed = String(line || '').trim()
    if (!trimmed) return false
    if (/^%%MIDI\s/i.test(trimmed)) return false
    if (/^%/.test(trimmed)) return false
    return true
  })
}

function voiceProgramPrefixLines(noteLines) {
  const lines = Array.isArray(noteLines) ? noteLines : []
  const prefix = lines.find(function(line) {
    return /^%%MIDI\s/i.test(String(line || '').trim())
  })
  return prefix ? [prefix] : []
}

function noteLinesFromAbcForMerge(abcString, abcTools) {
  if (!abcTools) return []
  if (typeof abcTools.justNotesNoMeta === 'function') {
    return String(abcTools.justNotesNoMeta(abcString)).split('\n')
  }
  return noteLinesForMelodyMerge(abcTools.justNotes(abcString).split('\n'))
}

/** Re-attach %%MIDI (etc.) prefix lines after a melody-only merge body. */
export function mergeNoteLinesWithVoicePrefixes(prefixSource, melodyLines) {
  const prefixes = voiceProgramPrefixLines(prefixSource)
  const body = noteLinesForMelodyMerge(melodyLines)
  if (!prefixes.length) return body.length ? body : ['']
  return prefixes.concat(body.length ? body : [''])
}

function noteLinesHaveMergeableBars(noteLines) {
  return noteLinesForMelodyMerge(noteLines).some(function(line) {
    return extractBarsFromMelodyText(line).length > 0
  })
}

/** Prefer live editor voice lines when json2abc / justNotes round-trip drops melody. */
function primaryVoiceNotesForMerge(abcString, abcTools, opts) {
  const notesBefore = Array.isArray(opts.notesBefore) ? opts.notesBefore : []
  let fromAbc = []
  try {
    fromAbc = noteLinesFromAbcForMerge(abcString, abcTools)
  } catch (e) {
    fromAbc = []
  }
  const fromBefore = noteLinesForMelodyMerge(notesBefore)
  // Rest-scaffold songs (chord-only z bars) are not "real melody", but notesBefore
  // still holds the live voice — use it when ABC extraction came back empty/corrupt.
  if (
    noteLinesHaveMergeableBars(fromBefore)
    && (
      !noteLinesHaveMergeableBars(fromAbc)
      || (!noteLinesHaveRealMelody(fromAbc) && noteLinesHaveRealMelody(fromBefore))
    )
  ) {
    return fromBefore
  }
  return noteLinesHaveMergeableBars(fromAbc) ? fromAbc : fromBefore
}

function prefixSourceForMerge(abcString, abcTools, opts) {
  const notesBefore = Array.isArray(opts.notesBefore) ? opts.notesBefore : []
  if (notesBefore.length > 0) return notesBefore.slice()
  try {
    return abcTools.justNotes(abcString).split('\n')
  } catch (e) {
    return []
  }
}

function voicesHintForMerge(abcString, abcTools, opts) {
  try {
    return headerFromAbc(abcString, abcTools).abcJson.voices
  } catch (e) {
    return opts.tune && opts.tune.voices
  }
}

function barHasPitch(barText) {
  const stripped = String(barText || '').replace(/"([^"]*)"/g, '')
  return /[a-gA-G]/.test(stripped)
}

function strainTextHasPitch(strainText) {
  const bars = extractBarsFromMelodyText(String(strainText || ''))
  return bars.some(function(bar) { return barHasPitch(bar) })
}

/** Bracket chord clusters ([aa], [bc]2) — mergeChords cannot preserve this voicing. */
function melodyUsesBracketChordClusters(noteLines) {
  return noteLinesForMelodyMerge(noteLines).some(function(line) {
    return /\[[a-gA-G]{2,}\]/.test(String(line || ''))
  })
}

function barIsChordScaffold(barText) {
  const text = String(barText || '').trim()
  if (!text) return false
  if (barHasPitch(text)) return false
  if (/"[^"]+"/.test(text) && /[zZ]/.test(text.replace(/"([^"]*)"/g, ''))) return true
  return false
}

function barIsRestOnly(barText) {
  const stripped = String(barText || '').replace(/"([^"]*)"/g, '').trim()
  if (!stripped) return true
  if (barHasPitch(stripped)) return false
  return /[zZx]/.test(stripped) || !/[a-gA-G]/.test(stripped)
}

/**
 * Classify a single bar of melody text.
 * @returns {'pitch'|'rest'|'chord_scaffold'|'empty'}
 */
export function classifyBar(barText) {
  const text = String(barText || '').trim()
  if (!text) return 'empty'
  if (barHasPitch(text)) return 'pitch'
  if (barIsChordScaffold(text)) return 'chord_scaffold'
  if (barIsRestOnly(text)) return 'rest'
  return 'empty'
}

const CLASS_RANK = { empty: 0, chord_scaffold: 1, rest: 2, pitch: 3 }

export function classifyBarsInRange(noteLines, abcBarStart, abcBarEnd) {
  const flat = flattenMelodyText(noteLines)
  const bars = extractBarsFromMelodyText(flat)
  const start = Math.max(0, abcBarStart | 0)
  const end = Math.min(bars.length - 1, abcBarEnd | 0)
  const classes = []
  for (let i = start; i <= end && i < bars.length; i++) {
    classes.push(classifyBar(bars[i]))
  }
  return classes
}

export function blockMergeMode(classes) {
  let max = 'empty'
  ;(classes || []).forEach(function(c) {
    if ((CLASS_RANK[c] || 0) > (CLASS_RANK[max] || 0)) max = c
  })
  return max
}

export function countChartBars(chart) {
  const split = splitChartHeaderAndBody(chart || '')
  const text = stripInlineSignatureMarkers(split.body || '')
  if (!String(text).trim()) return 0
  let count = 0
  String(text).split('\n').forEach(function(line) {
    if (!String(line || '').trim()) return
    const parts = splitChordChartLineIntoBars(line)
    parts.bars.forEach(function(segment) {
      // Orphan [M:]/[K:]/[Q:] tokens are prefixes, not sounding bars.
      const tokens = String(segment || '').trim().split(/\s+/).filter(Boolean)
      if (tokens.length > 0 && tokens.every(isInlineSignatureToken)) return
      count += 1
    })
  })
  return count
}

/**
 * Full chart bar segments (body text + barline), preserving `/`, `.`, leading
 * [M:]/[K:]/[Q:] markers, and soft line breaks from the source chart (ABC
 * system breaks). Signature-only orphans are folded into the following bar.
 */
export function extractChartBarSegments(chordChart) {
  const segments = []
  let pendingPrefix = ''
  let pendingLineBreak = false
  String(chordChart == null ? '' : chordChart).split('\n').forEach(function(line, lineIndex) {
    if (!String(line || '').trim()) return
    const parts = splitChordChartLineIntoBars(line)
    let firstOnLine = true
    parts.bars.forEach(function(segment, index) {
      const raw = String(segment || '')
      const tokens = raw.trim().split(/\s+/).filter(Boolean)
      const barline = parts.barlines[index] || '|'
      if (tokens.length > 0 && tokens.every(isInlineSignatureToken)) {
        pendingPrefix = [pendingPrefix, tokens.join(' ')].filter(Boolean).join(' ')
        if (lineIndex > 0 && firstOnLine) pendingLineBreak = true
        firstOnLine = false
        return
      }
      const body = [pendingPrefix, raw.trim()].filter(Boolean).join(' ').trim()
      const lineBreakBefore = pendingLineBreak || (lineIndex > 0 && firstOnLine && segments.length > 0)
      pendingPrefix = ''
      pendingLineBreak = false
      firstOnLine = false
      segments.push({ text: body, barline: barline, lineBreakBefore: !!lineBreakBefore })
    })
  })
  if (pendingPrefix) {
    segments.push({
      text: pendingPrefix,
      barline: '|',
      lineBreakBefore: !!pendingLineBreak,
    })
  }
  return segments
}

function chartTextFromBarSegments(segments) {
  if (!Array.isArray(segments) || segments.length === 0) return ''
  let out = ''
  segments.forEach(function(seg, index) {
    const text = String(seg && seg.text || '').trim()
    const barline = (seg && seg.barline) || '|'
    const piece = text ? (text + ' ' + barline) : barline
    if (index === 0) {
      out = piece
      return
    }
    if (seg && seg.lineBreakBefore) {
      out += '\n' + piece
      return
    }
    out += ' ' + piece
  })
  return out.replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').trim()
}

function lastChordTokenInChartText(text) {
  const tokens = String(text || '').trim().split(/\s+/).filter(Boolean)
  for (let i = tokens.length - 1; i >= 0; i -= 1) {
    if (tokenIsChord(tokens[i])) return tokens[i]
  }
  return ''
}

function seedLeadingEmptyBarWithChord(barText, chord) {
  const chordName = String(chord || '').trim()
  if (!chordName) return barText
  const raw = String(barText || '').trim()
  const tokens = raw.split(/\s+/).filter(Boolean)
  const prefix = []
  let i = 0
  while (i < tokens.length && (tokenIsChartStructureMarker(tokens[i]) || isInlineSignatureToken(tokens[i]))) {
    prefix.push(tokens[i])
    i += 1
  }
  const body = tokens.slice(i)
  const hasChord = body.some(function(token) { return tokenIsChord(token) })
  if (hasChord) return raw
  const onlyHeld = body.length === 0
    || body.every(function(token) { return token === '.' || token === '/' })
  if (!onlyHeld) return raw
  return prefix.concat([chordName]).join(' ').trim()
}

function chartTextFromBarTokenArrays(barArrays) {
  if (!Array.isArray(barArrays) || barArrays.length === 0) return ''
  return barArrays.map(function(tokens) {
    const t = (Array.isArray(tokens) ? tokens : []).filter(Boolean).join(' ').trim()
    return t ? t + ' |' : '. |'
  }).join(' ').replace(/\s+/g, ' ').trim()
}

function primaryChordFromMelodyBarText(barText) {
  const re = /"([^"]+)"/g
  let match
  let last = ''
  while ((match = re.exec(String(barText || ''))) !== null) {
    if (!isSectionMarkerChordName(match[1])) {
      last = match[1]
    }
  }
  return last
}

/**
 * Build a chord chart block from quoted chords in one melody strain.
 * Bar count matches extractBarsFromMelodyText (held bars emit empty slots).
 */
export function chartTextFromMelodyStrain(strain) {
  const bars = extractBarsFromMelodyText(strain && strain.text ? strain.text : '')
  if (!bars.length) return ''
  let held = ''
  const barTokens = bars.map(function(barText) {
    const chord = primaryChordFromMelodyBarText(barText)
    if (chord) {
      held = chord
      return [chord]
    }
    return held ? [] : []
  })
  return chartTextFromBarTokenArrays(barTokens)
}

export function chartBlocksFromMelodyStrains(strains) {
  return (Array.isArray(strains) ? strains : [])
    .map(function(strain) { return chartTextFromMelodyStrain(strain) })
    .filter(function(chart) { return chartHasMergeableContent(chart) })
}

/**
 * When renderChords splits (or slices) strain charts, reconcile each block to
 * the melody strain's bar count. Prefer quoted-chord charts from the ABC when
 * the rendered chart is short a bar (common on :| repeat strains).
 */
export function reconcileStrainChartBlocks(blocks, strains) {
  const chartBlocks = Array.isArray(blocks) ? blocks : []
  const melodyStrains = Array.isArray(strains) ? strains : []
  if (chartBlocks.length <= 1 || melodyStrains.length <= 1) return chartBlocks
  if (chartBlocks.length !== melodyStrains.length) return chartBlocks

  const strainBarCounts = melodyStrains.map(function(strain, index) {
    const chartBars = chartBlocks[index] ? countChartBars(chartBlocks[index]) : 0;
    return countFullBarsInMelodyStrain(strain.text, chartBars);
  })
  const melodyCharts = chartBlocksFromMelodyStrains(melodyStrains)

  return chartBlocks.map(function(block, index) {
    const target = strainBarCounts[index]
    if (!target) return block
    const normalized = normalizeChartToBarCount(block, target)
    if (countChartBars(normalized) === target) return normalized
    const fromMelody = melodyCharts[index]
    if (fromMelody && countChartBars(fromMelody) === target) return fromMelody
    return normalized
  })
}

/**
 * Slice one rendered chord chart across strains by melody bar counts.
 */
export function strainBarCountsForChartSlice(strainMelodyCounts, chartBarCount) {
  const melodyCounts = Array.isArray(strainMelodyCounts) ? strainMelodyCounts : [];
  const melodyTotal = melodyCounts.reduce(function(sum, count) {
    return sum + Math.max(0, Number(count) || 0);
  }, 0);
  const chartTotal = Math.max(0, Number(chartBarCount) || 0);
  if (!melodyTotal || !chartTotal || chartTotal === melodyTotal) return melodyCounts;
  const result = [];
  let allocated = 0;
  melodyCounts.forEach(function(count, index) {
    const melodyBars = Math.max(0, Number(count) || 0);
    if (index === melodyCounts.length - 1) {
      result.push(Math.max(0, chartTotal - allocated));
      return;
    }
    const remainingStrains = melodyCounts.length - index - 1;
    const share = Math.round((melodyBars / melodyTotal) * chartTotal);
    const next = Math.max(1, Math.min(share, chartTotal - allocated - remainingStrains));
    result.push(next);
    allocated += next;
  });
  return result;
}

export function sliceChartAcrossStrainBarCounts(fullChart, strainBarCounts) {
  const text = String(fullChart == null ? '' : fullChart).trim()
  if (!text || !Array.isArray(strainBarCounts) || strainBarCounts.length === 0) return []
  const headerSplit = splitChartHeaderAndBody(text)
  const allBars = extractChartBarSegments(headerSplit.body || text)
  let offset = 0
  let carryChord = ''
  return strainBarCounts.map(function(barCount, index) {
    const n = Math.max(0, Number(barCount) || 0)
    const slice = allBars.slice(offset, offset + n).map(function(seg, segIndex) {
      return {
        text: String(seg && seg.text || ''),
        barline: (seg && seg.barline) || '|',
        // Keep source line breaks inside the slice; the first bar of a strain
        // should not force a leading newline.
        lineBreakBefore: segIndex === 0 ? false : !!(seg && seg.lineBreakBefore),
      }
    })
    offset += n
    if (slice.length > 0) {
      slice[0].text = seedLeadingEmptyBarWithChord(slice[0].text, carryChord)
    }
    const body = chartTextFromBarSegments(slice)
    const ending = lastChordTokenInChartText(body)
    if (ending) carryChord = ending
    if (index === 0 && headerSplit.headerLine) {
      return joinChartHeaderAndBody(headerSplit.headerLine, body)
    }
    return body
  })
}

/**
 * Ensure each strain chart begins with an explicit chord name (never `/` or `.`).
 * Held empty leading bars inherit the previous strain's last sounding chord.
 */
export function ensureChartBlocksStartWithExplicitChord(blocks) {
  const charts = Array.isArray(blocks) ? blocks : []
  let carryChord = ''
  return charts.map(function(block) {
    const text = String(block == null ? '' : block).trim()
    if (!text) return text
    const headerSplit = splitChartHeaderAndBody(text)
    const segments = extractChartBarSegments(headerSplit.body || text)
    if (segments.length > 0) {
      segments[0].text = seedLeadingEmptyBarWithChord(segments[0].text, carryChord)
    }
    const body = chartTextFromBarSegments(segments)
    const ending = lastChordTokenInChartText(body)
    if (ending) carryChord = ending
    if (headerSplit.headerLine) {
      return joinChartHeaderAndBody(headerSplit.headerLine, body)
    }
    return body
  })
}

/**
 * Split a rendered chord chart into blocks for lyric alignment.
 * Uses blank-line breaks from renderChords first; when the chart is still one
 * block but ABC melody has || strain separators, slice the chart by strain bar
 * counts (same rule as the chords editor / buildUnifiedBlocks).
 */
export function chordChartBlocksForLyrics(chordChart, noteLines) {
  const full = String(chordChart == null ? '' : chordChart).trim()
  if (!full) return []
  const lines = noteLinesForMelodyMerge(noteLines)
  const strains = splitMelodyStrainsWithBarlines(lines)
  let blocks = splitChordChartIntoBlocks(full)

  if (strains.length > 1) {
    if (blocks.length === strains.length) {
      return ensureChartBlocksStartWithExplicitChord(
        reconcileStrainChartBlocks(blocks, strains)
      )
    }

    // renderChords may emit fewer blank-line breaks than melody strains
    // (e.g. only ||, missing section-ending :|). Slice the combined chart by
    // strain bar counts so verse/chorus stay separate.
    const source = blocks.length > 1 ? blocks.join('\n') : (blocks[0] || full)
    if (chartHasMergeableContent(source)) {
      const strainBarCounts = strains.map(function(strain) {
        return extractBarsFromMelodyText(strain.text).length
      })
      const total = strainBarCounts.reduce(function(sum, count) { return sum + count }, 0)
      const aligned = normalizeChartToBarCount(source, total)
      if (countChartBars(aligned) === total) {
        const slices = sliceChartAcrossStrainBarCounts(aligned, strainBarCounts)
          .map(function(slice) { return String(slice || '').trim() })
          .filter(function(slice) { return slice.length > 0 })
        if (slices.length === strains.length) {
          return ensureChartBlocksStartWithExplicitChord(
            reconcileStrainChartBlocks(slices, strains)
          )
        }
      }
      const melodyCharts = chartBlocksFromMelodyStrains(strains)
      if (melodyCharts.length === strains.length) {
        return ensureChartBlocksStartWithExplicitChord(melodyCharts)
      }
    }

    if (blocks.length > 1) {
      return ensureChartBlocksStartWithExplicitChord(
        reconcileStrainChartBlocks(blocks, strains)
      )
    }
  }

  return ensureChartBlocksStartWithExplicitChord(blocks.length ? blocks : [full])
}

/**
 * Chord chart blocks for lyrics/structure display: strain-split rendered chart,
 * then editor cache when the tune was synced from notation but the rendered
 * chart is still one block.
 *
 * Cached charts are stored at concert pitch. Pass displayTranspose so print
 * and structure view apply the same transpose/capo as renderChords.
 */
export function chordChartBlocksForTuneDisplay(tune, renderedChart, melodyNoteLines, options) {
  const noteLines = chordNoteLinesFromTune(tune, melodyNoteLines)
  const blocks = chordChartBlocksForLyrics(renderedChart, noteLines)
  if (blocks.length > 1) return blocks

  const cache = readChordBlockCache(tune)
  if (!cache || !Array.isArray(cache.blocks) || cache.blocks.length <= 1) {
    return blocks
  }
  if (cache.abcHash !== hashAbcNotes(noteLines)) return blocks

  const cachedCharts = editableChordBlocks(cache.blocks)
    .map(function(block) { return String(block && block.chart || '').trim() })
    .filter(function(chart) { return chartHasMergeableContent(chart) })
  if (cachedCharts.length <= 1) return blocks

  const displayTranspose = options && options.displayTranspose
  const sourceKey = tune && tune.key

  function cachedForDisplay(charts) {
    const amount = Number(displayTranspose) || 0
    const next = amount
      ? charts.map(function(chart) {
        return applyChordDisplayTranspose(chart, amount, sourceKey)
      })
      : charts
    return ensureChartBlocksStartWithExplicitChord(next)
  }

  if (chordBlockCacheMatchesMelody(noteLines, cache.blocks)) {
    const strains = splitMelodyStrainsWithBarlines(noteLines)
    if (strains.length <= 1 || cachedCharts.length === strains.length) {
      return cachedForDisplay(cachedCharts)
    }
    const expanded = expandChartsToStrainSlices(cachedCharts, noteLines)
    if (expanded.length === strains.length) {
      return cachedForDisplay(expanded)
    }
  }

  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const totalStrainBars = strains.reduce(function(sum, strain) {
    return sum + extractBarsFromMelodyText(strain.text).length
  }, 0)
  const totalCacheBars = cachedCharts.reduce(function(sum, chart) {
    return sum + countChartBars(chart)
  }, 0)
  // Only fan out cached sections when melody strains match — never attach a
  // multi-section editor cache to a single-strain ABC (stale || after revert).
  if (
    strains.length > 1
    && cachedCharts.length === strains.length
    && totalStrainBars > 0
    && totalCacheBars === totalStrainBars
  ) {
    return cachedForDisplay(cachedCharts)
  }

  return blocks
}

/**
 * chordSectionLabels are no longer used for display alignment. Lyric section
 * markers alone drive chart ↔ stanza mapping (order of first appearance).
 */
export function chordSectionLabelsForDisplay(tune, chartBlockCount, noteLines) {
  void tune
  void chartBlockCount
  void noteLines
  return null
}

/**
 * Note lines from the same voice used to render structure chords.
 */
export function chordNoteLinesFromTune(tune, melodyNoteLines) {
  if (Array.isArray(melodyNoteLines)) {
    return noteLinesForMelodyMerge(melodyNoteLines)
  }
  const voices = tune && tune.voices
  if (!voices) return []
  const keys = Object.keys(voices).sort(function(a, b) {
    const aNum = parseInt(a, 10)
    const bNum = parseInt(b, 10)
    if (!Number.isNaN(aNum) && !Number.isNaN(bNum)) return aNum - bNum
    return String(a).localeCompare(String(b))
  })
  const voice = voices[keys[0]]
  return noteLinesForMelodyMerge(voice && voice.notes ? voice.notes : [])
}

/**
 * When one editor block contains a chart spanning all melody strains (e.g. a
 * 16-bar grid pasted without a blank-line strain separator), slice it across
 * strains and assign each slice to the matching block.
 *
 * Never truncate independent per-section charts down to the melody total just
 * to fan them out — that dropped pasted bars onto short rest scaffolds.
 */
export function fanOutMultiStrainBlockCharts(workingBlocks, strains) {
  if (!Array.isArray(workingBlocks) || !strains || strains.length <= 1) {
    return workingBlocks
  }
  const strainBarCounts = strains.map(function(s) {
    return extractBarsFromMelodyText(s.text).length
  })
  const totalBars = strainBarCounts.reduce(function(a, b) { return a + b }, 0)
  const chartsByStrain = {}
  const sounding = (Array.isArray(workingBlocks) ? workingBlocks : []).filter(function(block) {
    return block && !block.chartRevisit && chartHasMergeableContent(block.chart)
  })
  // Only normalize-down a longer chart when a single sounding block owns the
  // whole tune (one pasted grid spanning every strain).
  const allowNormalizeToTotal = sounding.length <= 1

  workingBlocks.forEach(function(block) {
    if (!block || block.chartRevisit || !chartHasMergeableContent(block.chart)) return
    let chartForFanOut = block.chart
    let chartBars = countChartBars(chartForFanOut)
    if (chartBars !== totalBars) {
      if (!allowNormalizeToTotal) return
      const normalized = normalizeChartToBarCount(chartForFanOut, totalBars)
      if (countChartBars(normalized) === totalBars) {
        chartForFanOut = normalized
        chartBars = totalBars
      }
    }
    if (chartBars !== totalBars) return
    const slices = sliceChartAcrossStrainBarCounts(chartForFanOut, strainBarCounts)
    slices.forEach(function(slice, strainIdx) {
      if (slice && chartHasMergeableContent(slice)) {
        chartsByStrain[strainIdx] = slice
      }
    })
  })

  workingBlocks.forEach(function(block) {
    if (!block || block.chartRevisit || !chartHasMergeableContent(block.chart)) return
    const chartBars = countChartBars(block.chart)
    if (chartBars === totalBars) return
    const strainIdx = block.melodyStrainIndex
    if (strainIdx == null || strainIdx < 0 || chartsByStrain[strainIdx] != null) return
    chartsByStrain[strainIdx] = block.chart
  })

  if (Object.keys(chartsByStrain).length === 0) return workingBlocks

  return workingBlocks.map(function(block) {
    if (!block || block.chartRevisit) return block
    const strainIdx = block.melodyStrainIndex
    if (strainIdx == null || strainIdx < 0 || chartsByStrain[strainIdx] == null) {
      return block
    }
    return Object.assign({}, block, { chart: chartsByStrain[strainIdx] })
  })
}

/**
 * Drop leading/trailing empty bars until chart fits targetBars, without removing
 * any bar that has a real chord. Returns the original chart when that is impossible.
 * Preserves per-line breaks from the original chart.
 */
export function trimEmptyExcessChartBars(chart, targetBars) {
  const target = Math.max(0, Number(targetBars) || 0)
  const current = String(chart == null ? '' : chart).trim()
  if (!current || target <= 0) return current
  if (countChartBars(current) <= target) return current

  const split = splitChartHeaderAndBody(current)
  const bodyText = String(split.body || current || '').trim()
  const lineBars = bodyText.split('\n').map(function(line) {
    return extractChordBars(line)
  })
  let flat = []
  lineBars.forEach(function(bars) {
    flat = flat.concat(bars)
  })
  if (flat.length <= target) return current

  let start = 0
  let end = flat.length
  while ((end - start) > target && chartBarTokensAreEmpty(flat[start])) start += 1
  while ((end - start) > target && chartBarTokensAreEmpty(flat[end - 1])) end -= 1
  if ((end - start) !== target) return current

  let removeHead = start
  let removeTail = flat.length - end
  while (removeHead > 0) {
    let removed = false
    for (let i = 0; i < lineBars.length; i++) {
      if (lineBars[i].length > 0 && chartBarTokensAreEmpty(lineBars[i][0])) {
        lineBars[i].shift()
        removeHead -= 1
        removed = true
        break
      }
    }
    if (!removed) break
  }
  while (removeTail > 0) {
    let removed = false
    for (let j = lineBars.length - 1; j >= 0; j--) {
      if (lineBars[j].length > 0 && chartBarTokensAreEmpty(lineBars[j][lineBars[j].length - 1])) {
        lineBars[j].pop()
        removeTail -= 1
        removed = true
        break
      }
    }
    if (!removed) break
  }
  const body = lineBars
    .map(function(bars) { return chartTextFromBarTokenArrays(bars) })
    .filter(Boolean)
    .join('\n')
  return split.headerLine ? joinChartHeaderAndBody(split.headerLine, body) : body
}

/**
 * Fan out multi-strain charts, then trim stale phantom bars so each block matches
 * its melody strain bar count. Real extra chord bars are kept so save can expand
 * ABC; empty/phantom excess is dropped.
 */
export function alignBlockChartsToMelody(noteLines, blocks) {
  const strains = splitMelodyStrainsWithBarlines(noteLines || [])
  if (!strains.length) {
    return Array.isArray(blocks) ? blocks.slice() : []
  }
  const strainBarCounts = strains.map(function(s) {
    return extractBarsFromMelodyText(s.text).length
  })
  let working = fanOutMultiStrainBlockCharts(
    (Array.isArray(blocks) ? blocks : []).map(function(b) {
      return b ? Object.assign({}, b) : b
    }),
    strains
  )
  return working.map(function(block) {
    if (!block || block.chartRevisit || !chartHasMergeableContent(block.chart)) {
      return block
    }
    const strainIdx = block.melodyStrainIndex
    if (strainIdx == null || strainIdx < 0 || strainIdx >= strainBarCounts.length) {
      return block
    }
    const targetBars = strainBarCounts[strainIdx]
    const chartBars = countChartBars(block.chart)
    if (chartBars > targetBars) {
      const trimmedEmpty = trimEmptyExcessChartBars(block.chart, targetBars)
      if (countChartBars(trimmedEmpty) === targetBars) {
        return Object.assign({}, block, { chart: trimmedEmpty })
      }
      return block
    }
    const aligned = normalizeChartToBarCount(block.chart, targetBars)
    if (aligned === block.chart || countChartBars(aligned) !== targetBars) {
      return block
    }
    return Object.assign({}, block, { chart: aligned })
  })
}

/**
 * Split a whole-grid draft across melody strains when one block spans them all.
 */
function chartBarTokensAreEmpty(barTokens) {
  if (!Array.isArray(barTokens) || barTokens.length === 0) return true
  return barTokens.every(function(token) {
    return !token || token === '.' || String(token).replace(/\./g, '').trim() === ''
  })
}

/**
 * Remove stale empty leading bar slots from each visual chart line (|: phantom bars).
 */
export function dropLeadingEmptyBarsFromEachChartLine(chart) {
  const split = splitChartHeaderAndBody(chart || '')
  const bodyText = String(split.body || chart || '').trim()
  if (!bodyText) {
    return split.headerLine ? joinChartHeaderAndBody(split.headerLine, '') : String(chart || '').trim()
  }
  const lineBars = bodyText.split('\n').map(function(line) {
    return extractChordBars(line)
  })
  let changed = false
  lineBars.forEach(function(bars) {
    while (bars.length > 0 && chartBarTokensAreEmpty(bars[0])) {
      bars.shift()
      changed = true
    }
  })
  if (!changed) {
    return split.headerLine ? joinChartHeaderAndBody(split.headerLine, bodyText) : bodyText
  }
  const body = lineBars
    .map(function(bars) { return chartTextFromBarTokenArrays(bars) })
    .filter(Boolean)
    .join('\n')
  return split.headerLine ? joinChartHeaderAndBody(split.headerLine, body) : body
}

/**
 * Drop repeat-open phantom bars from each line, then trim to a target bar count.
 */
export function normalizeChartToBarCount(chart, barCount) {
  const target = Math.max(0, Number(barCount) || 0)
  let current = String(chart == null ? '' : chart).trim()
  if (!current || target <= 0) return current
  while (countChartBars(current) > target) {
    const dropped = dropLeadingEmptyBarsFromEachChartLine(current)
    if (dropped !== current) {
      current = dropped
      if (countChartBars(current) <= target) break
      continue
    }
    break
  }
  if (countChartBars(current) > target) {
    current = trimChartToBarCount(current, target)
  }
  return current
}

export function splitChordGridAcrossMelodyStrains(gridText, noteLines) {
  const text = String(gridText == null ? '' : gridText)
  const blocks = splitChordChartIntoBlocks(text)
  if (blocks.length !== 1) return text
  const strains = splitMelodyStrainsWithBarlines(noteLines || [])
  if (strains.length <= 1) return text
  const strainBarCounts = strains.map(function(s) {
    return extractBarsFromMelodyText(s.text).length
  })
  const total = strainBarCounts.reduce(function(a, b) { return a + b }, 0)
  const aligned = normalizeChartToBarCount(blocks[0], total)
  if (countChartBars(aligned) !== total) return text
  return sliceChartAcrossStrainBarCounts(aligned, strainBarCounts).join('\n\n')
}

/**
 * Mark sections whose ABC strain already contains a section-label quoted chord.
 */
export function enrichBlocksWithNotationMarkerFlags(blocks, noteLines) {
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  return (Array.isArray(blocks) ? blocks : []).map(function(block, index) {
    if (!block || !block.header) return block
    const strainIndex = block.melodyStrainIndex != null
      ? (block.melodyStrainIndex | 0)
      : index
    const strain = strains[strainIndex]
    const strainText = strain ? strain.text : (block.strainText || '')
    if (strainText && melodyTextHasSectionMarkerChord(strainText, block.header)) {
      return Object.assign({}, block, { notationMarkerWritten: true })
    }
    return block
  })
}

export { splitMelodyStrainsWithBarlines, countFullBarsInMelodyStrain, strainJoinSeparator } from './melodyStrainSplit'

export function buildBarIndexMap(noteLines) {
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const map = {}
  let globalBar = 0
  strains.forEach(function(strain, strainIndex) {
    const bars = extractBarsFromMelodyText(strain.text)
    bars.forEach(function(barText, barInStrain) {
      map[globalBar] = {
        strainIndex: strainIndex,
        barInStrain: barInStrain,
        barText: barText,
        class: classifyBar(barText),
      }
      globalBar += 1
    })
  })
  return map
}

function sectionKeyForIndex(index, type, header) {
  const base = type || (header ? String(header).replace(/\W+/g, '-').toLowerCase() : 'section')
  return base + '-' + index
}

function structureMetaFromDisplayChart(displayChart, strain) {
  const parsed = parseChartStructureMarkers(displayChart)
  return {
    strainStartBarline: parsed.strainStartBarline || (strain && strain.startBarline) || null,
    strainEndBarline: parsed.strainEndBarline || (strain && strain.endBarline) || null,
    endingMarkers: parsed.endingMarkers.slice(),
    displayChart: String(displayChart || '').trim(),
  }
}

function lyricMetaForStrainIndex(strainIndex, alignedBlocks, lyricSections) {
  // Prefer the lyric stanza assigned to this melody strain (chorus-first songs,
  // etc.) over positional lyricSections[strainIndex], which mis-titles when a
  // leading title line or extra lyric blocks shift the index.
  if (Array.isArray(alignedBlocks)) {
    for (let i = 0; i < alignedBlocks.length; i++) {
      const aligned = alignedBlocks[i]
      if (!aligned) continue
      if (aligned.melodyStrainIndex !== strainIndex) continue
      if (aligned.chartRevisit) continue
      return {
        header: aligned.header || '',
        type: aligned.type || null,
        title: sectionDisplayTitle({ header: aligned.header, lines: aligned.lyricLines || [] }),
        lines: Array.isArray(aligned.lyricLines) ? aligned.lyricLines.slice() : [],
        chartRevisit: false,
        alignedChart: String(aligned.chart || ''),
      }
    }
  }
  const section = Array.isArray(lyricSections) ? lyricSections[strainIndex] : null
  if (section) {
    return {
      header: section.header || '',
      type: section.type || null,
      title: section.title
        || sectionDisplayTitle({ header: section.header, lines: section.lines || [] }),
      lines: Array.isArray(section.lines) ? section.lines.slice() : [],
      chartRevisit: false,
      alignedChart: '',
    }
  }
  const alignedFallback = Array.isArray(alignedBlocks) ? alignedBlocks[strainIndex] : null
  if (alignedFallback) {
    return {
      header: alignedFallback.header || '',
      type: alignedFallback.type || null,
      title: sectionDisplayTitle({
        header: alignedFallback.header,
        lines: alignedFallback.lyricLines || [],
      }),
      lines: Array.isArray(alignedFallback.lyricLines) ? alignedFallback.lyricLines.slice() : [],
      chartRevisit: !!alignedFallback.chartRevisit,
      alignedChart: String(alignedFallback.chart || ''),
    }
  }
  return null
}

/**
 * Build unified chord blocks: one per melody strain (canonical).
 */
export function buildUnifiedBlocks(options) {
  const opts = options || {}
  const noteLines = noteLinesForMelodyMerge(Array.isArray(opts.noteLines) ? opts.noteLines : [])
  const lyricLines = Array.isArray(opts.lyricLines) ? opts.lyricLines : []
  const defaultMeter = normalizeMeter(opts.defaultMeter || '4/4')
  const defaultKey = normalizeKeySignature(opts.defaultKey || 'C')
  const defaultTempo = normalizeTempo(opts.defaultTempo) || 120
  const defaultNoteLength = opts.defaultNoteLength || opts.noteLength || null
  const fullChart = String(opts.chordChart == null ? '' : opts.chordChart)
  const displayFullChart = String(opts.displayChordChart == null ? '' : opts.displayChordChart)
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const chartBlocks = chordChartBlocksForLyrics(fullChart, noteLines)
  const displayChartBlocks = displayFullChart
    ? chordChartBlocksForLyrics(displayFullChart, noteLines)
    : chartBlocks.slice()
  const lyricSections = listLyricSections(lyricLines, {
    title: opts.title,
    composer: opts.composer,
  })
  const alignedLyricBlocks = alignChordBlocksToLyrics(lyricLines, chartBlocks, {
    title: opts.title,
    composer: opts.composer,
    melodyNoteLines: noteLines,
  })
  const warnings = []

  if (strains.length === 0) {
    // No melody — treat chart blocks as blocks (scaffold / paste create).
    let previousMeter = null
    let previousTempo = null
    let previousKey = null
    let blocks = (chartBlocks.length ? chartBlocks : [fullChart]).map(function(chart, index) {
      const raw = String(chart || '')
      const meter = normalizeMeter(
        extractMeterFromChartBlock(raw) || previousMeter || defaultMeter
      )
      const abcKey = normalizeKeySignature(
        extractKeyFromChartBlock(raw) || previousKey || defaultKey
      )
      const tempo = normalizeTempo(
        extractTempoFromChartBlock(raw) || previousTempo || defaultTempo
      ) || defaultTempo
      previousMeter = meter
      previousTempo = tempo
      previousKey = abcKey
      const lyricSection = lyricMetaForStrainIndex(index, alignedLyricBlocks, lyricSections)
      const header = (lyricSection && lyricSection.header) || ''
      const type = lyricSection && lyricSection.type
        ? lyricSection.type
        : (header ? normalizeSectionType(header) : null)
      return {
        id: sectionKeyForIndex(index, type, header),
        key: sectionKeyForIndex(index, type, header),
        chart: expandLegacyBeatSlotsInChart(
          raw,
          meter,
          defaultNoteLength
        ),
        meter: meter,
        abcKey: abcKey,
        tempo: tempo,
        abcBarStart: 0,
        abcBarEnd: Math.max(0, countChartBars(raw) - 1),
        melodyStrainIndex: index,
        hasAnacrusis: false,
        lyricSectionType: type,
        lyricSectionHeader: header,
        title: lyricSection
          ? lyricSection.title
          : (chartBlocks.length > 1 ? ('Section ' + (index + 1)) : 'Chords'),
        chartRevisit: false,
        sourceTypeKey: type,
        strainStartBarline: null,
        strainEndBarline: null,
        endingMarkers: [],
        extraChart: '',
        lyricLines: lyricSection ? lyricSection.lines.slice() : [],
      }
    })
    blocks = enrichBlocksWithNotationMarkerFlags(blocks, noteLines)
    const uniqueLyricSections = countFirstOccurrenceLyricSections(lyricSections)
    if (uniqueLyricSections && uniqueLyricSections !== blocks.length) {
      warnings.push(mergeFailure(
        'strain_lyric_count_mismatch',
        'Lyric sections and chord blocks differ — titles are approximate.'
      ))
    }
    return { blocks: blocks, warnings: warnings, abcHash: hashAbcNotes(noteLines) }
  }

  const uniqueLyricSections = countFirstOccurrenceLyricSections(lyricSections)
  if (uniqueLyricSections && uniqueLyricSections !== strains.length) {
    warnings.push(mergeFailure(
      'strain_lyric_count_mismatch',
      'Lyric sections and melody strains differ — titles are approximate.'
    ))
  }

  let globalBar = 0
  let previousMeter = null
  let previousTempo = null
  let previousKey = null
  const hymnSingleChart = chartBlocks.length === 1 && strains.length > 1
  const hymnChartSlices = hymnSingleChart
    ? sliceChartAcrossStrainBarCounts(
      chartBlocks[0],
      strains.map(function(strain) {
        return extractBarsFromMelodyText(strain.text).length
      })
    )
    : null
  const displayHymnSlices = hymnSingleChart && displayChartBlocks.length === 1
    ? sliceChartAcrossStrainBarCounts(
      displayChartBlocks[0],
      strains.map(function(strain) {
        return extractBarsFromMelodyText(strain.text).length
      })
    )
    : null

  const blocks = strains.map(function(strain, index) {
    const bars = extractBarsFromMelodyText(strain.text)
    const abcBarStart = globalBar
    const abcBarEnd = globalBar + Math.max(0, bars.length - 1)
    globalBar += bars.length

    let rawChart = ''
    let extraChart = ''
    let rawDisplayChart = ''
    if (hymnSingleChart) {
      rawChart = hymnChartSlices && hymnChartSlices[index] != null
        ? hymnChartSlices[index]
        : ''
      rawDisplayChart = displayHymnSlices && displayHymnSlices[index] != null
        ? displayHymnSlices[index]
        : ''
    } else if (index < chartBlocks.length) {
      rawChart = String(chartBlocks[index] || '')
      rawDisplayChart = index < displayChartBlocks.length
        ? String(displayChartBlocks[index] || '')
        : ''
    } else {
      rawChart = ''
      rawDisplayChart = ''
    }
    if (index === strains.length - 1 && chartBlocks.length > strains.length) {
      extraChart = chartBlocks.slice(strains.length).join('\n\n')
    }

    const blockMeter = extractMeterFromChartBlock(rawChart)
      || (index === 0 ? defaultMeter : previousMeter)
      || defaultMeter
    const meter = normalizeMeter(blockMeter)
    const blockKey = extractKeyFromChartBlock(rawChart)
      || extractKeyFromChartBlock(strain.text)
      || (index === 0 ? defaultKey : previousKey)
      || defaultKey
    const abcKey = normalizeKeySignature(blockKey)
    const blockTempo = extractTempoFromChartBlock(rawChart)
      || (index === 0 ? defaultTempo : previousTempo)
      || defaultTempo
    const tempo = normalizeTempo(blockTempo) || defaultTempo
    if (String(rawChart).trim() || index === 0) {
      previousMeter = meter
      previousTempo = tempo
      previousKey = abcKey
    }

    const lyricSection = lyricMetaForStrainIndex(index, alignedLyricBlocks, lyricSections)
    const header = (lyricSection && lyricSection.header) || ''
    const type = lyricSection && lyricSection.type
      ? lyricSection.type
      : (header ? normalizeSectionType(header) : null)
    const title = lyricSection
      ? lyricSection.title
      : sectionDisplayTitle({ header: header, lines: [] }) || ('Section ' + (index + 1))
    const headerSplit = splitChartHeaderAndBody(rawChart)
    const markerFromChart = header && headerSplit.headerLine && (
      isSectionMarkerToken(headerSplit.headerLine)
      || /^#+\s+/.test(String(headerSplit.headerLine).trim())
    )
    const structureMeta = structureMetaFromDisplayChart(rawDisplayChart, strain)

    return {
      id: sectionKeyForIndex(index, type, header),
      key: sectionKeyForIndex(index, type, header),
      chart: expandLegacyBeatSlotsInChart(
        rawChart,
        meter,
        defaultNoteLength
      ),
      meter: meter,
      abcKey: abcKey,
      tempo: tempo,
      abcBarStart: abcBarStart,
      abcBarEnd: abcBarEnd,
      melodyStrainIndex: index,
      hasAnacrusis: index === 0 && bars.length > 0 && classifyBar(bars[0]) !== 'empty' && false,
      lyricSectionType: type,
      lyricSectionHeader: header,
      title: title,
      chartRevisit: false,
      sourceTypeKey: type,
      strainStartBarline: structureMeta.strainStartBarline,
      strainEndBarline: structureMeta.strainEndBarline,
      endingMarkers: structureMeta.endingMarkers,
      displayChart: structureMeta.displayChart,
      extraChart: extraChart,
      lyricLines: lyricSection ? lyricSection.lines.slice() : [],
      strainText: strain.text,
      notationMarkerWritten: markerFromChart
        || melodyTextHasSectionMarkerChord(strain.text, header),
    }
  })

  let labeled = enrichBlocksWithNotationMarkerFlags(blocks, noteLines)

  return { blocks: labeled, warnings: warnings, abcHash: hashAbcNotes(noteLines) }
}

/**
 * Positional reconcile of unified blocks from an edited whole-grid string.
 */
export function reconcileBlocksFromGrid(blocks, gridText, defaultMeter, defaultTempo) {
  const list = Array.isArray(blocks) ? blocks.map(function(b) {
    return b ? Object.assign({}, b) : b
  }) : []
  const chartBlocks = splitChordChartIntoBlocks(String(gridText == null ? '' : gridText))
  const meterFallback = normalizeMeter(defaultMeter || (list[0] && list[0].meter) || '4/4')
  const keyFallback = normalizeKeySignature((list[0] && list[0].abcKey) || 'C')
  const tempoFallback = normalizeTempo(defaultTempo)
    || normalizeTempo(list[0] && list[0].tempo)
    || 120
  let previousMeter = null
  let previousTempo = null
  let previousKey = null
  const next = []

  for (let i = 0; i < Math.max(list.length, chartBlocks.length); i++) {
    const raw = i < chartBlocks.length ? chartBlocks[i] : ''
    const meter = normalizeMeter(
      extractMeterFromChartBlock(raw) || previousMeter || meterFallback
    )
    const abcKey = normalizeKeySignature(
      extractKeyFromChartBlock(raw) || previousKey || keyFallback
    )
    const tempo = normalizeTempo(
      extractTempoFromChartBlock(raw) || previousTempo || tempoFallback
    ) || tempoFallback
    previousMeter = meter
    previousKey = abcKey
    previousTempo = tempo
    if (i < list.length) {
      next.push(Object.assign({}, list[i], {
        chart: expandLegacyBeatSlotsInChart(
          raw,
          meter,
          null
        ),
        meter: meter,
        abcKey: abcKey,
        tempo: tempo,
      }))
    } else {
      const prev = next[next.length - 1] || list[list.length - 1] || {}
      next.push({
        id: 'section-' + i,
        key: 'section-' + i,
        chart: expandLegacyBeatSlotsInChart(
          raw,
          meter,
          null
        ),
        meter: meter,
        abcKey: abcKey,
        tempo: tempo,
        abcBarStart: -1,
        abcBarEnd: -1,
        melodyStrainIndex: i,
        hasAnacrusis: false,
        lyricSectionType: null,
        lyricSectionHeader: '',
        title: 'Section ' + (i + 1),
        chartRevisit: false,
        sourceTypeKey: null,
        strainStartBarline: null,
        strainEndBarline: '||',
        endingMarkers: [],
        extraChart: '',
        lyricLines: [],
        needsAbcExpand: true,
      })
      void prev
    }
  }
  return next
}

function editableChordBlocks(sections) {
  return (Array.isArray(sections) ? sections : []).filter(function(b) {
    return b && !b.chartRevisit
  })
}

/**
 * True when cached chord blocks align 1:1 with melody strains (no duplicate anchors).
 */
export function chordBlockCacheMatchesMelody(noteLines, cacheBlocks) {
  if (!Array.isArray(cacheBlocks) || !cacheBlocks.length) return false
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const editable = editableChordBlocks(cacheBlocks)
  if (editable.length !== strains.length) return false
  const used = {}
  for (let i = 0; i < editable.length; i++) {
    const idx = editable[i].melodyStrainIndex
    if (idx == null || idx < 0 || idx >= strains.length) return false
    if (used[idx]) return false
    used[idx] = true
    const strainBars = extractBarsFromMelodyText(strains[idx].text).length
    const chartBars = countChartBars(editable[i].chart)
    if (chartBars !== strainBars) return false
  }
  return true
}

/**
 * Refresh melodyStrainIndex on editor sections before merge (stale cache / lyric remap).
 */
export function reanchorEditorBlocksToMelody(noteLines, sections) {
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const list = Array.isArray(sections)
    ? sections.map(function(s) { return s ? Object.assign({}, s) : s })
    : []
  if (!strains.length) return list

  const editableIndexes = []
  list.forEach(function(s, i) {
    if (s && !s.chartRevisit) editableIndexes.push(i)
  })

  if (editableIndexes.length === strains.length) {
    editableIndexes.forEach(function(sectionIndex, pos) {
      list[sectionIndex] = Object.assign({}, list[sectionIndex], { melodyStrainIndex: pos })
    })
    return list
  }

  const used = {}
  editableIndexes.forEach(function(sectionIndex) {
    const s = list[sectionIndex]
    const idx = s.melodyStrainIndex
    if (idx != null && idx >= 0 && idx < strains.length) {
      if (used[idx]) {
        list[sectionIndex] = Object.assign({}, s, {
          needsAbcExpand: true,
          melodyStrainIndex: -1,
          abcBarStart: -1,
          abcBarEnd: -1,
        })
      } else {
        used[idx] = true
      }
    }
  })

  return list.map(function(s, i) {
    if (!s || s.chartRevisit) return s
    const idx = s.melodyStrainIndex
    if (idx == null || idx < 0 || idx >= strains.length) {
      const pos = editableIndexes.indexOf(i)
      return Object.assign({}, s, {
        melodyStrainIndex: Math.min(pos >= 0 ? pos : i, strains.length - 1),
      })
    }
    return s
  })
}

function restBarForMeter(meter, noteLength) {
  const model = getBarModel(meter, noteLength)
  const n = Math.max(1, model.unitSlotsPerBar)
  const parts = []
  for (let i = 0; i < n; i++) parts.push('z')
  return parts.join(' ')
}

/**
 * Build a rest-only strain body with the requested bar count.
 * When templateBar is set (e.g. existing "z"), reuse that unit so L:1/4 scaffolds
 * stay "z | z |" rather than switching to beat-split "z z z z".
 * Chord symbols are stripped from the template so padding never copies "Em".
 */
export function restStrainTextForBarCount(barCount, meter, templateBar, noteLength) {
  const n = Math.max(1, barCount | 0)
  let unit = String(templateBar == null ? '' : templateBar).trim().replace(/\|+$/, '').trim()
  unit = unit.replace(/"[^"]*"/g, '').trim()
  if (!unit || barHasPitch(unit)) {
    unit = restBarForMeter(meter, noteLength)
  }
  const parts = []
  for (let i = 0; i < n; i++) parts.push(unit)
  return parts.join(' | ') + ' |'
}

/**
 * Append pure rest bars onto an existing scaffold strain (preserves chords/rests).
 */
export function appendRestBarsToStrain(strainText, extraBars, meter, templateBar, noteLength) {
  const n = Math.max(0, extraBars | 0)
  if (n <= 0) return String(strainText || '')
  let base = String(strainText || '').trim().replace(/\|+\s*$/, '').trim()
  let unit = String(templateBar == null ? '' : templateBar).trim().replace(/\|+$/, '').trim()
  unit = unit.replace(/"[^"]*"/g, '').trim()
  if (!unit || barHasPitch(unit)) {
    unit = restBarForMeter(meter, noteLength)
  }
  const pads = []
  for (let i = 0; i < n; i++) pads.push(unit)
  const padText = pads.join(' | ') + ' |'
  if (!base) return padText
  return base + ' | ' + padText
}

/**
 * Lengthen ABC strains so each editable block's chord-grid bar count fits.
 * Appends rest bars when the chart is longer — including after pitched melody —
 * so adding a bar in the chords editor updates notation instead of being dropped.
 */
export function expandRestStrainsToMatchCharts(noteLines, blocks, defaultMeter, noteLength) {
  const lines = Array.isArray(noteLines) ? noteLines.slice() : []
  const list = Array.isArray(blocks)
    ? blocks.map(function(b) { return b ? Object.assign({}, b) : b })
    : []
  const strains = splitMelodyStrainsWithBarlines(lines)
  if (!strains.length) {
    return { noteLines: lines, blocks: list, error: null, expanded: false }
  }

  const meter = normalizeMeter(defaultMeter || '4/4')
  const updatedTexts = strains.map(function(s) { return s.text })
  let chartsCleaned = false
  let strainsExpanded = false

  list.forEach(function(block, blockIndex) {
    if (!block || block.chartRevisit || !chartHasMergeableContent(block.chart)) return
    const strainIndex = block.melodyStrainIndex
    if (strainIndex == null || strainIndex < 0 || strainIndex >= strains.length) return
    const strain = strains[strainIndex]
    if (!strain) return
    const strainBars = extractBarsFromMelodyText(strain.text).length
    const cleanedChart = trimEmptyExcessChartBars(block.chart, strainBars)
    if (cleanedChart !== block.chart) {
      list[blockIndex] = Object.assign({}, block, { chart: cleanedChart })
      block = list[blockIndex]
      chartsCleaned = true
    }
    const chartBars = countChartBars(block.chart)
    if (chartBars <= 0) return
    if (chartBars <= strainBars) return
    const templateBars = extractBarsFromMelodyText(strain.text)
    const template = templateBars.length ? templateBars[templateBars.length - 1] : ''
    updatedTexts[strainIndex] = appendRestBarsToStrain(
      strain.text,
      chartBars - strainBars,
      block.meter || meter,
      template,
      noteLength
    )
    strainsExpanded = true
  })

  if (!chartsCleaned && !strainsExpanded) {
    return { noteLines: lines, blocks: list, error: null, expanded: false }
  }

  if (!strainsExpanded) {
    return { noteLines: lines, blocks: list, error: null, expanded: false }
  }

  const nextLines = rebuildNoteLinesFromMergedStrains(lines, strains, updatedTexts)
  const mergedBlocks = list.map(function(block) {
    if (!block || block.chartRevisit) return block
    const barCount = Math.max(1, countChartBars(block.chart))
    return Object.assign({}, block, {
      abcBarStart: 0,
      abcBarEnd: barCount - 1,
    })
  })
  return { noteLines: nextLines, blocks: mergedBlocks, error: null, expanded: true }
}

/**
 * Insert rest-scaffold strains for blocks that lack an ABC range.
 * Inserts at each block's editor position (not only at the end of the tune).
 * New and existing rest strains are sized to each block's chord-grid bar count.
 */
export function autoExpandNoteLinesForBlocks(noteLines, blocks, defaultMeter, noteLength) {
  const lines = Array.isArray(noteLines) ? noteLines.slice() : []
  let list = Array.isArray(blocks) ? blocks.map(function(b) {
    return b ? Object.assign({}, b) : b
  }) : []
  const strains = splitMelodyStrainsWithBarlines(lines)
  const nonRevisit = list.filter(function(b) { return b && !b.chartRevisit })
  const deficit = Math.max(0, nonRevisit.length - strains.length)
  let explicitNeeds = 0
  list.forEach(function(b) {
    if (b && b.needsAbcExpand) explicitNeeds += 1
  })
  if (deficit > 0) {
    const usedIndexes = {}
    let marked = 0
    for (let i = 0; i < list.length && marked < deficit; i++) {
      if (!list[i] || list[i].chartRevisit) continue
      const idx = list[i].melodyStrainIndex
      const duplicate = idx != null && idx >= 0 && usedIndexes[idx]
      const unanchored = idx == null || idx < 0
      if (!list[i].needsAbcExpand && (unanchored || duplicate)) {
        list[i] = Object.assign({}, list[i], {
          needsAbcExpand: true,
          melodyStrainIndex: -1,
          abcBarStart: -1,
          abcBarEnd: -1,
        })
        marked += 1
      } else if (idx != null && idx >= 0) {
        usedIndexes[idx] = true
      }
    }
  }
  const needs = list.filter(function(b) { return b && b.needsAbcExpand })
  const expandCount = Math.max(needs.length, deficit, explicitNeeds)
  if (expandCount === 0) {
    return expandRestStrainsToMatchCharts(lines, list, defaultMeter, noteLength)
  }

  const meter = normalizeMeter(defaultMeter || '4/4')
  const newStrains = []
  let nextSourceIndex = 0

  nonRevisit.forEach(function(block, position) {
    const needsNew = block.needsAbcExpand
      || block.melodyStrainIndex == null
      || block.melodyStrainIndex < 0
    const chartBars = Math.max(1, countChartBars(block.chart))
    const blockMeter = normalizeMeter(block.meter || meter)
    if (needsNew) {
      newStrains.push({
        text: restStrainTextForBarCount(chartBars, blockMeter, null, noteLength),
        startBarline: position > 0 ? '||' : null,
        endBarline: null,
      })
      return
    }
    const si = block.melodyStrainIndex != null && block.melodyStrainIndex >= 0
      ? (block.melodyStrainIndex | 0)
      : nextSourceIndex
    const src = strains[si] || strains[nextSourceIndex]
    if (src) {
      let text = src.text
      const srcBars = extractBarsFromMelodyText(text).length
      if (chartBars > srcBars) {
        const templateBars = extractBarsFromMelodyText(text)
        text = appendRestBarsToStrain(
          text,
          chartBars - srcBars,
          blockMeter,
          templateBars.length ? templateBars[templateBars.length - 1] : '',
          noteLength
        )
      }
      newStrains.push({
        text: text,
        startBarline: position === 0 ? src.startBarline : (src.startBarline || '||'),
        endBarline: src.endBarline,
      })
      nextSourceIndex = Math.max(nextSourceIndex, si >= 0 ? si + 1 : nextSourceIndex + 1)
    } else {
      newStrains.push({
        text: restStrainTextForBarCount(chartBars, blockMeter, null, noteLength),
        startBarline: position > 0 ? '||' : null,
        endBarline: null,
      })
    }
  })

  const updatedTexts = newStrains.map(function(s) { return s.text })
  const nextLines = rebuildNoteLinesFromMergedStrains(lines, newStrains, updatedTexts)

  let nonRevisitPos = 0
  const mergedBlocks = list.map(function(block) {
    if (!block || block.chartRevisit) return block
    const position = nonRevisitPos
    nonRevisitPos += 1
    const barCount = Math.max(1, countChartBars(block.chart))
    const strainMeta = newStrains[position] || null
    return Object.assign({}, block, {
      melodyStrainIndex: position,
      needsAbcExpand: false,
      abcBarStart: 0,
      abcBarEnd: barCount - 1,
      strainStartBarline: strainMeta ? strainMeta.startBarline : null,
      strainEndBarline: strainMeta ? strainMeta.endBarline : null,
    })
  })

  return { noteLines: nextLines, blocks: mergedBlocks, error: null, expanded: true }
}

function stripChordsFromAbcText(text) {
  return String(text || '').replace(/"([^"]*)"/g, '')
}

function stripLeadingQuotedChord(barText) {
  return String(barText || '').replace(/^(\s*)?"[^"]*"\s*/, '$1' || '')
}

function chartTokensFromBar(barTokens) {
  return (Array.isArray(barTokens) ? barTokens : []).map(function(t) {
    const s = String(t == null ? '' : t).trim()
    if (!s || s === '.' || /^\.+$/.test(s)) return '.'
    return s.replace(/"/g, '')
  })
}

function parseAbcMelodyNoteTokens(barText) {
  const tokens = []
  const s = String(barText || '')
  const re = /(\([^)]+\))|(\[[^\]]+\])(\d*)|((?:\^+|_+|=+)*[a-gA-GzZ])(\d*)/gi
  let match
  while ((match = re.exec(s)) !== null) {
    if (match[1]) {
      tokens.push({ text: match[1], units: 1 })
    } else if (match[2]) {
      const mult = match[3] ? parseInt(match[3], 10) : 1
      tokens.push({ text: match[2] + (match[3] || ''), units: mult > 0 ? mult : 1 })
    } else if (match[4]) {
      const mult = match[5] ? parseInt(match[5], 10) : 1
      tokens.push({ text: match[4] + (match[5] || ''), units: mult > 0 ? mult : 1 })
    }
  }
  return tokens
}

function applyQuotedChordsToMelodyBar(melodyBar, chartBarTokens, meter, noteLength) {
  let bangPrefix = ''
  let bodyBar = melodyBar
  const bangMatch = String(melodyBar || '').match(/^(\s*!\s*)/)
  if (bangMatch) {
    bangPrefix = bangMatch[1]
    bodyBar = String(melodyBar).slice(bangMatch[1].length)
  }
  const tokens = chartTokensFromBar(chartBarTokens)
  const barModel = getBarModel(meter || '4/4', noteLength || '1/8')
  const positions = beatPositionsForBarChords(tokens, barModel, null, 0)
  const chords = []
  tokens.forEach(function(token, i) {
    if (token !== '.') {
      chords.push({ position: positions[i], name: token })
    }
  })
  chords.sort(function(a, b) { return a.position - b.position })

  const bare = stripChordsFromAbcText(bodyBar).trim()
  const noteTokens = parseAbcMelodyNoteTokens(bare)
  if (!noteTokens.length) return bangPrefix + bare

  let unitCursor = 0
  let chordIdx = 0
  let out = ''
  noteTokens.forEach(function(note) {
    while (chordIdx < chords.length && chords[chordIdx].position <= unitCursor + 0.001) {
      out += '"' + chords[chordIdx].name + '"'
      chordIdx += 1
    }
    out += note.text
    unitCursor += note.units
  })
  while (chordIdx < chords.length) {
    out += '"' + chords[chordIdx].name + '"'
    chordIdx += 1
  }
  return bangPrefix + out
}

function harmonyEditPreservesMelody(beforeText, afterText, useHarmonyOnly) {
  if (melodiesMatchForChordEdit(beforeText, afterText)) return true
  if (!useHarmonyOnly) return false
  return melodyBodyFingerprint(beforeText) === melodyBodyFingerprint(afterText)
}

/**
 * Update quoted chords per bar from a chord chart without abcjs render.
 * Strips existing quoted chords and re-applies chart slots (including removals).
 * Returns null when bar counts differ.
 */
export function applyLeadingChordsFromChart(strainText, chartText, options) {
  const opts = options || {}
  const meter = opts.meter || '4/4'
  const noteLength = opts.noteLength || '1/8'
  const expanded = expandLegacyBeatSlotsInChart(String(chartText || ''), meter, noteLength)
  const rebalanced = rebalanceChartPulseSlots(expanded, meter, noteLength)
  const chartBody = rebalanced.chart || expanded
  const melodyBars = extractBarsFromMelodyText(strainText)
  if (!melodyBars.length) return strainText
  const split = splitChartHeaderAndBody(chartBody || '')
  const chartBars = extractChartBarSlotGrids(split.body || chartBody || '')
  if (chartBars.length !== melodyBars.length) return null
  const out = melodyBars.map(function(melodyBar, i) {
    return applyQuotedChordsToMelodyBar(melodyBar, chartBars[i], meter, noteLength)
  })
  return out.join('|')
}

/** Melody voicing fingerprint: quotes + inline M/Q/K stripped; bracket pitch order normalized. */
function normalizeBracketPitchOrder(text) {
  return String(text || '').replace(/\[([a-gA-G]+)\]/g, function(_, letters) {
    return '[' + letters.split('').sort().join('') + ']'
  })
}

function melodyVoicingFingerprint(text) {
  return melodyBodyFingerprint(text)
}

/** Pitch + rhythm body fingerprint (chords and inline signatures stripped). */
export function melodyBodyFingerprint(text) {
  let t = stripChordsFromAbcText(text)
  t = stripInlineSignatureMarkers(t)
  t = normalizeBracketPitchOrder(t)
  t = t.replace(/\s+/g, '')
  t = t.replace(/\|+/g, '|')
  return t.trim()
}

/** Reinsert ABC part-break markers (!) dropped by harmonyOnly render. */
export function restorePartBreakMarkers(originalText, mergedText) {
  const original = String(originalText || '')
  let merged = String(mergedText || '')
  if (!original.includes('!') || merged.includes('!')) {
    return merged
  }
  let searchFrom = 0
  while (searchFrom < original.length) {
    const bangIdx = original.indexOf('!', searchFrom)
    if (bangIdx < 0) break
    const barsBefore = extractBarsFromMelodyText(original.slice(0, bangIdx)).length
    if (barsBefore > 0) {
      const pipeIdx = pipeIndexAfterBar(merged, barsBefore - 1)
      if (pipeIdx >= 0) {
        merged = merged.slice(0, pipeIdx + 1)
          + '! '
          + merged.slice(pipeIdx + 1).replace(/^\s*/, '')
      }
    }
    searchFrom = bangIdx + 1
  }
  return merged
}

function pipeIndexAfterBar(text, barIndex) {
  const target = Math.max(0, barIndex | 0)
  let bar = 0
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '|') {
      if (bar === target) return i
      bar += 1
    }
  }
  return -1
}

/** True when chord-only merge preserved pitched melody (ignores barline / whitespace render diffs). */
export function melodiesMatchForChordEdit(beforeText, afterText) {
  const before = String(beforeText || '')
  const after = String(afterText || '')
  const looseFingerprint = function(text) {
    return melodyBodyFingerprint(text).toLowerCase().replace(/!/g, '')
  }
  if (looseFingerprint(before) === looseFingerprint(after)) return true
  if (/\[[a-gA-G]{2,}\]/.test(before)) {
    return melodyBodyFingerprint(before) === melodyBodyFingerprint(after)
  }
  const pitchStrip = function(text) {
    return stripInlineSignatureMarkers(stripChordsFromAbcText(text))
      .replace(/!/g, '')
      .replace(/[^a-gA-GzZ0-9]/gi, '')
      .toLowerCase()
  }
  if (pitchStrip(before) === pitchStrip(after)) return true
  return false
}

/** Count ABC rest duration units (z, z2, z8, …) ignoring quoted chords. */
export function melodyRestUnitCount(text) {
  const noChords = stripChordsFromAbcText(text).replace(/"[^"]*"/g, '')
  let total = 0
  const re = /z(\d+)?/gi
  let match
  while ((match = re.exec(noChords)) !== null) {
    const mult = match[1] ? parseInt(match[1], 10) : 1
    total += mult > 0 ? mult : 1
  }
  return total
}

function chartHasInlineMeterToken(chart) {
  return /\[M:\s*[^\]]+\]/i.test(String(chart || ''))
}

/**
 * Replace primary-voice note lines in an ABC string, preserving other voices.
 */
function splicePrimaryVoiceNotes(abcString, noteLines, abcTools, voicesHint) {
  const voiceKey = resolvePrimaryVoiceKey(voicesHint)
  const notesOut = (Array.isArray(noteLines) ? noteLines : [String(noteLines || '')])
    .map(function(line) { return String(line == null ? '' : line) })
  if (!notesOut.length) notesOut.push('')

  const rawLines = String(abcString || '').split('\n')
  const hasVoiceHeaders = rawLines.some(function(line) { return /^V:/i.test(line) })
  const rebuilt = []
  let inPrimary = !hasVoiceHeaders
  let wrotePrimaryNotes = false

  function flushPrimaryNotes() {
    if (wrotePrimaryNotes) return
    notesOut.forEach(function(line) { rebuilt.push(line) })
    wrotePrimaryNotes = true
  }

  rawLines.forEach(function(line) {
    const vMatch = String(line).match(/^V:\s*(\S+)/i)
    if (vMatch) {
      if (inPrimary && !wrotePrimaryNotes) flushPrimaryNotes()
      inPrimary = vMatch[1] === voiceKey
      rebuilt.push(line)
      return
    }
    if (abcTools.isNoteLine(line) && !String(line).startsWith('w:')) {
      if (inPrimary) {
        if (!wrotePrimaryNotes) flushPrimaryNotes()
        // Drop previous primary note lines (already replaced).
        return
      }
      rebuilt.push(line)
      return
    }
    rebuilt.push(line)
  })

  if (!wrotePrimaryNotes) {
    if (hasVoiceHeaders) {
      // Primary V: header missing — append it with notes.
      rebuilt.push('V:' + voiceKey)
    }
    flushPrimaryNotes()
  }
  return rebuilt.join('\n')
}

/**
 * Normalize mergeChords note body onto voice note lines.
 * Chord-chart line breaks become ABC system breaks; blank chart lines
 * already became || strain markers inside mergeChords.
 */
function noteLinesFromMergedBody(mergedBody, abcTools) {
  const text = String(mergedBody || '')
  // Full ABC (rare) — take note body only.
  const notes = abcTools && typeof abcTools.justNotes === 'function' && /(?:^|\n)[A-Za-z]:/.test(text)
    ? abcTools.justNotes(text)
    : text
  const lines = String(notes).split('\n').map(function(line) {
    return String(line || '').trim()
  }).filter(Boolean)
  return lines.length ? lines : ['']
}

/**
 * Rebuild primary-voice note lines preserving original line breaks when possible.
 */
export function rebuildNoteLinesFromMergedStrains(originalNoteLines, strains, updatedStrainTexts) {
  const inputs = Array.isArray(originalNoteLines) ? originalNoteLines : []
  const strainList = Array.isArray(strains) ? strains : []
  const mergedStrainTexts = Array.isArray(updatedStrainTexts) ? updatedStrainTexts : []

  function isVoicePrefixLine(line) {
    return /^%%MIDI\s/i.test(String(line || '').trim())
  }

  function melodyLineFromBars(bars) {
    return (Array.isArray(bars) ? bars : []).filter(Boolean).join(' | ')
  }

  function melodyLineSuffixAfterBars(originalLine) {
    const trimmed = String(originalLine || '').trim()
    const bars = extractBarsFromMelodyText(originalLine)
    if (!bars.length) return ''
    const lastBar = bars[bars.length - 1]
    const idx = trimmed.lastIndexOf(lastBar)
    if (idx < 0) return ''
    return trimmed.slice(idx + lastBar.length)
  }

  function countMelodyLines(lines) {
    return (Array.isArray(lines) ? lines : []).filter(function(line) {
      const t = String(line || '').trim()
      return t && !isVoicePrefixLine(line)
    }).length
  }

  if (countMelodyLines(inputs) > 1) {
    const mergedBarsByStrain = strainList.map(function(s, i) {
      const mergedText = mergedStrainTexts[i] != null
        ? mergedStrainTexts[i]
        : (s && s.text) || ''
      return extractBarsFromMelodyText(mergedText)
    })
    const origStrainBarCounts = strainList.map(function(s) {
      return extractBarsFromMelodyText((s && s.text) || '').length
    })
    const barCountsChanged = strainList.some(function(s, i) {
      return origStrainBarCounts[i] !== (mergedBarsByStrain[i] || []).length
    })
    // When a strain grows/shrinks, never slice updated bars by the old per-line
    // counts (spills onto the next section). Redistribute onto the original
    // lines of each strain so system breaks / newlines are preserved.
    if (barCountsChanged) {
      function strainEndSuffix(strain, body) {
        if (strain && strain.endBarline === '||') {
          if (!/\|\|\s*$/.test(body)) {
            return /\|\s*$/.test(body) ? '|' : '||'
          }
          return ''
        }
        if (strain && strain.endBarline === ':|') {
          if (!/:\|\s*$/.test(body)) return ':|'
          return ''
        }
        if (!/\|\s*$/.test(body)) return '|'
        return ''
      }
      function allocateBarCountsToLines(lineOrigCounts, newTotal) {
        const n = lineOrigCounts.length
        if (n === 0) return newTotal > 0 ? [Math.max(0, newTotal)] : []
        if (n === 1) return [Math.max(0, newTotal)]
        const result = lineOrigCounts.map(function(c) { return Math.max(0, c | 0) })
        const oldTotal = result.reduce(function(a, b) { return a + b }, 0)
        const target = Math.max(0, newTotal | 0)
        if (target >= oldTotal) {
          result[n - 1] += (target - oldTotal)
          return result
        }
        let toRemove = oldTotal - target
        for (let i = n - 1; i >= 0 && toRemove > 0; i--) {
          const take = Math.min(result[i], toRemove)
          result[i] -= take
          toRemove -= take
        }
        return result
      }

      const linePlansByStrain = strainList.map(function() { return [] })
      let walkStrainIdx = 0
      let walkBarOffset = 0
      inputs.forEach(function(originalLine, index) {
        const trimmed = String(originalLine || '').trim()
        if (!trimmed || isVoicePrefixLine(originalLine)) return
        const origBarCount = extractBarsFromMelodyText(originalLine).length
        if (walkStrainIdx >= linePlansByStrain.length) return
        linePlansByStrain[walkStrainIdx].push({
          index: index,
          lead: (String(originalLine).match(/^\s*/) || [''])[0],
          origBarCount: origBarCount,
          suffix: melodyLineSuffixAfterBars(originalLine),
          hadRepeatOpen: /^\s*\|:\s*/.test(originalLine),
        })
        walkBarOffset += origBarCount
        if (
          walkBarOffset >= origStrainBarCounts[walkStrainIdx]
          && walkStrainIdx < strainList.length - 1
        ) {
          walkStrainIdx += 1
          walkBarOffset = 0
        }
      })

      const out = inputs.map(function(originalLine) {
        if (isVoicePrefixLine(originalLine)) return originalLine
        const trimmed = String(originalLine || '').trim()
        if (!trimmed) return originalLine
        return null
      })
      linePlansByStrain.forEach(function(plans, strainIdx) {
        const strain = strainList[strainIdx]
        const strainBars = mergedBarsByStrain[strainIdx] || []
        if (!plans.length) {
          if (!strainBars.length) return
          let body = melodyLineFromBars(strainBars)
          if (strain && strain.startBarline === '|:' && !/^\|:/.test(body)) {
            body = '|: ' + body.replace(/^\|:\s*/, '')
          }
          out.push(body + strainEndSuffix(strain, body))
          return
        }
        const counts = allocateBarCountsToLines(
          plans.map(function(p) { return p.origBarCount }),
          strainBars.length
        )
        let barOffset = 0
        let firstEmitted = true
        plans.forEach(function(plan, planIdx) {
          const n = counts[planIdx] || 0
          const slice = strainBars.slice(barOffset, barOffset + n)
          barOffset += n
          if (n <= 0) {
            out[plan.index] = null
            return
          }
          let body = melodyLineFromBars(slice)
          if (
            firstEmitted
            && ((strain && strain.startBarline === '|:') || plan.hadRepeatOpen)
            && !/^\|:/.test(body)
          ) {
            body = '|: ' + body.replace(/^\|:\s*/, '')
          }
          firstEmitted = false
          const isLastEmitted = counts.slice(planIdx + 1).every(function(c) {
            return (c || 0) <= 0
          })
          const suffix = isLastEmitted
            ? (strainEndSuffix(strain, body) || (/\|\s*$/.test(body) ? '' : '|'))
            : (plan.suffix || (/\|\s*$/.test(body) ? '' : '|'))
          out[plan.index] = plan.lead + body + suffix
        })
      })
      const compacted = out.filter(function(line) { return line != null })
      return compacted.length ? compacted : ['']
    }
    let strainIdx = 0
    let barOffsetInStrain = 0
    let firstMelodyLine = true
    return inputs.map(function(originalLine) {
      const trimmed = String(originalLine || '').trim()
      if (!trimmed || isVoicePrefixLine(originalLine)) {
        return originalLine
      }
      const origBarCount = extractBarsFromMelodyText(originalLine).length
      const strainBars = mergedBarsByStrain[strainIdx] || []
      const slice = strainBars.slice(barOffsetInStrain, barOffsetInStrain + origBarCount)
      barOffsetInStrain += origBarCount
      if (barOffsetInStrain >= strainBars.length && strainIdx < mergedBarsByStrain.length - 1) {
        strainIdx += 1
        barOffsetInStrain = 0
      }
      const lead = (String(originalLine).match(/^\s*/) || [''])[0]
      let body = melodyLineFromBars(slice)
      if (firstMelodyLine && strainList[0] && strainList[0].startBarline === '|:') {
        body = '|: ' + body.replace(/^\|:\s*/, '')
      } else if (/^\s*\|:\s*/.test(originalLine)) {
        body = '|: ' + body.replace(/^\|:\s*/, '')
      }
      firstMelodyLine = false
      return lead + body + melodyLineSuffixAfterBars(originalLine)
    })
  }

  if (countMelodyLines(inputs) <= 1) {
    const out = []
    inputs.forEach(function(line) {
      if (isVoicePrefixLine(line)) out.push(line)
    })
    function closePreviousLine(separator) {
      if (!out.length || separator !== ' || ') return
      const last = out[out.length - 1]
      if (/(:\|:|:\||\|\||\|\])\s*$/.test(last)) return
      out[out.length - 1] = last.replace(/\s*\|\s*$/, '') + '||'
    }
    strainList.forEach(function(s, i) {
      const raw = String(
        mergedStrainTexts[i] != null ? mergedStrainTexts[i] : (s && s.text) || ''
      ).trim()
      if (!raw) return
      const pieces = raw.split('\n').map(function(piece) {
        return String(piece || '').trim()
      }).filter(Boolean)
      if (!pieces.length) return
      if (i > 0) {
        const prevText = out.length ? out[out.length - 1] : (strainList[i - 1] && strainList[i - 1].text) || ''
        const sep = strainJoinSeparator(
          Object.assign({}, strainList[i - 1], { text: prevText }),
          s
        )
        if (sep === ' |: ' && !/^\|:/.test(pieces[0])) {
          pieces[0] = '|: ' + pieces[0].replace(/^\|:\s*/, '')
        } else {
          closePreviousLine(sep)
        }
      }
      pieces.forEach(function(piece) { out.push(piece) })
    })
    if (!out.length) return inputs.length ? inputs.slice() : ['']
    return out
  }

  let strainCursor = 0
  const out = []
  inputs.forEach(function(originalLine) {
    if (!String(originalLine || '').trim()) {
      out.push(originalLine)
      return
    }
    if (isVoicePrefixLine(originalLine)) {
      out.push(originalLine)
      return
    }
    const lineStrains = splitMelodyStrainsWithBarlines([originalLine])
    if (!lineStrains.length) {
      out.push(originalLine)
      return
    }
    const lead = (String(originalLine).match(/^\s*/) || [''])[0]
    const chunks = []
    lineStrains.forEach(function(ls, localI) {
      const si = strainCursor
      strainCursor += 1
      let body = String(
        updatedStrainTexts[si] != null ? updatedStrainTexts[si] : ls.text
      ).trim()
      body = body.replace(/^\|:\s*/, '').trim()
      let prefix = ''
      if (localI > 0) {
        prefix = strainJoinSeparator(
          lineStrains[localI - 1],
          ls
        )
      } else if (ls.startBarline === '|:') {
        prefix = '|: '
      }
      chunks.push(prefix + body)
    })
    out.push(lead + chunks.join('').trim() + melodyLineSuffixAfterBars(originalLine))
  })
  return out.length ? out : ['']
}

function notesFingerprintOutsideBlocks(noteLines, blocks, editedIndexes) {
  const edited = {}
  ;(editedIndexes || []).forEach(function(i) { edited[i] = true })
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  return strains.map(function(strain, index) {
    if (edited[index]) return ''
    return stripChordsFromAbcText(strain.text).replace(/\s+/g, ' ').trim()
  }).join('||')
}

function headerFromAbc(abcString, abcTools) {
  const json = abcTools.abc2json(abcString)
  return {
    meter: normalizeMeter(json.meter || '4/4'),
    noteLength: json.noteLength || '1/8',
    key: json.key || 'C',
    abcJson: json,
  }
}

function miniAbcForStrain(header, strainText, startBarline) {
  const body = (startBarline === '|:' ? '|: ' : '') + String(strainText || '').trim()
  return [
    'X:1',
    'T:',
    'M:' + header.meter,
    'L:' + header.noteLength,
    'K:' + header.key,
    body,
  ].join('\n')
}

/** mergeChords returns rendered note body; only use justNotes when headers are present. */
function melodyTextFromMergeChordsOutput(mergedMini, abcTools) {
  const raw = String(mergedMini == null ? '' : mergedMini)
  const lines = (/^(X:|M:|L:|K:)/m.test(raw)
    ? abcTools.justNotes(raw).split('\n')
    : raw.split('\n'))
  return lines.map(function(line) {
    return String(line || '').trim()
  }).filter(Boolean).join('\n').replace(/^\|:\s*/, '').trim()
}

function chartHasMergeableContent(chart) {
  const split = splitChartHeaderAndBody(chart || '')
  const stripped = stripInlineSignatureMarkers(split.body || '')
  const text = String(stripped || '').trim()
  return text && text !== '|'
}

function padChartToBarCount(chart, barCount, meter) {
  const current = countChartBars(chart)
  if (current >= barCount) return String(chart || '').trim()
  const slots = []
  const existing = String(chart || '').trim()
  if (existing) slots.push(existing.replace(/\|\s*$/, '') + ' |')
  for (let i = current; i < barCount; i++) {
    slots.push('. |')
  }
  void meter
  return slots.join(' ').replace(/\s+/g, ' ').trim()
}

/**
 * Drop excess chart bars — leading empty slots first (|: phantom bars), then tail.
 */
export function trimChartToBarCount(chart, barCount) {
  const target = Math.max(0, Number(barCount) || 0)
  const split = splitChartHeaderAndBody(chart || '')
  const bodyText = String(split.body || chart || '').trim()
  if (!bodyText) {
    return split.headerLine ? joinChartHeaderAndBody(split.headerLine, '') : String(chart || '').trim()
  }
  const lines = bodyText.split('\n')
  const lineBars = lines.map(function(line) {
    return extractChordBars(line)
  })
  let flat = []
  lineBars.forEach(function(bars) {
    flat = flat.concat(bars)
  })
  while (flat.length > target && chartBarTokensAreEmpty(flat[0])) {
    flat.shift()
    let removed = false
    for (let i = 0; i < lineBars.length; i++) {
      if (lineBars[i].length > 0) {
        lineBars[i].shift()
        removed = true
        break
      }
    }
    if (!removed) break
  }
  while (flat.length > target) {
    flat.pop()
    for (let j = lineBars.length - 1; j >= 0; j--) {
      if (lineBars[j].length > 0) {
        lineBars[j].pop()
        break
      }
    }
  }
  const body = lineBars
    .map(function(bars) { return chartTextFromBarTokenArrays(bars) })
    .filter(Boolean)
    .join('\n')
  return split.headerLine ? joinChartHeaderAndBody(split.headerLine, body) : body
}

/**
 * Merge one block's chart into ABC (strain-scoped).
 */
export function mergeChordsForBlock(abcString, block, chartText, options) {
  const opts = options || {}
  const abcjsParser = opts.abcjsParser
  const abcTools = opts.tunebook && opts.tunebook.abcTools
  if (!abcjsParser || !abcTools) {
    return { ok: false, error: mergeFailure('abc_parse_error', 'Missing ABC tools') }
  }

  let noteLines
  const prefixSource = abcTools.justNotes(abcString).split('\n')
  try {
    noteLines = noteLinesFromAbcForMerge(abcString, abcTools)
  } catch (e) {
    return { ok: false, error: mergeFailure('abc_parse_error', e.message || 'ABC parse failed') }
  }

  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const strainIndex = block.melodyStrainIndex
  if (strainIndex < 0 || strainIndex >= strains.length) {
    return { ok: false, error: mergeFailure('anchor_missing_range', 'Block has no ABC strain') }
  }

  const strain = strains[strainIndex]
  const bars = extractBarsFromMelodyText(strain.text)
  const classes = bars.map(classifyBar)
  const mode = blockMergeMode(classes)
  const pitchCount = classes.filter(function(c) { return c === 'pitch' }).length
  const chartBars = countChartBars(chartText)

  if (opts.hasTimedMedia && chartBars !== bars.length && (mode === 'pitch')) {
    return { ok: false, error: mergeFailure('timed_media_conflict', 'Bar count change with timed media') }
  }

  if (mode === 'pitch' && chartBars < pitchCount) {
    return {
      ok: false,
      error: mergeFailure(
        'chart_shorter_than_melody',
        'Chart has fewer bars than pitched melody in this section',
        { blockTitle: block.title, blockIndex: strainIndex }
      ),
    }
  }

  const header = headerFromAbc(abcString, abcTools)
  header.meter = normalizeMeter(block.meter || header.meter)

  let chartForMerge = stripChartStructureMarkers(String(chartText || '').trim())
  if (block.meter && normalizeMeter(block.meter) !== normalizeMeter(header.abcJson.meter || header.meter)) {
    // Inline meter only for non-first blocks is handled via prepend on full grid;
    // for mini merge, set header meter to block meter when rewriting scaffold.
    if (mode !== 'pitch') header.meter = normalizeMeter(block.meter)
  }

  if (mode === 'pitch' && chartBars < bars.length) {
    chartForMerge = padChartToBarCount(chartForMerge, bars.length, block.meter)
  }

  const chartForMergeBars = countChartBars(chartForMerge)
  if (mode === 'pitch' && chartForMergeBars !== bars.length) {
    return {
      ok: false,
      error: mergeFailure(
        'block_count_mismatch',
        'Chord grid bar count does not match melody in this section',
        { blockTitle: block.title, blockIndex: strainIndex }
      ),
    }
  }

  const beforeOutside = notesFingerprintOutsideBlocks(noteLines, null, [strainIndex])
  const mini = miniAbcForStrain(header, strain.text, strain.startBarline)
  let mergedMini
  const useHarmonyOnly = mode === 'pitch' && chartForMergeBars === bars.length
  try {
    mergedMini = abcjsParser.mergeChords(
      chartForMerge,
      mini,
      null,
      useHarmonyOnly ? { harmonyOnly: true } : null
    )
  } catch (e) {
    return { ok: false, error: mergeFailure('chart_parse_error', e.message || 'Chord merge failed') }
  }

  const mergedNotes = melodyTextFromMergeChordsOutput(mergedMini, abcTools)
  const mergedFlat = mergedNotes
  // Drop leading |: if we injected it
  let strainOut = mergedFlat

  const rebuilt = strains.map(function(s, i) {
    if (i === strainIndex) return strainOut
    return s.text
  })

  // Rejoin with || between strains (preserve |: starts)
  let joined = ''
  strains.forEach(function(s, i) {
    if (i > 0) {
      joined += strainJoinSeparator(
        Object.assign({}, strains[i - 1], { text: rebuilt[i - 1] }),
        s
      )
    } else if (s.startBarline === '|:' || (i === strainIndex && block.strainStartBarline === '|:')) {
      // first strain with left repeat — keep if present in text
    }
    joined += rebuilt[i]
  })
  const newNoteLines = String(joined || '').trim().split('\n').map(function(line) {
    return String(line || '').trim()
  }).filter(Boolean)
  const afterOutside = notesFingerprintOutsideBlocks(newNoteLines, null, [strainIndex])
  // Recompute outside fingerprint using original strain texts for non-edited
  const afterStrains = splitMelodyStrainsWithBarlines(newNoteLines)
  const afterOutsideCheck = afterStrains.map(function(s, i) {
    if (i === strainIndex) return ''
    return stripChordsFromAbcText(s.text).replace(/\s+/g, ' ').trim()
  }).join('||')

  if (afterOutsideCheck !== beforeOutside && strains.length > 1) {
    // Soft check — strain join can normalize whitespace; compare chord-stripped
    const beforeNorm = beforeOutside.replace(/\s+/g, ' ')
    const afterNorm = afterOutsideCheck.replace(/\s+/g, ' ')
    if (beforeNorm !== afterNorm) {
      return {
        ok: false,
        error: mergeFailure('invariant_violation', 'Notes outside edited block changed'),
      }
    }
  }

  void afterOutside
  const noteLinesOut = mergeNoteLinesWithVoicePrefixes(
    prefixSource,
    [joined.trim()].filter(Boolean)
  )
  const newAbc = splicePrimaryVoiceNotes(
    abcString,
    noteLinesOut,
    abcTools,
    header.abcJson.voices
  )

  return { ok: true, abc: newAbc, noteLines: noteLinesOut }
}

/**
 * Transactional merge of all blocks (or wipe+scaffold).
 */
export function mergeAllChordBlocks(abcString, blocks, options) {
  let opts = options || {}
  const abcjsParser = opts.abcjsParser
  const tunebook = opts.tunebook
  const abcTools = tunebook && tunebook.abcTools
  if (!abcjsParser || !abcTools) {
    return { ok: false, error: mergeFailure('abc_parse_error', 'Missing ABC tools') }
  }
  if (Array.isArray(opts.notesBefore) && opts.notesBefore.length) {
    opts = Object.assign({}, opts, {
      notesBefore: mergeNoteLinesWithVoicePrefixes(opts.notesBefore, opts.notesBefore),
    })
  }

  const list = Array.isArray(blocks) ? blocks : []
  const prefixSource = prefixSourceForMerge(abcString, abcTools, opts)

  const grid = rebuildChordGridFromSections(list.map(function(b) {
    // Empty editor slots use `|` as a placeholder; merge needs a real rest bar
    // so we do not corrupt neighbouring scaffold bars.
    const chart = chartHasMergeableContent(b && b.chart) ? b.chart : '. |'
    return {
      chart: chart,
        meter: b.meter,
        abcKey: b.abcKey,
        tempo: b.tempo,
      chartRevisit: !!b.chartRevisit,
    }
  }))

  const probeNotes = noteLinesForMelodyMerge(primaryVoiceNotesForMerge(abcString, abcTools, opts))
  const shouldWipe = !!opts.wipeNotation
    || !noteLinesHaveRealMelody(probeNotes)
    || !!(opts.tune && opts.tune.timingScaffold)

  if (shouldWipe) {
    const header = headerFromAbc(abcString, abcTools)
    const firstMeter = firstSectionMeter(list, header.meter)
    const firstKey = firstSectionKey(list, header.key)
    const firstTempo = firstSectionTempo(list, header.abcJson && header.abcJson.tempo)
    const restUnit = restBarForMeter(firstMeter, header.noteLength)
    const emptyAbc = [
      'X:1',
      'T:',
      'M:' + firstMeter,
      'L:' + header.noteLength,
      'Q:1/4=' + firstTempo,
      'K:' + firstKey,
      restUnit + ' |',
    ].join('\n')
    try {
      const merged = abcjsParser.mergeChords(grid, emptyAbc, opts.chordSheetAlignment || null)
      const noteLines = noteLinesFromMergedBody(merged, abcTools)
      const spliced = splicePrimaryVoiceNotes(
        abcString,
        noteLines,
        abcTools,
        header.abcJson.voices
      )
      return { ok: true, abc: spliced, wiped: true, noteLines: mergeNoteLinesWithVoicePrefixes(prefixSource, noteLines) }
    } catch (e) {
      return { ok: false, error: mergeFailure('chart_parse_error', e.message || 'Scaffold rebuild failed') }
    }
  }

  let noteLines = primaryVoiceNotesForMerge(abcString, abcTools, opts)
  let workingBlocks = list
  const headerEarly = headerFromAbc(abcString, abcTools)
  const expand = autoExpandNoteLinesForBlocks(
    noteLines,
    list,
    opts.defaultMeter,
    headerEarly.noteLength
  )
  if (expand.error) {
    return { ok: false, error: expand.error }
  }
  if (expand.expanded) {
    noteLines = expand.noteLines
    workingBlocks = expand.blocks
    // Write expanded notes into abc snapshot on the primary voice only.
    abcString = splicePrimaryVoiceNotes(
      abcString,
      noteLines,
      abcTools,
      headerFromAbc(abcString, abcTools).abcJson.voices
    )
  }

  const harmonyOnly = melodyUsesBracketChordClusters(noteLines)
  const hasTimedMedia = !!(opts.tune && (opts.tune.timedChords || opts.tune.timedLyrics || opts.tune.timedMelody))

  // Pitch or rest/scaffold: merge per strain onto the primary voice.
  // (Full wipe rewrite is reserved for opts.wipeNotation above.)
  const strains = splitMelodyStrainsWithBarlines(noteLines)
  const header = headerFromAbc(abcString, abcTools)
  if (harmonyOnly && opts.tune) {
    if (opts.tune.meter) header.meter = normalizeMeter(opts.tune.meter)
    if (opts.tune.key) header.key = normalizeKeySignature(opts.tune.key)
    if (opts.tune.noteLength) header.noteLength = opts.tune.noteLength
  }
  const firstMeter = firstSectionMeter(workingBlocks, opts.defaultMeter || header.meter)
  const firstKey = firstSectionKey(workingBlocks, header.key)
  const hasTimed = hasTimedMedia
  const updatedStrainTexts = strains.map(function(s) { return s.text })
  const harmonyOnlyStrainIndexes = {}
  let previousSoundingKey = firstKey
  let previousSoundingMeter = firstMeter
  let previousSoundingTempo = firstSectionTempo(workingBlocks, header.abcJson && header.abcJson.tempo)
  let soundingIndex = 0
  let chartResyncSlices = null

  function resyncedChartForStrain(strainIdx) {
    if (!chartResyncSlices && abcjsParser) {
      const tune = opts.tune || {}
      const full = abcjsParser.renderChords(
        abcString,
        true,
        0,
        normalizeKeySignature(tune.key || header.key),
        tune.noteLength || header.noteLength,
        normalizeMeter(firstMeter)
      )
      chartResyncSlices = sliceChartAcrossStrainBarCounts(
        full,
        strains.map(function(s) { return extractBarsFromMelodyText(s.text).length })
      )
    }
    return chartResyncSlices && chartResyncSlices[strainIdx] != null
      ? chartResyncSlices[strainIdx]
      : ''
  }

  // Editor blocks from paste/tests may omit melodyStrainIndex — default by order.
  let strainCursor = 0
  workingBlocks = workingBlocks.map(function(b) {
    if (!b || b.chartRevisit) return b
    if (b.melodyStrainIndex == null || b.melodyStrainIndex < 0) {
      const assigned = strainCursor
      strainCursor += 1
      return Object.assign({}, b, { melodyStrainIndex: assigned })
    }
    strainCursor = Math.max(strainCursor, (b.melodyStrainIndex | 0) + 1)
    return b
  })

  workingBlocks = alignBlockChartsToMelody(noteLines, workingBlocks)

  for (let i = 0; i < workingBlocks.length; i++) {
    const block = workingBlocks[i]
    if (!block || block.chartRevisit) continue
    // Empty new sections keep expanded rest scaffold; do not run mergeChords on blank chart.
    if (!chartHasMergeableContent(block.chart)) continue
    const strainIndex = block.melodyStrainIndex
    if (strainIndex == null || strainIndex < 0 || strainIndex >= strains.length) {
      return { ok: false, error: mergeFailure('anchor_missing_range', 'Block has no ABC strain') }
    }

    let strainText = updatedStrainTexts[strainIndex]
    let bars = extractBarsFromMelodyText(strainText)
    const classes = bars.map(classifyBar)
    const mode = blockMergeMode(classes)
    const pitchCount = classes.filter(function(c) { return c === 'pitch' }).length
    const chartBars = countChartBars(block.chart)

    if (hasTimed && chartBars !== bars.length && mode === 'pitch') {
      return { ok: false, error: mergeFailure('timed_media_conflict', 'Bar count change with timed media') }
    }
    if (mode === 'pitch' && chartBars < pitchCount) {
      return {
        ok: false,
        error: mergeFailure(
          'chart_shorter_than_melody',
          'Chart has fewer bars than pitched melody in this section',
          { blockTitle: block.title, blockIndex: strainIndex }
        ),
      }
    }

    let chartForMerge = String(block.chart || '').trim()
    const blockAbcKey = normalizeKeySignature(block.abcKey || previousSoundingKey || firstKey)
    const blockMeter = normalizeMeter(block.meter || previousSoundingMeter || firstMeter)
    const blockTempo = normalizeTempo(block.tempo) || previousSoundingTempo
    if (soundingIndex > 0) {
      chartForMerge = prependInlineSignatureMarkersRespectingMelody(
        chartForMerge,
        { key: blockAbcKey, meter: blockMeter, tempo: blockTempo },
        { key: previousSoundingKey, meter: previousSoundingMeter, tempo: previousSoundingTempo },
        strainText
      )
    }

    let chartForMergeBars = countChartBars(chartForMerge)
    if (chartForMergeBars > bars.length) {
      // Expand notation to fit the longer chord grid (do not silently trim chords).
      const padded = appendRestBarsToStrain(
        strainText,
        chartForMergeBars - bars.length,
        blockMeter,
        '',
        header.noteLength
      )
      updatedStrainTexts[strainIndex] = padded
      strainText = padded
      bars = extractBarsFromMelodyText(padded)
    }
    if (chartForMergeBars !== bars.length && (mode === 'pitch' || harmonyOnly)) {
      if (chartForMergeBars < bars.length) {
        const normalized = normalizeChartToBarCount(chartForMerge, bars.length)
        if (countChartBars(normalized) === bars.length) {
          chartForMerge = normalized
          chartForMergeBars = bars.length
          workingBlocks[i] = Object.assign({}, block, { chart: normalized })
        }
      }
      if (chartForMergeBars !== bars.length) {
        return {
          ok: false,
          error: mergeFailure(
            'block_count_mismatch',
            'Chord grid bar count does not match melody in this section',
            { blockTitle: block.title, blockIndex: strainIndex }
          ),
        }
      }
    }

    const miniHeader = {
      meter: soundingIndex === 0
        ? normalizeMeter(header.meter || firstMeter)
        : previousSoundingMeter,
      noteLength: header.noteLength,
      key: soundingIndex === 0
        ? normalizeKeySignature(header.key || firstKey)
        : previousSoundingKey,
    }
    const mini = miniAbcForStrain(miniHeader, strainText, strains[strainIndex].startBarline)
    let mergedMini
    const useHarmonyOnly = (harmonyOnly || mode === 'pitch') && chartForMergeBars === bars.length
    if (useHarmonyOnly) {
      harmonyOnlyStrainIndexes[strainIndex] = true
    }
    const baselineChart = useHarmonyOnly ? resyncedChartForStrain(strainIndex) : ''
    const mergeOpts = useHarmonyOnly
      ? {
          harmonyOnly: true,
          baselineChordText: baselineChart || undefined,
        }
      : null
    try {
      mergedMini = abcjsParser.mergeChords(chartForMerge, mini, null, mergeOpts)
    } catch (e) {
      return { ok: false, error: mergeFailure('chart_parse_error', e.message || 'Chord merge failed') }
    }
    const mergedStrainTextRaw = melodyTextFromMergeChordsOutput(mergedMini, abcTools)
    let mergedStrainText = useHarmonyOnly
      ? restorePartBreakMarkers(strainText, mergedStrainTextRaw)
      : mergedStrainTextRaw
    if (useHarmonyOnly) {
      const chartSynced = applyLeadingChordsFromChart(strainText, chartForMerge, {
        meter: miniHeader.meter,
        noteLength: miniHeader.noteLength,
      })
      if (chartSynced && harmonyEditPreservesMelody(strainText, chartSynced, true)) {
        mergedStrainText = restorePartBreakMarkers(strainText, chartSynced)
      } else if (!harmonyEditPreservesMelody(strainText, mergedStrainText, true)) {
        return {
          ok: false,
          error: mergeFailure(
            'invariant_violation',
            'Chord merge would alter melody notation'
          ),
        }
      }
    }
    if (strainTextHasPitch(strainText) && !strainTextHasPitch(mergedStrainText)) {
      updatedStrainTexts[strainIndex] = strainText
    } else if (
      strainTextHasPitch(strainText)
      && !harmonyEditPreservesMelody(strainText, mergedStrainText, useHarmonyOnly)
    ) {
      return {
        ok: false,
        error: mergeFailure(
          'invariant_violation',
          'Chord merge would alter melody notation'
        ),
      }
    } else {
      updatedStrainTexts[strainIndex] = mergedStrainText
    }
    previousSoundingKey = blockAbcKey
    previousSoundingMeter = blockMeter
    if (blockTempo != null) previousSoundingTempo = blockTempo
    soundingIndex += 1
  }

  // If expand added strains and no charts needed merging, return expanded ABC as-is.
  const mergedAny = workingBlocks.some(function(b) {
    return b && !b.chartRevisit && chartHasMergeableContent(b.chart)
  })
  if (!mergedAny) {
    return {
      ok: true,
      abc: abcString,
      blocks: workingBlocks,
      noteLines: mergeNoteLinesWithVoicePrefixes(prefixSource, noteLines),
    }
  }

  const beforeOutside = strains.map(function(s, i) {
    return stripChordsFromAbcText(s.text).replace(/\s+/g, ' ').trim()
  })

  const editedStrainIndexes = {}
  workingBlocks.forEach(function(b) {
    if (b && !b.chartRevisit && chartHasMergeableContent(b.chart)) {
      editedStrainIndexes[b.melodyStrainIndex] = true
    }
  })

  let notesOut = rebuildNoteLinesFromMergedStrains(
    noteLines,
    strains,
    updatedStrainTexts
  )
  const afterStrains = splitMelodyStrainsWithBarlines(notesOut)
  for (let i = 0; i < strains.length; i++) {
    const before = beforeOutside[i]
    const after = afterStrains[i]
      ? stripChordsFromAbcText(afterStrains[i].text).replace(/\s+/g, ' ').trim()
      : ''
    const block = workingBlocks.find(function(b) {
      return b && !b.chartRevisit && b.melodyStrainIndex === i
    })
    const origBars = extractBarsFromMelodyText(strains[i].text).length
    const newBars = afterStrains[i] ? extractBarsFromMelodyText(afterStrains[i].text).length : 0
    const chartBars = block ? countChartBars(block.chart) : 0

    if (!editedStrainIndexes[i] && before !== after) {
      const origText = strains[i].text
      const afterText = afterStrains[i] ? afterStrains[i].text : ''
      if (!melodiesMatchForChordEdit(origText, afterText)) {
        return {
          ok: false,
          error: mergeFailure(
            'invariant_violation',
            'Non-edited strain notation changed during merge'
          ),
        }
      }
    }

    if (editedStrainIndexes[i] && strainTextHasPitch(strains[i].text)) {
      const afterText = afterStrains[i] ? afterStrains[i].text : ''
      const referenceText = updatedStrainTexts[i] != null
        ? updatedStrainTexts[i]
        : strains[i].text
      const harmonyStrain = !!harmonyOnlyStrainIndexes[i]
      if (!harmonyEditPreservesMelody(referenceText, afterText, harmonyStrain)) {
        return {
          ok: false,
          error: mergeFailure(
            'invariant_violation',
            'Chord merge would alter melody notation'
          ),
        }
      }
    }

    if (
      block
      && chartBars > 0
      && chartBars !== origBars
      && newBars !== chartBars
      && newBars !== origBars
    ) {
      return {
        ok: false,
        error: mergeFailure(
          'invariant_violation',
          'Merged strain bar count does not match chord grid'
        ),
      }
    }
    if (block && chartBars === origBars && newBars === origBars) {
      const beforeNoChords = before.replace(/"[^"]*"/g, '')
      const afterNoChords = after.replace(/"[^"]*"/g, '')
      const hasPitch = /[a-gA-G]/.test(beforeNoChords)
      if (hasPitch && before !== after) {
        const pitchStrip = function(text) {
          const norm = harmonyOnly ? normalizeBracketPitchOrder(text) : text
          return norm.replace(/[^a-gA-GzZ]/g, '')
        }
        const beforePitch = pitchStrip(beforeNoChords)
        const afterPitch = pitchStrip(afterNoChords)
        if (beforePitch !== afterPitch) {
          return {
            ok: false,
            error: mergeFailure('invariant_violation', 'Notes outside chord updates changed'),
          }
        }
        if (
          block
          && !chartHasInlineMeterToken(block.chart)
          && melodyRestUnitCount(beforeNoChords) !== melodyRestUnitCount(afterNoChords)
        ) {
          return {
            ok: false,
            error: mergeFailure(
              'invariant_violation',
              'Rest duration changed outside inline meter edits'
            ),
          }
        }
      }
      if (!hasPitch) {
        const chartHasContent = block && String(stripInlineSignatureMarkers(block.chart) || '').trim()
        if (!chartHasContent) {
          const countRests = function(text) {
            return (String(text || '').match(/z/gi) || []).length
          }
          if (countRests(beforeNoChords) !== countRests(afterNoChords)) {
            return {
              ok: false,
              error: mergeFailure('invariant_violation', 'Rest scaffold changed outside chord updates'),
            }
          }
        }
      }
    }
  }

  const voiceKey = resolvePrimaryVoiceKey(header.abcJson.voices)
  if (!voiceKey) {
    return { ok: false, error: mergeFailure('no_primary_voice', 'No primary voice') }
  }
  if (notesOut.length === 0 || !notesOut.some(function(line) { return String(line || '').trim() })) {
    return { ok: false, error: mergeFailure('abc_parse_error', 'Merged notes empty') }
  }
  notesOut = mergeNoteLinesWithVoicePrefixes(prefixSource, notesOut)
  header.abcJson.voices = Object.assign({}, header.abcJson.voices)
  header.abcJson.voices[voiceKey] = Object.assign(
    {},
    header.abcJson.voices[voiceKey] || { meta: '', notes: [] },
    { notes: notesOut }
  )
  header.abcJson.meter = normalizeMeter(firstMeter)
  header.abcJson.key = normalizeKeySignature(firstKey)
  const currentAbc = splicePrimaryVoiceNotes(
    abcString,
    notesOut,
    abcTools,
    header.abcJson.voices
  )
  return { ok: true, abc: currentAbc, blocks: workingBlocks, noteLines: notesOut }
}

export function readChordBlockCache(tune) {
  const cache = tune && tune.meta && tune.meta.chordBlockCache
  if (!cache || cache.version !== CACHE_VERSION) return null
  return cache
}

export function writeChordBlockCache(tune, abcHash, blocks) {
  if (!tune) return
  tune.meta = Object.assign({}, tune.meta || {})
  tune.meta.chordBlockCache = {
    version: CACHE_VERSION,
    abcHash: abcHash,
    blocks: (blocks || []).map(function(b) {
      return {
        id: b.id || b.key,
        key: b.key,
        chart: b.chart,
        meter: b.meter,
        abcKey: b.abcKey,
        abcBarStart: b.abcBarStart,
        abcBarEnd: b.abcBarEnd,
        melodyStrainIndex: b.melodyStrainIndex,
        title: b.title,
        chartRevisit: !!b.chartRevisit,
        sourceTypeKey: b.sourceTypeKey,
        lyricSectionType: b.lyricSectionType,
        lyricSectionHeader: b.lyricSectionHeader,
        strainStartBarline: b.strainStartBarline,
        strainEndBarline: b.strainEndBarline,
        notationMarkerWritten: !!b.notationMarkerWritten,
        writeNotationMarker: !!b.writeNotationMarker,
      }
    }),
  }
}

export function invalidateChordBlockCache(tune) {
  if (!tune || !tune.meta) return
  delete tune.meta.chordBlockCache
}

/**
 * Sync tune.chordSectionLabels from section-marker quoted chords in the primary
 * voice. ABC marker text wins when present; chartRevisit is preserved from
 * existing labels at each strain index.
 */
export function syncChordSectionLabelsFromPrimaryVoice(tune, noteLines) {
  if (!tune) return
  const lines = Array.isArray(noteLines) ? noteLines : []
  const strains = splitMelodyStrainsWithBarlines(lines)
  const existing = Array.isArray(tune.chordSectionLabels) ? tune.chordSectionLabels : []

  tune.chordSectionLabels = strains.map(function(strain, index) {
    const markerHeader = firstSectionMarkerHeaderInMelodyText(strain.text)
    const prev = existing[index]
    if (markerHeader) {
      return {
        header: markerHeader,
        title: sectionDisplayTitle({ header: markerHeader, lines: [] }),
        type: normalizeSectionType(markerHeader),
        chartRevisit: prev ? !!prev.chartRevisit : false,
      }
    }
    if (prev) {
      return {
        header: prev.header || '',
        title: prev.title || '',
        type: prev.type != null ? prev.type : null,
        chartRevisit: !!prev.chartRevisit,
      }
    }
    return {
      header: '',
      title: '',
      type: null,
      chartRevisit: false,
    }
  })
}

/**
 * Apply merged ABC + optional lyrics onto tune; save path helper.
 */
export function applyBlockMergeToTune(tune, options) {
  const opts = options || {}
  const tunebook = opts.tunebook
  const abcjsParser = opts.abcjsParser
  const abcTools = tunebook && tunebook.abcTools
  if (!tune || !abcTools || !abcjsParser) {
    return { ok: false, error: mergeFailure('abc_parse_error', 'Missing tools') }
  }

  let abc = opts.abc
  if (!abc) abc = abcTools.json2abc(tune)

  const blocks = opts.blocks
  const notesBeforeClean = Array.isArray(opts.notesBefore) && opts.notesBefore.length
    ? mergeNoteLinesWithVoicePrefixes(opts.notesBefore, opts.notesBefore)
    : opts.notesBefore
  const result = mergeAllChordBlocks(abc, blocks, {
    abcjsParser: abcjsParser,
    tunebook: tunebook,
    wipeNotation: !!opts.wipeNotation,
    chordSheetAlignment: opts.chordSheetAlignment,
    defaultMeter: opts.defaultMeter || tune.meter,
    tune: tune,
    notesBefore: notesBeforeClean,
  })
  if (!result.ok) return result

  const abcJson = abcTools.abc2json(result.abc)
  // Always write onto the tune's existing primary voice — never adopt a fresh
  // voice key invented by parsing a notes-only merge body.
  const voiceKey = resolvePrimaryVoiceKey(tune.voices || abcJson.voices)
  const rawNoteLines = Array.isArray(result.noteLines) && result.noteLines.length
    ? result.noteLines
    : noteLinesFromMergedBody(result.abc, abcTools)
  const mergedMelodyLines = noteLinesForMelodyMerge(rawNoteLines)
  const noteLines = mergeNoteLinesWithVoicePrefixes(
    Array.isArray(notesBeforeClean) ? notesBeforeClean : [],
    rawNoteLines
  )
  const melodyBefore = noteLinesForMelodyMerge(notesBeforeClean)
  const hadMelody = noteLinesHaveRealMelody(melodyBefore)
  if (hadMelody && !noteLinesHaveRealMelody(mergedMelodyLines)) {
    return {
      ok: false,
      error: mergeFailure('invariant_violation', 'Chord save would remove melody notation'),
    }
  }
  if (!tune.voices) tune.voices = {}
  // Keep any sibling voices; only replace primary notes.
  tune.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey] || { meta: '', notes: [] }, {
    notes: noteLines,
  })
  if (opts.firstMeter) tune.meter = normalizeMeter(opts.firstMeter)
  else if (abcJson.meter) tune.meter = normalizeMeter(abcJson.meter)
  const firstKey = opts.firstKey != null
    ? normalizeKeySignature(opts.firstKey)
    : firstSectionKey(blocks, abcJson.key || tune.key)
  if (firstKey) tune.key = firstKey
  const firstTempo = opts.firstTempo != null
    ? normalizeTempo(opts.firstTempo)
    : firstSectionTempo(blocks, abcJson.tempo || tune.tempo)
  if (firstTempo) tune.tempo = firstTempo

  if (opts.wipeNotation || opts.clearTransientTimed || result.wiped) {
    clearTransientTimedFields(tune)
  }

  if (opts.updateLyrics && Array.isArray(opts.lyricLines)) {
    setPlainLyricLines(tune, opts.lyricLines)
    if (noteLines.length > 0) {
      const spaced = buildNotationWLines(tune)
      if (spaced.some(function(line) { return String(line || '').trim().length > 0 })) {
        setNoteAlignedLyricLines(tune, spaced)
      }
    }
  }

  const extracted = buildUnifiedBlocks({
    noteLines: noteLinesForMelodyMerge(noteLines),
    chordChart: rebuildChordGridFromSections(blocks || []),
    lyricLines: getPlainLyricLines(tune),
    title: tune.name || tune.title,
    composer: tune.composer,
    defaultMeter: tune.meter,
    chordSectionLabels: Array.isArray(opts.chordSectionLabels)
      ? opts.chordSectionLabels
      : (Array.isArray(blocks) ? chordSectionLabelsFromSections(blocks) : tune.chordSectionLabels),
  })
  // Prefer the editor's section list (titles, empty New slots, delete order).
  // Re-extracting from ABC/lyrics drops empty sections and remaps by melody
  // strain count, which made Delete remove the wrong block in the UI.
  const editorBlocks = Array.isArray(blocks) && blocks.length > 0 && opts.keepEditorBlocks !== false
    ? blocks.map(function(b, index) {
      if (!b) return b
      const key = b.key || sectionKeyForIndex(index, b.type || b.lyricSectionType, b.header || b.lyricSectionHeader)
      return Object.assign({}, b, {
        key: key,
        id: b.id || key,
      })
    })
    : extracted.blocks
  if (Array.isArray(editorBlocks)) {
    tune.chordSectionLabels = chordSectionLabelsFromSections(editorBlocks)
  }
  writeChordBlockCache(tune, extracted.abcHash, editorBlocks)
  return { ok: true, tune: tune, blocks: editorBlocks, wiped: !!result.wiped }
}
