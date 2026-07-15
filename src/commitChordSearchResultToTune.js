import { parseChordSheetText } from './chordProFormatUtils'
import { buildMeterMergeOptions } from './applyChordSheetToTune'
import {
  buildTuneSectionsFromPaste,
  firstSectionMeter,
  listPasteChordSections,
} from './chordsEditorSections'
import { commitPasteChordSheetToTune } from './commitPasteChordSheetToTune'

function chordSheetTextFromSearchResult(result) {
  if (!result || typeof result !== 'object') return ''
  if (result.chordProSource && String(result.chordProSource).trim()) {
    return String(result.chordProSource)
  }
  if (result.chordText && String(result.chordText).trim()) {
    return String(result.chordText)
  }
  if (Array.isArray(result.sheetLines) && result.sheetLines.length) {
    return result.sheetLines.map(function(line) { return String(line) }).join('\n')
  }
  return ''
}

function lyricLinesFromParsed(parsed, result) {
  if (result && Array.isArray(result.lyricLines) && result.lyricLines.length) {
    return result.lyricLines.slice()
  }
  if (parsed && Array.isArray(parsed.lyricLines) && parsed.lyricLines.length) {
    return parsed.lyricLines.slice()
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
 * Parse a chords-search result and merge it into the tune (wipe notation,
 * optional lyrics) without opening the paste modal.
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
  const updateLyrics = !!opts.updateLyrics
  const lyricLines = updateLyrics ? lyricLinesFromParsed(parsed, result) : undefined

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
    skipSave: !!opts.skipSave,
    historyLabel: opts.historyLabel
      || (updateLyrics ? 'Search chords and lyrics' : 'Search chords'),
  })
}
