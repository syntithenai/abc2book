import { parseVoiceEvents, beatsToDuration, createEventId } from './notation/voiceEventModel'
import { defaultNoteExtensions } from './notation/notationMarks'
import { serializeVoiceEvents } from './notation/abcVoiceSerializer'
import { parseNoteLengthDecimal, beatsPerBarFromMeter } from './notation/beatGrid'

export function tuneMeta(tune) {
  return {
    meter: (tune && tune.meter) || '4/4',
    noteLength: (tune && tune.noteLength) || '1/8',
    key: (tune && tune.key) || 'C',
  }
}

export function voiceBodyFromNotes(notes) {
  if (!Array.isArray(notes)) return String(notes || '').trim()
  return notes.join('\n').trim()
}

export function injectAbcBarNumbers(abc) {
  const raw = String(abc || '').trim()
  if (!raw) return raw
  if (/^%%barnumbers\b/m.test(raw)) return raw
  const lines = raw.split(/\r?\n/)
  const keyIndex = lines.findIndex(function(line) {
    return /^K:/.test(String(line || '').trim())
  })
  if (keyIndex >= 0) {
    const next = lines.slice()
    next.splice(keyIndex + 1, 0, '%%barnumbers 1')
    return next.join('\n')
  }
  return '%%barnumbers 1\n' + raw
}

export function splitEventsByBar(events) {
  const bars = []
  let current = []
  ;(events || []).forEach(function(ev) {
    if (!ev) return
    if (ev.type === 'lineBreak') {
      current.push(ev)
      return
    }
    current.push(ev)
    if (ev.type === 'barline') {
      bars.push(current)
      current = []
    }
  })
  if (current.length) bars.push(current)
  return bars
}

export function countVoiceBars(notes, tune) {
  const events = parseVoiceEvents(voiceBodyFromNotes(notes), tuneMeta(tune))
  return splitEventsByBar(events).length
}

function cloneEvent(ev) {
  return JSON.parse(JSON.stringify(ev))
}

function restBarEvents(tune) {
  const meta = tuneMeta(tune)
  const unit = parseNoteLengthDecimal(meta.noteLength, meta.meter)
  const beats = beatsPerBarFromMeter(meta.meter)
  return [{
    id: createEventId('rest'),
    type: 'rest',
    pitches: null,
    pitch: null,
    duration: beatsToDuration(beats, unit),
    tieStart: false,
    tieEnd: false,
    sourceToken: 'z',
    chordSymbols: [],
  }, {
    id: createEventId('bar'),
    type: 'barline',
    barToken: '|',
    duration: { num: 0, den: 1, dotted: false },
    tieStart: false,
    tieEnd: false,
    chordSymbols: [],
  }]
}

function padBarsToCount(bars, count, tune) {
  const next = bars.slice()
  while (next.length < count) {
    next.push(restBarEvents(tune))
  }
  return next
}

function barContentEvents(barEvents) {
  return (barEvents || []).filter(function(ev) {
    return ev && ev.type !== 'barline'
  })
}

function barClosingEvent(barEvents) {
  const barline = (barEvents || []).find(function(ev) { return ev && ev.type === 'barline' })
  if (barline) return cloneEvent(barline)
  return {
    id: createEventId('bar'),
    type: 'barline',
    barToken: '|',
    duration: { num: 0, den: 1, dotted: false },
    tieStart: false,
    tieEnd: false,
    chordSymbols: [],
  }
}

function mergeChordSymbols(target, source) {
  if (!target || !source) return
  const existing = Array.isArray(target.chordSymbols) ? target.chordSymbols : []
  const incoming = Array.isArray(source.chordSymbols) ? source.chordSymbols : []
  if (!incoming.length) return
  const merged = existing.slice()
  incoming.forEach(function(sym) {
    if (sym && merged.indexOf(sym) < 0) merged.push(sym)
  })
  if (merged.length) target.chordSymbols = merged
}

function isMergeableDrawable(ev) {
  return !!(ev && (ev.type === 'note' || ev.type === 'chord' || ev.type === 'rest'))
}

/** Count note/chord/rest events in one bar (excludes barlines). */
export function mergeableDrawableCount(barEvents) {
  return barContentEvents(barEvents).filter(isMergeableDrawable).length
}

function drawablePitches(ev) {
  if (!ev || ev.type === 'rest') return []
  if (ev.type === 'chord' && Array.isArray(ev.pitches)) return ev.pitches.slice()
  if (ev.type === 'note' && ev.pitch) return [ev.pitch]
  return []
}

/** Pitch count for merge highlighting (rests count as 0). */
export function drawablePitchCount(ev) {
  return drawablePitches(ev).length
}

