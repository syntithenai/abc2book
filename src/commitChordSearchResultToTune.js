import { parseChordSheetText, extractPreservedChordProLyricLines } from './chordProFormatUtils'
import { buildMeterMergeOptions } from './applyChordSheetToTune'
import {
  buildTuneSectionsFromPaste,
  firstSectionMeter,
  listPasteChordSections,
} from './chordsEditorSections'
import { commitPasteChordSheetToTune } from './commitPasteChordSheetToTune'
import { shouldSkipAbcMergeForChordPaste } from './chordPastePolicy'
import { sheetLinesToEmbeddedLyricLines } from './chordSheetImportUtils'
import { hasLyricEmbeddedChords, linesHaveChordProInlineChords } from './chordSheetUtils'

function chordSheetTextFromSearchResult(result) {
  if (!result || typeof result !== 'object') return ''
  if (result.chordProSource && String(result.chordProSource).trim()) {
    return String(result.chordProSource)
  }
  if (Array.isArray(result.sheetLines) && result.sheetLines.length) {
    return result.sheetLines.map(function(line) { return String(line) }).join('\n')
  }
  if (result.chordText && String(result.chordText).trim()) {
    // chordText may be wizard bar-grid only; prefer lyricLines when they already
    // carry placement, else fall through to chordText for parse attempt.
    if (Array.isArray(result.lyricLines) && hasLyricEmbeddedChords(result.lyricLines)) {
      return result.lyricLines.join('\n')
    }
    return String(result.chordText)
  }
  if (Array.isArray(result.lyricLines) && result.lyricLines.length) {
    return result.lyricLines.join('\n')
  }
  return ''
}

/**
 * Prefer lyrics with chords embedded (ChordPro / chords-over-words). Fall back
 * to plain lyric lines from the search result or parsed sections.
 */
function lyricLinesFromParsed(parsed, result) {
  if (Array.isArray(result && result.lyricLines) && hasLyricEmbeddedChords(result.lyricLines)) {
    return result.lyricLines.slice()
  }
  if (Array.isArray(result && result.sheetLines) && result.sheetLines.length) {
    const embedded = sheetLinesToEmbeddedLyricLines(result.sheetLines)
    if (embedded.length && hasLyricEmbeddedChords(embedded)) {
      return embedded
    }
  }
  if (parsed && Array.isArray(parsed.lyricLines) && hasLyricEmbeddedChords(parsed.lyricLines)) {
    return parsed.lyricLines.slice()
  }
  const chordProSource = (parsed && parsed.chordProSource)
    || (result && result.chordProSource)
    || ''
  if (chordProSource) {
    const preserved = extractPreservedChordProLyricLines(chordProSource)
    if (preserved.length && (
      linesHaveChordProInlineChords(preserved) || hasLyricEmbeddedChords(preserved)
    )) {
      return preserved
    }
  }
  if (parsed && Array.isArray(parsed.lyricLines) && parsed.lyricLines.length) {
    const embedded = sheetLinesToEmbeddedLyricLines(parsed.lyricLines)
    if (embedded.length) return embedded
  }
  if (result && Array.isArray(result.lyricLines) && result.lyricLines.length) {
    return result.lyricLines.slice()
  }
  const sections = listPasteChordSections(parsed)
  const lines = []
  sections.forEach(function(section, index) {
    if (section.header) lines.push(section.header)
    ;(section.lyricLines || []).forEach(function(line) { lines.push(line) })
    if (index < sections.length - 1) lines.push('')
  })
  return lines
}

/**
 * Parse a chords-search result and merge it into the tune.
 * Always writes chords+lyrics into the lyrics block. Merges into ABC only when
 * notation is empty (no real melody), unless skipAbcMerge is explicitly set.
 */
export function commitChordSearchResultToTune(options) {
  const opts = options || {}
  const result = opts.result
  const tune = opts.tune
  if (!result || !tune) {
    return { ok: false, error: { message: 'Missing chord search result' } }
  }

  const text = chordSheetTextFromSearchResult(result)
  if (!String(text || '').trim()) {
    return { ok: false, error: { message: 'Chord search returned no sheet text' } }
  }

  let parsed
  try {
    parsed = parseChordSheetText(text, { fallbackTitle: tune.name })
  } catch (e) {
    return {
      ok: false,
      error: { message: (e && e.message) ? e.message : 'Could not parse chord sheet' },
    }
  }

  const pasteSections = listPasteChordSections(parsed)
  if (!pasteSections.length) {
    return { ok: false, error: { message: 'Chord search returned no sections' } }
  }

  const defaultMeter = firstSectionMeter(pasteSections, tune.meter || parsed.meter || '4/4')
  const sections = buildTuneSectionsFromPaste(pasteSections, defaultMeter)
  const meterDecision = buildMeterMergeOptions(parsed.meter, tune.meter)
  const selectedMeterOption = (meterDecision.options && meterDecision.options[0])
    || { meter: defaultMeter, id: 'first-section' }
  // Always update lyrics from chord sheet when importing chords.
  const updateLyrics = opts.updateLyrics !== false
  const lyricLines = updateLyrics ? lyricLinesFromParsed(parsed, result) : undefined
  const skipAbcMerge = opts.skipAbcMerge != null
    ? !!opts.skipAbcMerge
    : shouldSkipAbcMergeForChordPaste(tune)

  return commitPasteChordSheetToTune({
    result: {
      sections: sections,
      meta: {
        title: result.title || parsed.title,
        name: result.title || parsed.title,
        composer: result.artist || parsed.composer,
        key: result.key || parsed.key,
        capo: result.capo != null ? result.capo : parsed.capo,
        tempo: result.tempo != null ? result.tempo : parsed.tempo,
        meter: selectedMeterOption.meter,
        chordProSource: parsed.chordProSource || text,
      },
      chordSheetAlignment: result.chordSheetAlignment || parsed.chordSheetAlignment,
      chordProSource: parsed.chordProSource || text,
      selectedMeterOption: selectedMeterOption,
      updateLyrics: updateLyrics,
      lyricLines: lyricLines,
    },
    tune: tune,
    abc: opts.abc,
    tunebook: opts.tunebook,
    abcjsParser: opts.abcjsParser,
    forceUpdateLyrics: updateLyrics,
    skipAbcMerge: skipAbcMerge,
    skipSave: !!opts.skipSave,
    historyLabel: opts.historyLabel
      || (skipAbcMerge
        ? 'Search chords and lyrics'
        : (updateLyrics ? 'Search chords and lyrics' : 'Search chords')),
  })
}
