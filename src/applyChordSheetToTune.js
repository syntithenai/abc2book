import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import { finalizeChordSheetToTune, noteLinesHaveRealMelody } from './timedImportFinalizer'
import { setPlainLyricLines } from './wLinesUtils'
import { buildMeterMergeOptions, normalizeMeter } from './barModel'

const META_FIELD_MAP = [
  { metaKey: 'name', tuneKey: 'name' },
  { metaKey: 'title', tuneKey: 'name' },
  { metaKey: 'composer', tuneKey: 'composer' },
  { metaKey: 'key', tuneKey: 'key' },
  { metaKey: 'capo', tuneKey: 'capo' },
  { metaKey: 'tempo', tuneKey: 'tempo' },
  { metaKey: 'meter', tuneKey: 'meter' },
  { metaKey: 'time', tuneKey: 'meter' },
]

function isEmptyTuneField(value) {
  if (value == null) return true
  if (typeof value === 'string') return !value.trim()
  if (typeof value === 'number') return !Number.isFinite(value)
  return false
}

/**
 * Fill empty tune fields from chord-sheet meta. Never overwrites non-empty values.
 */
export function fillEmptyTuneFieldsFromMeta(tune, meta) {
  if (!tune || !meta || typeof meta !== 'object') return tune
  META_FIELD_MAP.forEach(function(field) {
    if (!Object.prototype.hasOwnProperty.call(meta, field.metaKey)) return
    const incoming = meta[field.metaKey]
    if (incoming == null || incoming === '') return
    if (!isEmptyTuneField(tune[field.tuneKey])) return
    tune[field.tuneKey] = incoming
  })
  return tune
}

export { buildMeterMergeOptions }

function resolveChordGridText(options) {
  const selected = options && options.selectedKeyOption
  if (selected && selected.chordGridText != null) {
    return selected.chordGridText
  }
  return options && options.chordGridText != null ? options.chordGridText : ''
}

function applySelectedMeter(tune, options) {
  const selected = options && options.selectedMeterOption
  if (selected && selected.meter) {
    tune.meter = normalizeMeter(selected.meter)
  }
}

function tuneHasTimedMedia(tune) {
  return !!(tune && (tune.timedLyrics || tune.timedChords || tune.timedMelody))
}

/**
 * Unified path for applying a chord sheet (grid + lyrics + alignment + meta)
 * onto an existing or newly created tune.
 */
export function applyChordSheetToTune(tune, options) {
  const opts = options || {}
  if (!tune) {
    throw new Error('Missing tune for chord sheet apply')
  }

  fillEmptyTuneFieldsFromMeta(tune, opts.meta)
  applySelectedMeter(tune, opts)

  const chordGridText = resolveChordGridText(opts)
  const lyricLines = opts.lyricLines
  const hasGrid = String(chordGridText || '').trim().length > 0
  const hasLyrics = Array.isArray(lyricLines) && lyricLines.length > 0

  tune.meta = Object.assign({}, tune.meta || {})
  if (opts.chordSheetAlignment !== undefined) {
    tune.meta.chordSheetAlignment = opts.chordSheetAlignment
  }
  if (opts.meta && opts.meta.chordProSource) {
    tune.meta.chordProSource = opts.meta.chordProSource
  } else if (opts.chordProSource) {
    tune.meta.chordProSource = opts.chordProSource
  }

  if (!hasGrid && !hasLyrics) {
    return tune
  }

  const tunebook = opts.tunebook
  const abcjsParser = opts.abcjsParser
  const preserveTimedMedia = !!(opts.preserveTimedMedia && tuneHasTimedMedia(tune))

  let abc = opts.abc
  if (!abc && tunebook && tunebook.abcTools) {
    abc = tunebook.abcTools.json2abc(tune)
  }

  const canFinalize = !!(tunebook && abcjsParser && abc)
  if (canFinalize) {
    const voiceKey = resolvePrimaryVoiceKey(tune.voices)
    const existingNotes = tune.voices && tune.voices[voiceKey] && tune.voices[voiceKey].notes
      ? tune.voices[voiceKey].notes
      : []
    const hasMelody = noteLinesHaveRealMelody(existingNotes)
    const useFinalize = hasMelody || tune.timingScaffold || opts.mergeMode === 'create' || opts.forceFinalize

    if (useFinalize) {
      finalizeChordSheetToTune({
        tune: tune,
        tunebook: tunebook,
        abcjsParser: abcjsParser,
        abc: abc,
        chordGridText: chordGridText,
        lyricLines: hasLyrics ? lyricLines : undefined,
        preserveTimedMedia: preserveTimedMedia,
        chordSheetAlignment: opts.chordSheetAlignment || tune.meta.chordSheetAlignment,
      })
      return tune
    }

    if (hasGrid) {
      const alignment = opts.chordSheetAlignment || tune.meta.chordSheetAlignment
      const newAbcNotes = tunebook.abcTools.justNotes(
        abcjsParser.mergeChords(chordGridText, abc, alignment)
      )
      tune.voices = Object.assign({}, tune.voices)
      tune.voices[voiceKey] = Object.assign({}, tune.voices[voiceKey] || { meta: '', notes: [] }, {
        notes: newAbcNotes.split('\n'),
      })
    }
    if (hasLyrics) {
      setPlainLyricLines(tune, lyricLines)
    }
    return tune
  }

  if (hasLyrics) {
    setPlainLyricLines(tune, lyricLines)
  }
  return tune
}