export function mergeableDrawablesInBar(barEvents) {
  return barContentEvents(barEvents).filter(isMergeableDrawable)
}

function cloneDuration(ev) {
  if (!ev || !ev.duration) return { num: 1, den: 1, dotted: false }
  return {
    num: ev.duration.num,
    den: ev.duration.den,
    dotted: !!ev.dotted,
  }
}

/** Pair two note/rest events into one chord/note with merged pitches and chord symbols. */
export function combineDrawableEvents(existingEv, incomingEv) {
  const a = existingEv ? cloneEvent(existingEv) : null
  const b = incomingEv ? cloneEvent(incomingEv) : null
  if (!a) return b
  if (!b) return a

  const pitches = drawablePitches(a).concat(drawablePitches(b))
  const chordSymbols = []
  ;[a, b].forEach(function(ev) {
    if (!ev || !Array.isArray(ev.chordSymbols)) return
    ev.chordSymbols.forEach(function(sym) {
      if (sym && chordSymbols.indexOf(sym) < 0) chordSymbols.push(sym)
    })
  })

  if (!pitches.length) {
    const rest = cloneEvent(a.type === 'rest' ? a : b)
    rest.chordSymbols = chordSymbols
    return rest
  }

  const duration = cloneDuration(a.type !== 'rest' ? a : b)
  const type = pitches.length > 1 ? 'chord' : 'note'
  return Object.assign({}, defaultNoteExtensions(), {
    id: createEventId(type),
    type: type,
    pitches: pitches,
    pitch: pitches.length === 1 ? pitches[0] : null,
    duration: duration,
    tieStart: !!(a.tieStart || b.tieStart),
    tieEnd: !!(a.tieEnd || b.tieEnd),
    chordSymbols: chordSymbols,
    sourceToken: null,
  })
}

/** Interleave note/chord/rest content in one bar; chord symbols stay on their paired slot. */
export function mergeBarEvents(existingBarEvents, incomingBarEvents) {
  const existing = barContentEvents(existingBarEvents).filter(isMergeableDrawable).map(cloneEvent)
  const incoming = barContentEvents(incomingBarEvents).filter(isMergeableDrawable).map(cloneEvent)
  const merged = []
  const count = Math.max(existing.length, incoming.length)
  for (let i = 0; i < count; i += 1) {
    const combined = combineDrawableEvents(existing[i], incoming[i])
    if (combined) merged.push(combined)
  }
  merged.push(barClosingEvent(existingBarEvents.length ? existingBarEvents : incomingBarEvents))
  return merged
}

function flattenBarsToEvents(bars) {
  const events = []
  ;(bars || []).forEach(function(bar) {
    ;(bar || []).forEach(function(ev) {
      events.push(ev)
    })
  })
  return events
}

function makeLineBreakEvent() {
  return {
    id: createEventId('break'),
    type: 'lineBreak',
    duration: { num: 0, den: 1, dotted: false },
    tieStart: false,
    tieEnd: false,
  }
}

function stripLeadingLineBreaks(barEvents) {
  const events = (barEvents || []).map(cloneEvent)
  while (events.length && events[0].type === 'lineBreak') {
    events.shift()
  }
  return events
}

function stripTrailingLineBreaksFromBar(barEvents) {
  const events = (barEvents || []).map(cloneEvent)
  let end = events.length
  while (end > 0 && events[end - 1].type === 'lineBreak') {
    end -= 1
  }
  return events.slice(0, end)
}

/** When appending at end, ensure one visual line before incoming (not zero or two). */
function prepareIncomingForEndInsert(incomingBars) {
  if (!incomingBars.length) return incomingBars
  const incoming = incomingBars.map(function(bar) {
    return stripLeadingLineBreaks(bar)
  })
  if (incoming[0].length) {
    incoming[0].unshift(makeLineBreakEvent())
  }
  return incoming
}

function eventsToNoteLines(events, tune) {
  const body = serializeVoiceEvents(events, tuneMeta(tune))
  if (!String(body || '').trim()) return []
  const lines = body.split('\n')
  while (lines.length && !String(lines[lines.length - 1]).trim()) {
    lines.pop()
  }
  return lines
}

/** @returns {{ startBar: number, endBar: number|null }} */
export function resolveBarRange(fromBar, toBar) {
  const startBar = Math.max(1, parseInt(fromBar, 10) || 1)
  if (toBar == null || toBar === '' || toBar === false) {
    return { startBar: startBar, endBar: null }
  }
  const endParsed = parseInt(toBar, 10)
  if (Number.isNaN(endParsed) || endParsed < 1) {
    return { startBar: startBar, endBar: null }
  }
  return { startBar: startBar, endBar: Math.max(startBar, endParsed) }
}

