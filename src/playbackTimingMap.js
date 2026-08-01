import { defaultAbcBeatLengthForMeter, computeRhythmGridTempo } from './playbackStateLogic'
import { getBarModel } from './barModel'
import {
  meterTextFromAbcMeterElement,
  rhythmFromAbcMeterElement,
  rhythmFromTimeSignature,
} from './metronomeRhythmPresets'

function interpretTempoQpm(element, beatLength) {
  let duration = 0.25
  if (element && element.duration) {
    duration = Array.isArray(element.duration) ? element.duration[0] : element.duration
  }
  let bpm = 60
  if (element && element.bpm) {
    bpm = parseFloat(element.bpm) || 60
  } else if (element && element.qpm) {
    return parseFloat(element.qpm) || 60
  }
  const beatLen = beatLength > 0 ? beatLength : 0.25
  return duration * bpm / beatLen
}

function noteLengthTextFromBeatLength(beatLength) {
  const len = parseFloat(beatLength) || 0.125
  if (Math.abs(len - 0.25) < 0.0001) return '1/4'
  if (Math.abs(len - 0.125) < 0.0001) return '1/8'
  if (Math.abs(len - 0.5) < 0.0001) return '1/2'
  if (Math.abs(len - 1) < 0.0001) return '1'
  const den = Math.round(1 / len)
  return den > 0 ? '1/' + den : '1/8'
}

export function msPerMeasureForSection(qpm, meterText, beatLength) {
  const bpm = parseFloat(qpm) || 0
  const meter = String(meterText || '4/4').trim() || '4/4'
  const beatLen = beatLength > 0 ? beatLength : defaultAbcBeatLengthForMeter(meter)
  const model = getBarModel(meter, noteLengthTextFromBeatLength(beatLen))
  if (!(bpm > 0) || !(model.unitSlotsPerBar > 0)) return 0
  const msPerAbcUnit = (60000 / bpm) * (beatLen / 0.25)
  return model.unitSlotsPerBar * msPerAbcUnit
}

export function rhythmBeatBpmForSection(qpm, meterText, beatLength) {
  const rhythm = rhythmFromTimeSignature(meterText)
  const msPerMeasure = msPerMeasureForSection(qpm, meterText, beatLength)
  return computeRhythmGridTempo({
    rhythmBeatsPerBar: rhythm.beatsPerBar,
    millisecondsPerMeasure: msPerMeasure,
    tempoFactor: 1,
    fallbackQpm: parseFloat(qpm) || 120,
  })
}

/**
 * QPM implied by abcjs measure duration (matches CreateSynth / count-in).
 * Prefer this over getBpm() when they disagree — getBpm() can drift from the
 * audible millisecondsPerMeasure used by the synth.
 */
export function qpmFromVisualMilliseconds(visualObj, meterText, beatLength) {
  if (!visualObj || typeof visualObj.millisecondsPerMeasure !== 'function') return 0
  const ms = parseFloat(visualObj.millisecondsPerMeasure()) || 0
  if (!(ms > 0)) return 0
  const meter = String(meterText || '4/4').trim() || '4/4'
  const beatLen = beatLength > 0
    ? beatLength
    : defaultAbcBeatLengthForMeter(meter)
  const model = getBarModel(meter, noteLengthTextFromBeatLength(beatLen))
  if (!(model.unitSlotsPerBar > 0)) return 0
  const msPerAbcUnit = ms / model.unitSlotsPerBar
  if (!(msPerAbcUnit > 0)) return 0
  return (60000 * (beatLen / 0.25)) / msPerAbcUnit
}

function pushUniqueSorted(breaks, entry, key) {
  const probe = entry[key]
  const existing = breaks.find(function(item) { return item[key] === probe })
  if (existing) {
    existing.qpm = entry.qpm != null ? entry.qpm : existing.qpm
    existing.meterText = entry.meterText || existing.meterText
    existing.rhythm = entry.rhythm || existing.rhythm
    return
  }
  breaks.push(entry)
  breaks.sort(function(a, b) { return a[key] - b[key] })
}

function isDurationElement(elem) {
  if (!elem) return false
  if (elem.el_type === 'note' || elem.el_type === 'rest') return true
  if (elem.duration != null && (elem.pitches || elem.rest)) return true
  return false
}

function elementDuration(elem) {
  if (!elem || elem.duration == null) return 0
  if (Array.isArray(elem.duration)) return parseFloat(elem.duration[0]) || 0
  return parseFloat(elem.duration) || 0
}

