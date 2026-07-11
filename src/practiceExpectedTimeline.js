import { eventsFromVoiceBody } from './notation/voiceEventTiming'
import { parseNoteLengthDecimal, beatsPerBarFromMeter } from './notation/beatGrid'
import { eventMidiPitch } from './notation/voiceEventModel'

const HEADER_KEYS = ['X', 'T', 'M', 'L', 'Q', 'K']

export function parseWarmupAbcHeaders(abc) {
  const text = String(abc || '')
  const lines = text.split('\n')
  const headers = {}
  const bodyLines = []
  let pastKey = false
  lines.forEach(function(line) {
    const trimmed = line.trim()
    if (!pastKey) {
      const match = trimmed.match(/^([A-Za-z]):(.*)$/)
      if (match) {
        const key = match[1].toUpperCase()
        if (HEADER_KEYS.indexOf(key) !== -1) {
          headers[key] = match[2].trim()
          if (key === 'K') pastKey = true
          return
        }
      }
      if (pastKey) bodyLines.push(line)
    } else {
      bodyLines.push(line)
    }
  })
  return {
    headers: headers,
    body: bodyLines.join('\n').replace(/\|]\s*$/, '').trim(),
  }
}

export function parseTempoBpm(qField) {
  const q = String(qField || '1/4=90')
  const eq = q.indexOf('=')
  if (eq === -1) return 90
  const bpm = parseFloat(q.slice(eq + 1))
  return Number.isFinite(bpm) && bpm > 0 ? bpm : 90
}

export function beatUnitFromQ(qField) {
  const q = String(qField || '1/4=90')
  const eq = q.indexOf('=')
  const notePart = eq === -1 ? '1/4' : q.slice(0, eq).trim()
  const parts = notePart.split('/')
  if (parts.length === 2 && parts[1] !== '0') {
    return parseFloat(parts[0]) / parseFloat(parts[1])
  }
  return 0.25
}

export function beatToMs(startBeat, tempoBpm, beatUnitDecimal) {
  const bpm = tempoBpm > 0 ? tempoBpm : 90
  const unit = beatUnitDecimal > 0 ? beatUnitDecimal : 0.25
  const secondsPerBeat = (60 / bpm) * (unit / 0.25)
  return startBeat * secondsPerBeat * 1000
}

export function buildTuneMetaFromHeaders(headers) {
  const meter = headers.M || '4/4'
  const noteLength = headers.L || ''
  return {
    meter: meter,
    noteLength: noteLength,
    key: headers.K || 'C',
    tempoBpm: parseTempoBpm(headers.Q),
    beatUnit: beatUnitFromQ(headers.Q),
  }
}

export function noteEventsFromWarmupAbc(abc) {
  const parsed = parseWarmupAbcHeaders(abc)
  const tuneMeta = buildTuneMetaFromHeaders(parsed.headers)
  const events = eventsFromVoiceBody(parsed.body, tuneMeta)
  const notes = []
  events.forEach(function(ev) {
    if (ev.type === 'rest' || ev.type === 'barline' || ev.type === 'lineBreak') return
    const midi = eventMidiPitch(ev)
    if (midi == null) return
    const startBeat = typeof ev.startBeat === 'number' ? ev.startBeat : 0
    const durationBeats = typeof ev.durationBeats === 'number' ? ev.durationBeats : 0
    notes.push({
      midi: midi,
      startBeat: startBeat,
      endBeat: startBeat + durationBeats,
      durationBeats: durationBeats,
    })
  })
  return {
    notes: notes,
    tuneMeta: tuneMeta,
    patternDurationBeats: notes.length
      ? Math.max.apply(null, notes.map(function(n) { return n.endBeat }))
      : 0,
  }
}

export function expandTimelineForRep(timeline, repIndex, gapBeats) {
  const rep = Math.max(0, parseInt(repIndex, 10) || 0)
  const gap = Math.max(0, parseFloat(gapBeats) || 0)
  const patternDuration = timeline.patternDurationBeats || 0
  const offsetBeats = rep * (patternDuration + gap)
  const tuneMeta = timeline.tuneMeta
  return timeline.notes.map(function(note) {
    return Object.assign({}, note, {
      startBeat: note.startBeat + offsetBeats,
      endBeat: note.endBeat + offsetBeats,
      repIndex: rep,
    })
  })
}

export function noteWindowsFromTimeline(notes, tuneMeta, musicStartMs) {
  const startMs = musicStartMs || 0
  const bpm = tuneMeta.tempoBpm || 90
  const beatUnit = tuneMeta.beatUnit || 0.25
  return notes.map(function(note) {
    return {
      midi: note.midi,
      startBeat: note.startBeat,
      endBeat: note.endBeat,
      startMs: startMs + beatToMs(note.startBeat, bpm, beatUnit),
      endMs: startMs + beatToMs(note.endBeat, bpm, beatUnit),
      repIndex: note.repIndex,
    }
  })
}

export function msPerNotationBeat(tuneMeta) {
  const meta = tuneMeta || {}
  return beatToMs(1, meta.tempoBpm || 90, meta.beatUnit || 0.25)
}

export function notationBeatFromAudioSeconds(audioSeconds, tuneMeta, repIndex, patternDurationBeats, gapBeats) {
  const msPerBeat = msPerNotationBeat(tuneMeta)
  if (!(msPerBeat > 0)) return 0
  const beatInRep = (Math.max(0, parseFloat(audioSeconds) || 0) * 1000) / msPerBeat
  const rep = Math.max(0, parseInt(repIndex, 10) || 0)
  const gap = Math.max(0, parseFloat(gapBeats) || 0)
  const pattern = Math.max(0, parseFloat(patternDurationBeats) || 0)
  return rep * (pattern + gap) + beatInRep
}

export function expectedNoteAtBeat(notes, currentBeat) {
  if (!notes || !notes.length) return null
  const beat = typeof currentBeat === 'number' ? currentBeat : 0
  for (let i = 0; i < notes.length; i += 1) {
    const n = notes[i]
    if (beat >= n.startBeat && beat < n.endBeat) return n
  }
  return null
}

export function patternBeatsPerBar(meter) {
  return beatsPerBarFromMeter(meter || '4/4')
}

export { parseNoteLengthDecimal }
