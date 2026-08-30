import {
  parseVoltaPasses,
  buildSoundingWrittenMap,
  soundingSegmentsToBeats,
} from './voltaRepeatExpand'
import abcjs from 'abcjs'

function isRightRepeat(token) {
  return token === ':|' || token === ':|:'
}

function isLeftRepeat(token) {
  return token === '|:' || token === ':|:'
}

function repeatTimesFromBar(ev) {
  const n = parseInt(ev && ev.repeatTimes, 10)
  return Number.isFinite(n) && n > 1 ? n : 2
}

function voltaPassesFromEvent(ev) {
  if (!ev) return null
  if (Array.isArray(ev.voltaPasses) && ev.voltaPasses.length) return ev.voltaPasses
  if (ev.volta == null) return null
  const parsed = parseVoltaPasses(ev.volta)
  return parsed.length ? parsed : null
}

/**
 * Split timed voice events into written measures with repeat/volta metadata.
 */
export function playalongMeasuresFromEvents(events) {
  const list = Array.isArray(events) ? events : []
  const measures = []
  let startBeat = 0
  let pendingVolta = null
  let pendingLeftRepeat = false
  let lastBeat = 0

  function closeMeasure(endBeat, rightRepeat, times) {
    const end = Number.isFinite(endBeat) ? endBeat : startBeat
    if (end < startBeat) return
    if (end === startBeat && measures.length > 0 && !rightRepeat && !pendingLeftRepeat) return
    measures.push({
      writtenStart: startBeat,
      writtenEnd: Math.max(end, startBeat),
      volta: pendingVolta,
      leftRepeat: pendingLeftRepeat,
      rightRepeat: !!rightRepeat,
      repeatTimes: times || 2,
    })
    startBeat = end
    pendingLeftRepeat = false
  }

  list.forEach(function(ev) {
    if (!ev) return
    if (typeof ev.startBeat === 'number' && ev.startBeat > lastBeat) lastBeat = ev.startBeat
    if (typeof ev.startBeat === 'number' && typeof ev.durationBeats === 'number') {
      const evEnd = ev.startBeat + ev.durationBeats
      if (evEnd > lastBeat) lastBeat = evEnd
    }
    if (ev.type !== 'barline') return
    const token = ev.barToken || '|'
    const beat = typeof ev.startBeat === 'number' ? ev.startBeat : lastBeat
    closeMeasure(beat, isRightRepeat(token), repeatTimesFromBar(ev))
    pendingLeftRepeat = isLeftRepeat(token)
    if (ev.volta != null) {
      const passes = voltaPassesFromEvent(ev)
      pendingVolta = passes && passes.length ? passes : pendingVolta
    } else if (ev.endEnding || token === '||' || token === '|]') {
      pendingVolta = null
    }
  })
  if (lastBeat > startBeat) closeMeasure(lastBeat, false, 2)
  return measures.filter(function(m) {
    return m.writtenEnd > m.writtenStart || m.rightRepeat || m.leftRepeat
  })
}

function playMeasure(out, measure, passIndex, soundingBeat) {
  const duration = Math.max(0, measure.writtenEnd - measure.writtenStart)
  out.push({
    soundingStart: soundingBeat,
    soundingEnd: soundingBeat + duration,
    writtenStart: measure.writtenStart,
    writtenEnd: measure.writtenEnd,
    passIndex: passIndex,
  })
  return soundingBeat + duration
}

function shouldPlayMeasure(measure, passIndex) {
  if (measure.volta == null) return true
  if (Array.isArray(measure.volta)) {
    return measure.volta.indexOf(passIndex) >= 0
  }
  return measure.volta === passIndex
}

function maxVoltaPassInMeasures(measures, from, to) {
  let max = 0
  for (let i = from; i <= to; i += 1) {
    const volta = measures[i] && measures[i].volta
    if (Array.isArray(volta)) {
      volta.forEach(function(p) { if (p > max) max = p })
    } else if (typeof volta === 'number' && volta > max) {
      max = volta
    }
  }
  return max
}

/**
 * Beat-unit sounding segments from the shared volta expander (same pickup /
 * |1,3|/|2,4| rules as MIDI and fill).
 */
export function expandPlayalongSoundingSegmentsFromVisualObj(visualObj) {
  if (!visualObj) return []
  const map = buildSoundingWrittenMap(visualObj)
  if (!map.segments || !map.segments.length) return []
  const beatLen = typeof visualObj.getBeatLength === 'function' && visualObj.getBeatLength() > 0
    ? visualObj.getBeatLength()
    : 0.25
  return soundingSegmentsToBeats(map.segments, beatLen)
}