function walkVoiceTimingEvents(visualObj, options) {
  const opts = options || {}
  const tempoBreaks = []
  const meterBreaks = []
  let beatLength = visualObj && typeof visualObj.getBeatLength === 'function'
    ? parseFloat(visualObj.getBeatLength()) || 0
    : 0
  let startingQpm = visualObj && typeof visualObj.getBpm === 'function'
    ? parseFloat(visualObj.getBpm()) || 0
    : 0
  if (!(startingQpm > 0) && visualObj && visualObj.metaText && visualObj.metaText.tempo) {
    const tempoMeta = visualObj.metaText.tempo
    if (tempoMeta.bpm) startingQpm = interpretTempoQpm(tempoMeta, beatLength)
  }
  if (!(startingQpm > 0)) startingQpm = 120

  let startingMeter = '4/4'
  if (visualObj && typeof visualObj.getMeterFraction === 'function') {
    const mf = visualObj.getMeterFraction()
    if (mf && mf.num && mf.den) {
      startingMeter = mf.num + '/' + mf.den
    }
  }
  if (!(beatLength > 0)) {
    beatLength = defaultAbcBeatLengthForMeter(startingMeter)
  }

  // Align map tempo with synth/count-in measure duration when getBpm drifts.
  const msOverride = parseFloat(opts.millisecondsPerMeasureOverride) || 0
  const qpmFromMs = msOverride > 0
    ? qpmFromVisualMilliseconds(
      { millisecondsPerMeasure: function() { return msOverride } },
      startingMeter,
      beatLength
    )
    : qpmFromVisualMilliseconds(visualObj, startingMeter, beatLength)
  if (qpmFromMs > 0 && (
    !(startingQpm > 0) || Math.abs(startingQpm - qpmFromMs) > 0.5
  )) {
    startingQpm = qpmFromMs
  }

  let durationCounter = 0
  let currentQpm = startingQpm
  let currentMeter = startingMeter
  let tempoMultiplier = 1
  const startingTempo = startingQpm

  function recordTempo(abcTime) {
    pushUniqueSorted(tempoBreaks, {
      abcTime: abcTime,
      musicSeconds: 0,
      qpm: currentQpm,
    }, 'abcTime')
  }

  function recordMeter(abcTime, meterElement) {
    pushUniqueSorted(meterBreaks, {
      abcTime: abcTime,
      musicSeconds: 0,
      meterText: currentMeter,
      rhythm: meterElement
        ? rhythmFromAbcMeterElement(meterElement)
        : rhythmFromTimeSignature(currentMeter),
    }, 'abcTime')
  }

  recordTempo(0)
  recordMeter(0)

  const lines = visualObj && visualObj.lines ? visualObj.lines : []
  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex]
    if (!line || !line.staff) continue
    const staff = line.staff[0]
    if (!staff || !staff.voices || !staff.voices[0]) continue
    const voice = staff.voices[0]
    for (let i = 0; i < voice.length; i++) {
      const elem = voice[i]
      if (!elem) continue
      if (elem.el_type === 'tempo') {
        currentQpm = interpretTempoQpm(elem, beatLength)
        tempoMultiplier = startingTempo > 0 && currentQpm > 0
          ? startingTempo / currentQpm
          : 1
        recordTempo(durationCounter)
        continue
      }
      if (elem.el_type === 'timeSignature' || elem.el_type === 'meter') {
        const meterText = meterTextFromAbcMeterElement(elem)
        if (meterText) {
          currentMeter = meterText
          recordMeter(durationCounter, elem)
        }
        continue
      }
      if (isDurationElement(elem)) {
        durationCounter += elementDuration(elem) * tempoMultiplier
      }
    }
  }

  return {
    tempoBreaks: tempoBreaks,
    meterBreaks: meterBreaks,
    beatLength: beatLength,
    startingQpm: startingQpm,
    startingMeter: startingMeter,
    totalAbcTime: durationCounter,
  }
}

function abcTimeToMusicSeconds(map, abcTime) {
  const beatLength = map.beatLength
  const startingQpm = map.startingQpm
  let musicSeconds = 0
  let cursorAbc = 0
  let cursorQpm = startingQpm
  const merged = []
  map.tempoBreaks.forEach(function(item) { merged.push({ abcTime: item.abcTime, qpm: item.qpm }) })
  merged.sort(function(a, b) { return a.abcTime - b.abcTime })
  for (let i = 0; i < merged.length; i++) {
    const point = merged[i]
    const nextAbc = i + 1 < merged.length ? merged[i + 1].abcTime : abcTime
    const spanEnd = Math.min(abcTime, nextAbc)
    if (spanEnd <= cursorAbc) {
      cursorQpm = point.qpm || cursorQpm
      continue
    }
    const span = spanEnd - cursorAbc
    const msPerAbcUnit = (60000 / (cursorQpm || startingQpm)) * (beatLength / 0.25)
    musicSeconds += span * msPerAbcUnit / 1000
    cursorAbc = spanEnd
    cursorQpm = point.qpm || cursorQpm
  }
  return musicSeconds
}

