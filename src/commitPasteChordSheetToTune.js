import { fillEmptyTuneFieldsFromMeta } from './applyChordSheetToTune'
import { applyBlockMergeToTune } from './chordBlockMerge'
import { firstSectionMeter } from './chordsEditorSections'
import { getPlainLyricLines } from './wLinesUtils'

/**
 * Apply a PasteChordSheetModal result onto a tune (wipe notation + optional lyrics).
 * Mutates and saves via tunebook.saveTune.
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
  if (!result || !tunebook || !tunebook.abcTools || !abcjsParser || !sourceTune) {
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

  // Copy merged fields onto the live tune object when it is the same reference path.
  Object.keys(abcJson).forEach(function(key) {
    sourceTune[key] = abcJson[key]
  })

  tunebook.saveTune(abcJson, false, {
    historyLabel: opts.historyLabel
      || (updateLyrics ? 'Paste chords and lyrics' : 'Paste chords'),
    immediate: true,
  })

  return {
    ok: true,
    tune: abcJson,
    updateLyrics: updateLyrics,
    lyricLines: lyricLines,
  }
}
