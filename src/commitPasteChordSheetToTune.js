import { fillEmptyTuneFieldsFromMeta } from './applyChordSheetToTune'
import { applyBlockMergeToTune } from './chordBlockMerge'
import { firstSectionMeter } from './chordsEditorSections'
import { getPlainLyricLines, setPlainLyricLines } from './wLinesUtils'
import { extractPreservedChordProLyricLines } from './chordProFormatUtils'
import { linesHaveChordProInlineChords } from './chordSheetUtils'

/**
 * Apply a PasteChordSheetModal result onto a tune (wipe notation + optional lyrics).
 * Mutates and saves via tunebook.saveTune.
 *
 * When skipAbcMerge is true, only lyrics + chordProSource meta are updated.
 *
 * @returns {{ ok: boolean, tune?: object, error?: object, updateLyrics?: boolean, lyricLines?: string[] }}
 */
export function commitPasteChordSheetToTune(options) {
  const opts = options || {}
  const result = opts.result
  const tunebook = opts.tunebook
  const abcjsParser = opts.abcjsParser
  const sourceTune = opts.tune
  const abc = opts.abc
  if (!result || !tunebook || !tunebook.abcTools || !sourceTune) {
    return { ok: false, error: { message: 'Missing paste dependencies' } }
  }

  if (opts.skipAbcMerge) {
    fillEmptyTuneFieldsFromMeta(sourceTune, result.meta)
    sourceTune.meta = Object.assign({}, sourceTune.meta || {})
    if (result.chordProSource || (result.meta && result.meta.chordProSource)) {
      sourceTune.meta.chordProSource = result.chordProSource
        || result.meta.chordProSource
    }
    if (result.chordSheetAlignment !== undefined) {
      sourceTune.meta.chordSheetAlignment = result.chordSheetAlignment
    }
    let lyricLines = Array.isArray(result.lyricLines) ? result.lyricLines.slice() : null
    if ((!lyricLines || !lyricLines.length) && result.chordProSource) {
      lyricLines = extractPreservedChordProLyricLines(result.chordProSource)
    }
    if (!lyricLines || !lyricLines.length) {
      lyricLines = getPlainLyricLines(sourceTune)
    }
    if (result.chordProSource) {
      const preserved = extractPreservedChordProLyricLines(result.chordProSource)
      if (preserved.length && linesHaveChordProInlineChords(preserved)) {
        lyricLines = preserved
      }
    }
    setPlainLyricLines(sourceTune, lyricLines)
    if (!opts.skipSave) {
      tunebook.saveTune(sourceTune, false, {
        historyLabel: opts.historyLabel || 'Update lyric chord sheet',
        immediate: true,
      })
    }
    return {
      ok: true,
      tune: sourceTune,
      updateLyrics: true,
      lyricLines: lyricLines,
    }
  }

  if (!abcjsParser) {
    return { ok: false, error: { message: 'Missing paste dependencies' } }
  }

  const abcJson = tunebook.abcTools.abc2json(abc || tunebook.abcTools.json2abc(sourceTune))
  abcJson.id = sourceTune.id
  if (sourceTune.timingScaffold) abcJson.timingScaffold = true
  if (sourceTune.meta) abcJson.meta = Object.assign({}, sourceTune.meta, abcJson.meta || {})
  if (sourceTune.words) abcJson.words = sourceTune.words.slice()
  if (sourceTune.wLines) abcJson.wLines = sourceTune.wLines.slice()

  fillEmptyTuneFieldsFromMeta(abcJson, result.meta)
  if (result.selectedMeterOption && result.selectedMeterOption.meter) {
    abcJson.meter = result.selectedMeterOption.meter
  }
  if (result.chordSheetAlignment !== undefined) {
    abcJson.meta = Object.assign({}, abcJson.meta || {}, {
      chordSheetAlignment: result.chordSheetAlignment,
    })
  }

  const sections = Array.isArray(result.sections) ? result.sections : []
  const updateLyrics = opts.forceUpdateLyrics ? true : !!result.updateLyrics
  const lyricLines = updateLyrics
    ? (Array.isArray(result.lyricLines) ? result.lyricLines : getPlainLyricLines(sourceTune))
    : undefined
  const firstMeter = firstSectionMeter(sections, sourceTune.meter)

  const merge = applyBlockMergeToTune(abcJson, {
    abc: abc || tunebook.abcTools.json2abc(abcJson),
    blocks: sections,
    tunebook: tunebook,
    abcjsParser: abcjsParser,
    wipeNotation: true,
    keepEditorBlocks: true,
    chordSheetAlignment: result.chordSheetAlignment,
    defaultMeter: firstMeter,
    firstMeter: firstMeter,
    updateLyrics: updateLyrics,
    lyricLines: lyricLines,
  })

  if (!merge.ok) {
    return { ok: false, error: merge.error }
  }

  Object.keys(abcJson).forEach(function(key) {
    sourceTune[key] = abcJson[key]
  })

  if (!opts.skipSave) {
    tunebook.saveTune(abcJson, false, {
      historyLabel: opts.historyLabel
        || (updateLyrics ? 'Paste chords and lyrics' : 'Paste chords'),
      immediate: true,
    })
  }

  return {
    ok: true,
    tune: abcJson,
    updateLyrics: updateLyrics,
    lyricLines: lyricLines,
  }
}
