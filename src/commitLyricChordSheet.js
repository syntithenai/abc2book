import { parseChordSheetText, extractPreservedChordProLyricLines } from './chordProFormatUtils'
import { fillEmptyTuneFieldsFromMeta } from './applyChordSheetToTune'
import { setPlainLyricLines } from './wLinesUtils'
import { linesHaveChordProInlineChords, hasChordLines } from './chordSheetUtils'

/**
 * Update lyric-aligned chords only. Does not mutate ABC notation / voices.
 * Stores ChordPro source text and preserved lyric lines (inline or COW).
 *
 * @returns {{ ok: boolean, tune?: object, error?: object }}
 */
export function commitLyricChordSheetToTune(options) {
  const opts = options || {}
  const sourceTune = opts.tune
  const tunebook = opts.tunebook
  const text = String(opts.text || '')
  if (!sourceTune || !tunebook || !tunebook.abcTools) {
    return { ok: false, error: { message: 'Missing lyric chord sheet dependencies' } }
  }
  if (!text.trim()) {
    return { ok: false, error: { message: 'Chord sheet is empty' } }
  }

  let parsed
  try {
    parsed = parseChordSheetText(text, {
      fallbackTitle: sourceTune.name,
      preservePlacement: true,
    })
  } catch (e) {
    return { ok: false, error: e }
  }

  const tune = sourceTune
  tune.meta = Object.assign({}, tune.meta || {})
  tune.meta.chordProSource = parsed.chordProSource || text
  if (parsed.chordSheetAlignment !== undefined) {
    tune.meta.chordSheetAlignment = parsed.chordSheetAlignment
  }

  fillEmptyTuneFieldsFromMeta(tune, {
    title: parsed.title,
    name: parsed.title,
    composer: parsed.composer,
    key: parsed.key,
    capo: parsed.capo,
    tempo: parsed.tempo,
    meter: parsed.meter,
  })

  let lyricLines = Array.isArray(parsed.lyricLines) ? parsed.lyricLines.slice() : []
  // Prefer true ChordPro inline body when the paste was ChordPro.
  const preserved = extractPreservedChordProLyricLines(text)
  if (preserved.length && linesHaveChordProInlineChords(preserved)) {
    lyricLines = preserved
  } else if (!lyricLines.length && preserved.length) {
    lyricLines = preserved
  }

  if (!lyricLines.length && !hasChordLines(lyricLines)) {
    return { ok: false, error: { message: 'No lyrics or chords found in chord sheet' } }
  }

  setPlainLyricLines(tune, lyricLines)

  if (!opts.skipSave) {
    tunebook.saveTune(tune, false, {
      historyLabel: opts.historyLabel || 'Edit lyric chord sheet',
      immediate: true,
    })
  }

  return { ok: true, tune: tune, parsed: parsed }
}