function finalizeMapTimes(map, bufferDuration) {
  map.tempoBreaks.forEach(function(item) {
    item.musicSeconds = abcTimeToMusicSeconds(map, item.abcTime)
    item.rhythmBeatBpm = rhythmBeatBpmForSection(item.qpm, map.startingMeter, map.beatLength)
  })
  map.meterBreaks.forEach(function(item) {
    item.musicSeconds = abcTimeToMusicSeconds(map, item.abcTime)
    item.rhythm = rhythmFromTimeSignature(item.meterText)
    const qpm = sampleQpmAtAbcTime(map, item.abcTime)
    item.rhythmBeatBpm = rhythmBeatBpmForSection(qpm, item.meterText, map.beatLength)
  })

  const tempoWithBpm = map.tempoBreaks.map(function(item) {
    const meter = sampleMeterAtAbcTime(map, item.abcTime)
    return Object.assign({}, item, {
      rhythmBeatBpm: rhythmBeatBpmForSection(item.qpm, meter.meterText, map.beatLength),
    })
  })
  map.tempoBreaks = tempoWithBpm

  const totalMusicSeconds = abcTimeToMusicSeconds(map, map.totalAbcTime)
  map.totalMusicSeconds = totalMusicSeconds
  const bufferDur = parseFloat(bufferDuration)
  if (bufferDur > 0 && totalMusicSeconds > 0 && Math.abs(bufferDur - totalMusicSeconds) > 0.05) {
    map.scale = bufferDur / totalMusicSeconds
  } else {
    map.scale = 1
  }
  if (map.scale !== 1) {
    map.tempoBreaks.forEach(function(item) { item.musicSeconds *= map.scale })
    map.meterBreaks.forEach(function(item) { item.musicSeconds *= map.scale })
    map.totalMusicSeconds *= map.scale
  }
  return map
}

function sampleQpmAtAbcTime(map, abcTime) {
  let current = map.startingQpm
  for (let i = 0; i < map.tempoBreaks.length; i++) {
    if (map.tempoBreaks[i].abcTime <= abcTime) {
      current = map.tempoBreaks[i].qpm
    } else {
      break
    }
  }
  return current
}

function sampleMeterAtAbcTime(map, abcTime) {
  let current = {
    meterText: map.startingMeter,
    rhythm: rhythmFromTimeSignature(map.startingMeter),
  }
  for (let i = 0; i < map.meterBreaks.length; i++) {
    if (map.meterBreaks[i].abcTime <= abcTime) {
      current = map.meterBreaks[i]
    } else {
      break
    }
  }
  return current
}

export function buildPlaybackTimingMap(visualObj, options) {
  const opts = options || {}
  if (!visualObj) return null
  const walked = walkVoiceTimingEvents(visualObj, opts)
  return finalizeMapTimes(walked, opts.bufferDuration)
}

export function timingAtMusicSeconds(map, musicSeconds) {
  if (!map) {
    return {
      meterText: '4/4',
      rhythm: rhythmFromTimeSignature('4/4'),
      qpm: 120,
      rhythmBeatBpm: 120,
    }
  }
  const secs = Math.max(0, parseFloat(musicSeconds) || 0)
  const meter = sampleMeterAtMusicSeconds(map, secs)
  const qpm = sampleQpmAtMusicSeconds(map, secs)
  const rhythmBeatBpm = rhythmBeatBpmForSection(qpm, meter.meterText, map.beatLength)
  return {
    meterText: meter.meterText,
    rhythm: meter.rhythm,
    qpm: qpm,
    rhythmBeatBpm: rhythmBeatBpm,
  }
}

function sampleMeterAtMusicSeconds(map, musicSeconds) {
  let current = {
    meterText: map.startingMeter,
    rhythm: rhythmFromTimeSignature(map.startingMeter),
  }
  for (let i = 0; i < map.meterBreaks.length; i++) {
    if (map.meterBreaks[i].musicSeconds <= musicSeconds + 0.0001) {
      current = map.meterBreaks[i]
    } else {
      break
    }
  }
  return current
}

function sampleQpmAtMusicSeconds(map, musicSeconds) {
  let current = map.startingQpm
  for (let i = 0; i < map.tempoBreaks.length; i++) {
    if (map.tempoBreaks[i].musicSeconds <= musicSeconds + 0.0001) {
      current = map.tempoBreaks[i].qpm
    } else {
      break
    }
  }
  return current
}
