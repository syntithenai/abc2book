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
      const volta = parseInt(ev.volta, 10)
      pendingVolta = Number.isFinite(volta) && volta > 0 ? volta : pendingVolta
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
  return measure.volta === passIndex
}

/**
 * Expand written measures into sounding-time segments, including :| repeats
 * and 1st/2nd endings. passIndex is 1-based.
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
    const times = measures[right].repeatTimes || 2
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
