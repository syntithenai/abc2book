import { resolvePrimaryVoiceKey } from './abcVoiceUtils'
import {
  clearTransientTimedFields,
  finalizeChordSheetToTune,
  noteLinesHaveRealMelody,
} from './timedImportFinalizer'
import { setPlainLyricLines, setNoteAlignedLyricLines, getPlainLyricLines } from './wLinesUtils'
import { buildNotationWLines } from './noteSpacingUtils'
import { buildMeterMergeOptions, normalizeMeter } from './barModel'
import { applyBlockMergeToTune, invalidateChordBlockCache } from './chordBlockMerge'

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

  let abc = opts.abc
  if (!abc && tunebook && tunebook.abcTools) {
    abc = tunebook.abcTools.json2abc(tune)
  }

  const canFinalize = !!(tunebook && abcjsParser && abc)
  if (canFinalize) {
    if (opts.useBlockMerge && Array.isArray(opts.blocks)) {
      const result = applyBlockMergeToTune(tune, {
        abc: abc,
        blocks: opts.blocks,
        tunebook: tunebook,
        abcjsParser: abcjsParser,
        wipeNotation: !!opts.wipeNotation,
        chordSheetAlignment: opts.chordSheetAlignment || tune.meta.chordSheetAlignment,
        defaultMeter: tune.meter,
        firstMeter: opts.selectedMeterOption && opts.selectedMeterOption.meter,
        updateLyrics: hasLyrics,
        lyricLines: hasLyrics ? lyricLines : undefined,
      })
      if (!result.ok) {
        const err = new Error(result.error && result.error.message ? result.error.message : 'Block merge failed')
        err.mergeFailure = result.error
        throw err
      }
      return tune
    }

    const voiceKey = resolvePrimaryVoiceKey(tune.voices)
    const existingNotes = tune.voices && tune.voices[voiceKey] && tune.voices[voiceKey].notes
      ? tune.voices[voiceKey].notes
      : []
    const hasMelody = noteLinesHaveRealMelody(existingNotes)
    const useFinalize = hasMelody
      || tune.timingScaffold
      || opts.mergeMode === 'create'
      || opts.forceFinalize
      || opts.wipeNotation

    if (useFinalize) {
      let abcForMerge = abc
      if (opts.wipeNotation) {
        const meter = normalizeMeter(
          (opts.selectedMeterOption && opts.selectedMeterOption.meter) || tune.meter || '4/4'
        )
        abcForMerge = [
          'X:1',
          'T:',
          'M:' + meter,
          'L:' + (tune.noteLength || '1/8'),
          'K:' + (tune.key || 'C'),
          'z |',
        ].join('\n')
      }
      finalizeChordSheetToTune({
        tune: tune,
        tunebook: tunebook,
        abcjsParser: abcjsParser,
        abc: abcForMerge,
        chordGridText: chordGridText,
        lyricLines: hasLyrics ? lyricLines : undefined,
        chordSheetAlignment: opts.chordSheetAlignment || tune.meta.chordSheetAlignment,
      })
      if (hasLyrics && getPlainLyricLines(tune).length > 0) {
        const spaced = buildNotationWLines(tune)
        if (spaced.some(function(line) { return String(line || '').trim().length > 0 })) {
          setNoteAlignedLyricLines(tune, spaced)
        }
      }
      invalidateChordBlockCache(tune)
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
      invalidateChordBlockCache(tune)
    }
    if (hasLyrics) {
      setPlainLyricLines(tune, lyricLines)
    }
    clearTransientTimedFields(tune)
    return tune
  }

  if (hasLyrics) {
    setPlainLyricLines(tune, lyricLines)
  }
  return tune
}
