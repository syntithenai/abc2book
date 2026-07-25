import { getTuneVoiceKeys } from './abcVoiceViewSettings'
import { parseVoiceEvents, beatsToDuration } from './notation/voiceEventModel'
import { serializeVoiceEvents } from './notation/abcVoiceSerializer'
import { parseNoteLengthDecimal } from './notation/beatGrid'
import {
  applyBarOperationToVoice,
  drawablePitchCount,
  mergeableDrawableCount,
  mergeableDrawablesInBar,
  resolveBarRange,
  splitEventsByBar,
  tuneMeta,
  voiceBodyFromNotes,
} from './scratchpadNotationBarUtils'
import {
  injectInlineHeadersAtBar,
  scratchpadInlineHeaderTokens,
} from './scratchpadNotationInlineHeaders'

export { tuneMeta, voiceBodyFromNotes, countVoiceBars, injectAbcBarNumbers, maxVoiceBarCount, defaultEndBarForRange } from './scratchpadNotationBarUtils'

export const NEW_VOICE_TARGET = '__new__'
export const SKIP_VOICE_TARGET = '__skip__'

function cloneNotes(notes) {
  if (!Array.isArray(notes)) return []
  return notes.map(function(line) { return String(line || '') })
}

export function measureVoiceBeats(notes, tune) {
  const meta = tuneMeta(tune)
  const events = parseVoiceEvents(voiceBodyFromNotes(notes), meta)
  let total = 0
  events.forEach(function(ev) {
    if (!ev || ev.type === 'barline' || ev.type === 'lineBreak') return
    total += ev.durationBeats || 0
  })
  return total
}

function restTokenForBeats(beats, tune) {
  if (!(beats > 0.001)) return ''
  const meta = tuneMeta(tune)
  const duration = beatsToDuration(beats, parseNoteLengthDecimal(meta.noteLength, meta.meter))
  return serializeVoiceEvents([{
    id: 'rest-pad',
    type: 'rest',
    duration: duration,
    tieStart: false,
    tieEnd: false,
  }], meta).trim()
}

/** Pad one voice with rests so its length reaches targetBeats. */
export function padVoiceNotesToBeats(notes, targetBeats, tune) {
  const lines = cloneNotes(notes)
  const current = measureVoiceBeats(lines, tune)
  if (targetBeats <= current + 0.001) return lines
  const padToken = restTokenForBeats(targetBeats - current, tune)
  if (!padToken) return lines
  if (!lines.length) lines.push('')
  const lastIdx = lines.length - 1
  lines[lastIdx] = (lines[lastIdx] + ' ' + padToken).trim()
  return lines
}

/** Pad every voice in the map to the longest voice length. */
export function equalizeVoiceNoteLengths(voiceNotesByKey, tune) {
  const keys = Object.keys(voiceNotesByKey || {})
  if (!keys.length) return voiceNotesByKey
  let maxBeats = 0
  keys.forEach(function(key) {
    maxBeats = Math.max(maxBeats, measureVoiceBeats(voiceNotesByKey[key], tune))
  })
  const out = {}
  keys.forEach(function(key) {
    out[key] = padVoiceNotesToBeats(voiceNotesByKey[key], maxBeats, tune)
  })
  return out
}

export function appendVoiceNoteLines(existingNotes, incomingNotes) {
  const existing = cloneNotes(existingNotes)
  const incoming = cloneNotes(incomingNotes)
  if (!incoming.length) return existing
  if (!existing.length) return incoming
  const merged = existing.slice()
  const firstIncoming = incoming.shift()
  const lastIdx = merged.length - 1
  merged[lastIdx] = (merged[lastIdx] + ' ' + firstIncoming).trim()
  incoming.forEach(function(line) {
    merged.push(line)
  })
  return merged
}

export function nextVoiceKey(voices) {
  const keys = Object.keys(voices || {})
  let maxNum = 0
  keys.forEach(function(key) {
    const n = parseInt(key, 10)
    if (!Number.isNaN(n) && n > maxNum) maxNum = n
  })
  return String(maxNum + 1)
}