/**
 * Expand written measures into sounding-time segments, including :| repeats
 * and 1st/2nd endings (incl. multi-number |1,3 / |2,4). passIndex is 1-based.
 *
 * Prefer expandPlayalongSoundingSegmentsFromVisualObj when a visualObj is
 * available so playalong matches MIDI pickup-once / volta passes.
 */
export function expandPlayalongSoundingSegments(events) {
  const measures = playalongMeasuresFromEvents(events)
  if (!measures.length) return []
  const out = []
  let soundingBeat = 0
  let i = 0
  while (i < measures.length) {
    let right = -1
    for (let j = i; j < measures.length; j += 1) {
      if (measures[j].rightRepeat) {
        right = j
        break
      }
    }
    if (right < 0) {
      for (let j = i; j < measures.length; j += 1) {
        soundingBeat = playMeasure(out, measures[j], 1, soundingBeat)
      }
      break
    }
    let start = i
    for (let j = right; j >= i; j -= 1) {
      if (measures[j].leftRepeat) {
        start = j
        break
      }
    }
    for (let j = i; j < start; j += 1) {
      soundingBeat = playMeasure(out, measures[j], 1, soundingBeat)
    }
    let voltaEnd = right
    for (let j = right + 1; j < measures.length; j += 1) {
      if (measures[j].volta == null) break
      voltaEnd = j
    }
    const times = Math.max(
      measures[right].repeatTimes || 2,
      maxVoltaPassInMeasures(measures, start, voltaEnd),
      2
    )
    for (let pass = 1; pass <= times; pass += 1) {
      for (let j = start; j <= right; j += 1) {
        if (!shouldPlayMeasure(measures[j], pass)) continue
        soundingBeat = playMeasure(out, measures[j], pass, soundingBeat)
      }
      for (let j = right + 1; j < measures.length; j += 1) {
        if (measures[j].volta == null) break
        if (!shouldPlayMeasure(measures[j], pass)) continue
        soundingBeat = playMeasure(out, measures[j], pass, soundingBeat)
      }
    }
    i = right + 1
    while (i < measures.length && measures[i].volta != null) i += 1
  }
  return out
}

export function soundingDurationBeats(segments) {
  if (!segments || !segments.length) return 0
  return segments[segments.length - 1].soundingEnd
}

export function mapSoundingBeatToWritten(segments, soundingBeat) {
  const list = Array.isArray(segments) ? segments : []
  for (let i = 0; i < list.length; i += 1) {
    const seg = list[i]
    if (soundingBeat < seg.soundingStart - 0.0001) continue
    if (soundingBeat > seg.soundingEnd + 0.0001) continue
    const span = Math.max(0.0001, seg.soundingEnd - seg.soundingStart)
    const frac = Math.max(0, Math.min(1, (soundingBeat - seg.soundingStart) / span))
    return {
      writtenBeat: seg.writtenStart + frac * (seg.writtenEnd - seg.writtenStart),
      passIndex: seg.passIndex || 1,
    }
  }
  return null
}

/**
 * Minimal ABC for rendering a playalong tune into a visualObj so the shared
 * volta expander can build sounding segments.
 */
export function abcTextFromPlayalongTune(tune) {
  if (!tune) return ''
  const meter = (tune && tune.meter) || '4/4'
  const noteLength = (tune && tune.noteLength) || ''
  const key = (tune && tune.key) || 'C'
  let body = ''
  if (tune.voices) {
    const keys = Object.keys(tune.voices)
    const voice = tune.voices[keys[0]]
    if (voice) {
      body = Array.isArray(voice.notes) ? voice.notes.join('\n') : String(voice.notes || '')
    }
  }
  if (!String(body).trim()) return ''
  const lines = ['X:1', 'M:' + meter]
  if (noteLength) lines.push('L:' + noteLength)
  lines.push('K:' + key)
  lines.push(body)
  return lines.join('\n')
}

/**
 * Preferred playalong map: render tune → shared sounding→written map → beats.
 */
export function expandPlayalongSoundingSegmentsFromTune(tune) {
  const abc = abcTextFromPlayalongTune(tune)
  if (!abc.trim()) return []
  try {
    const visualObj = abcjs.renderAbc('*', abc)[0]
    if (visualObj) {
      const segs = expandPlayalongSoundingSegmentsFromVisualObj(visualObj)
      if (segs.length) return segs
    }
  } catch (err) {
    // fall through to event-based expander
  }
  return null
}