function mergeBarPair(existingBar, incomingBar) {
  if (existingBar && incomingBar) return mergeBarEvents(existingBar, incomingBar)
  if (incomingBar) return incomingBar.map(cloneEvent)
  if (existingBar) return existingBar.map(cloneEvent)
  return []
}

function buildRangedReplace(existingBars, incomingBars, startIndex, endBar) {
  const rangeLen = endBar - startIndex
  const sourceLimited = incomingBars.slice(0, rangeLen)
  const replacedRange = []
  for (let i = 0; i < rangeLen; i += 1) {
    if (sourceLimited[i]) {
      replacedRange.push(sourceLimited[i].map(cloneEvent))
    } else if (existingBars[startIndex + i]) {
      replacedRange.push(existingBars[startIndex + i].map(cloneEvent))
    }
  }
  return existingBars.slice(0, startIndex)
    .concat(replacedRange)
    .concat(existingBars.slice(endBar))
}

function buildRangedMerge(existingBars, incomingBars, startIndex, endBar) {
  const rangeLen = endBar - startIndex
  const sourceLimited = incomingBars.slice(0, rangeLen)
  const mergedRange = []
  for (let i = 0; i < rangeLen; i += 1) {
    mergedRange.push(mergeBarPair(existingBars[startIndex + i], sourceLimited[i]))
  }
  return existingBars.slice(0, startIndex)
    .concat(mergedRange)
    .concat(existingBars.slice(endBar))
}

/**
 * Apply merge, insert, or replace at a 1-based bar index on one voice.
 * @param {'merge'|'insert'|'replace'} mode
 * @param {{ toBar?: number|string|null }} [options] - optional 1-based end bar (merge/replace only)
 */
export function applyBarOperationToVoice(existingNotes, incomingNotes, tune, fromBar, mode, options) {
  const opts = options || {}
  const range = resolveBarRange(fromBar, opts.toBar)
  const startBar = range.startBar
  const endBar = range.endBar
  const op = mode === 'insert' || mode === 'replace' ? mode : 'merge'
  const meta = tuneMeta(tune)
  const existingEvents = parseVoiceEvents(voiceBodyFromNotes(existingNotes), meta)
  const incomingEvents = parseVoiceEvents(voiceBodyFromNotes(incomingNotes), meta)
  let existingBars = splitEventsByBar(existingEvents)
  const incomingBars = splitEventsByBar(incomingEvents)
  const startIndex = startBar - 1

  if (startIndex > existingBars.length) {
    existingBars = padBarsToCount(existingBars, startIndex, tune)
  }

  let resultBars = []

  if (op === 'insert') {
    const prefix = existingBars.slice(0, startIndex)
    const suffix = existingBars.slice(startIndex)
    let incoming = incomingBars
    if (suffix.length === 0 && prefix.length > 0) {
      incoming = prepareIncomingForEndInsert(incomingBars)
      if (prefix.length) {
        const lastIdx = prefix.length - 1
        prefix[lastIdx] = stripTrailingLineBreaksFromBar(prefix[lastIdx])
      }
    }
    resultBars = prefix.concat(incoming).concat(suffix)
  } else if (op === 'replace') {
    if (endBar != null) {
      resultBars = buildRangedReplace(existingBars, incomingBars, startIndex, endBar)
    } else {
      resultBars = existingBars.slice(0, startIndex).concat(incomingBars)
    }
  } else if (endBar != null) {
    resultBars = buildRangedMerge(existingBars, incomingBars, startIndex, endBar)
  } else {
    const prefix = existingBars.slice(0, startIndex)
    const tailLen = Math.max(existingBars.length - startIndex, incomingBars.length)
    const mergedTail = []
    for (let i = 0; i < tailLen; i += 1) {
      mergedTail.push(mergeBarPair(existingBars[startIndex + i], incomingBars[i]))
    }
    resultBars = prefix.concat(mergedTail)
  }

  return eventsToNoteLines(flattenBarsToEvents(resultBars), tune)
}

export function maxVoiceBarCount(voiceNotesByKey, tune) {
  const keys = Object.keys(voiceNotesByKey || {})
  let max = 1
  keys.forEach(function(key) {
    max = Math.max(max, countVoiceBars(voiceNotesByKey[key], tune))
  })
  return max
}

/** Default inclusive end bar when applying sourceBarCount bars from fromBar. */
export function defaultEndBarForRange(fromBar, sourceBarCount, maxBar) {
  if (!sourceBarCount || sourceBarCount < 1) return null
  const start = Math.max(1, parseInt(fromBar, 10) || 1)
  const end = start + sourceBarCount - 1
  const cap = Math.max(start, parseInt(maxBar, 10) || start)
  return Math.min(end, cap)
}