export function needsVoiceMapping(sourceTune, targetTune) {
  const sourceKeys = getTuneVoiceKeys(sourceTune)
  const targetKeys = getTuneVoiceKeys(targetTune)
  return sourceKeys.length > 1 || targetKeys.length > 1
}

/** Default map: pair by sorted index; extra scratchpad voices become new voices. */
export function buildDefaultVoiceMapping(sourceTune, targetTune) {
  const sourceKeys = getTuneVoiceKeys(sourceTune)
  const targetKeys = getTuneVoiceKeys(targetTune)
  const mapping = {}
  sourceKeys.forEach(function(srcKey, index) {
    if (targetKeys.length === 1 && index === 0) {
      mapping[srcKey] = targetKeys[0]
    } else if (index < targetKeys.length) {
      mapping[srcKey] = targetKeys[index]
    } else {
      mapping[srcKey] = NEW_VOICE_TARGET
    }
  })
  return mapping
}

function copyVoiceMeta(sourceVoice, targetVoice) {
  const voice = Object.assign({}, targetVoice || {})
  if (sourceVoice && sourceVoice.meta != null && (voice.meta == null || voice.meta === '')) {
    voice.meta = sourceVoice.meta
  }
  return voice
}

function normalizeMergeMode(mode) {
  if (mode === 'replace') return 'replace'
  if (mode === 'insert') return 'insert'
  if (mode === 'append') return 'merge'
  return 'merge'
}

/**
 * Merge scratchpad notation into a tune copy.
 * options: {
 *   mode: 'merge'|'insert'|'replace'|'append',
 *   fromBar: number (1-based),
 *   toBar: number|null (1-based inclusive end; merge/replace only),
 *   voiceMapping: { srcKey: targetKey|__new__|__skip__ }
 * }
 */
export function applyScratchpadNotationMerge(targetTune, sourceTune, options) {
  const opts = options || {}
  const mode = normalizeMergeMode(opts.mode)
  const fromBar = Math.max(1, parseInt(opts.fromBar, 10) || 1)
  const toBar = opts.toBar
  if (!targetTune) return targetTune
  if (!sourceTune || !sourceTune.voices) {
    return JSON.parse(JSON.stringify(targetTune))
  }

  const next = JSON.parse(JSON.stringify(targetTune))
  const sourceKeys = getTuneVoiceKeys(sourceTune)
  if (!sourceKeys.length) return next

  const mapping = opts.voiceMapping || buildDefaultVoiceMapping(sourceTune, next)
  const inlineHeaderTokens = scratchpadInlineHeaderTokens(sourceTune, next)
  const voices = Object.assign({}, next.voices || {})
  const working = {}

  getTuneVoiceKeys(next).forEach(function(key) {
    const voice = voices[key] || { notes: [], meta: {} }
    working[key] = cloneNotes(voice.notes)
  })

  sourceKeys.forEach(function(srcKey) {
    const mapTo = mapping[srcKey]
    if (!mapTo || mapTo === SKIP_VOICE_TARGET) return
    const srcVoice = sourceTune.voices[srcKey] || { notes: [], meta: {} }
    const srcNotes = cloneNotes(srcVoice.notes)
    if (!srcNotes.length && !voiceBodyFromNotes(srcNotes)) return

    let destKey = mapTo
    if (mapTo === NEW_VOICE_TARGET) {
      destKey = nextVoiceKey(voices)
      voices[destKey] = { notes: [], meta: srcVoice.meta || '' }
      working[destKey] = []
    }

    if (mode === 'replace' && fromBar === 1 && toBar == null && !voiceBodyFromNotes(working[destKey] || [])) {
      working[destKey] = srcNotes
    } else {
      working[destKey] = applyBarOperationToVoice(
        working[destKey] || [],
        srcNotes,
        next,
        fromBar,
        mode,
        { toBar: toBar }
      )
    }
    if (inlineHeaderTokens.length) {
      working[destKey] = injectInlineHeadersAtBar(working[destKey], inlineHeaderTokens, fromBar)
    }
    voices[destKey] = copyVoiceMeta(srcVoice, voices[destKey])
  })

  Object.keys(working).forEach(function(key) {
    if (!voices[key]) voices[key] = { notes: [], meta: {} }
    voices[key].notes = working[key]
  })

  next.voices = voices
  if (sourceTune.key && !next.key) next.key = sourceTune.key
  if (sourceTune.meter && !next.meter) next.meter = sourceTune.meter
  if (sourceTune.noteLength && !next.noteLength) next.noteLength = sourceTune.noteLength
  return next
}

function mergeRangeLength(existingBars, incomingBars, startIndex, endBar) {
  if (endBar != null) return endBar - startIndex
  return Math.max(existingBars.length - startIndex, incomingBars.length)
}

/**
 * Find bars where tune and scratchpad note counts differ during merge, and
 * preview slots for highlighting scratchpad pitches (green) or unpaired scratchpad
 * notes (red). Target pitches are left unstyled.
 */
export function analyzeMergeNoteMismatches(targetTune, sourceTune, options) {
  const opts = options || {}
  if (normalizeMergeMode(opts.mode) !== 'merge') {
    return { affectedBars: [], sourceHighlights: [], unpairedSourceHighlights: [] }
  }
  if (!targetTune || !sourceTune || !sourceTune.voices) {
    return { affectedBars: [], sourceHighlights: [], unpairedSourceHighlights: [] }
  }

  const fromBar = Math.max(1, parseInt(opts.fromBar, 10) || 1)
  const range = resolveBarRange(fromBar, opts.toBar)
  const startIndex = range.startBar - 1
  const endBar = range.endBar
  const meta = tuneMeta(targetTune)
  const mapping = opts.voiceMapping || buildDefaultVoiceMapping(sourceTune, targetTune)
  const affectedBarSet = {}
  const sourceHighlights = []
  const unpairedSourceHighlights = []
  const simulatedVoices = Object.assign({}, targetTune.voices || {})

  getTuneVoiceKeys(sourceTune).forEach(function(srcKey) {
    const mapTo = mapping[srcKey]
    if (!mapTo || mapTo === SKIP_VOICE_TARGET) return

    let destKey = mapTo
    if (mapTo === NEW_VOICE_TARGET) {
      destKey = nextVoiceKey(simulatedVoices)
      simulatedVoices[destKey] = { notes: [] }
    }

    const srcVoice = sourceTune.voices[srcKey] || { notes: [] }
    const destVoice = simulatedVoices[destKey] || { notes: [] }
    const existingBars = splitEventsByBar(
      parseVoiceEvents(voiceBodyFromNotes(destVoice.notes), meta)
    )
    const incomingBars = splitEventsByBar(
      parseVoiceEvents(voiceBodyFromNotes(srcVoice.notes), meta)
    )
    const rangeLen = mergeRangeLength(existingBars, incomingBars, startIndex, endBar)

    for (let i = 0; i < rangeLen; i += 1) {
      const existingDrawables = mergeableDrawablesInBar(existingBars[startIndex + i])
      const incomingDrawables = mergeableDrawablesInBar(incomingBars[i])
      const barNumber = range.startBar + i
      if (existingDrawables.length !== incomingDrawables.length) {
        affectedBarSet[barNumber] = true
      }
      const slotCount = Math.max(existingDrawables.length, incomingDrawables.length)
      for (let slotIndex = 0; slotIndex < slotCount; slotIndex += 1) {
        const existingEv = existingDrawables[slotIndex]
        const incomingEv = incomingDrawables[slotIndex]
        const targetPitchCount = drawablePitchCount(existingEv)
        const sourcePitchCount = drawablePitchCount(incomingEv)
        const slot = {
          voiceKey: destKey,
          barNumber: barNumber,
          slotIndex: slotIndex,
          targetPitchCount: targetPitchCount,
          sourcePitchCount: sourcePitchCount,
        }
        if (existingEv && incomingEv) {
          if (sourcePitchCount > 0) sourceHighlights.push(slot)
          continue
        }
        if (incomingEv && sourcePitchCount > 0) {
          unpairedSourceHighlights.push(slot)
        }
      }
    }
  })

  const affectedBars = Object.keys(affectedBarSet).map(function(key) {
    return parseInt(key, 10)
  }).sort(function(a, b) { return a - b })

  return {
    affectedBars: affectedBars,
    sourceHighlights: sourceHighlights,
    unpairedSourceHighlights: unpairedSourceHighlights,
  }
}
