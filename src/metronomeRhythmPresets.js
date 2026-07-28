import {
  METRONOME_ACCENT,
  METRONOME_MUTE,
  METRONOME_SUB,
  METRONOME_TICK,
} from './metronomeTickSounds'

export const METRONOME_PULSE_OPTIONS = [1, 2, 3, 4, 5]

export const METRONOME_RHYTHM_PRESETS = [
  {
    id: '2-4',
    label: '2/4',
    beatsPerBar: 2,
    accents: [METRONOME_ACCENT, METRONOME_TICK],
    pulsesPerBeat: 1,
  },
  {
    id: '3-4',
    label: '3/4',
    beatsPerBar: 3,
    accents: [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK],
    pulsesPerBeat: 1,
  },
  {
    id: '4-4',
    label: '4/4',
    beatsPerBar: 4,
    accents: [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK, METRONOME_TICK],
    pulsesPerBeat: 1,
  },
  {
    id: '5-4',
    label: '5/4',
    beatsPerBar: 5,
    accents: [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK, METRONOME_ACCENT, METRONOME_TICK],
    pulsesPerBeat: 1,
  },
  {
    id: '6-8',
    label: '6/8',
    beatsPerBar: 2,
    accents: [METRONOME_ACCENT, METRONOME_TICK],
    pulsesPerBeat: 3,
  },
  {
    id: '5-8',
    label: '5/8',
    beatsPerBar: 2,
    accents: [METRONOME_ACCENT, METRONOME_TICK],
    pulsesPerBeat: [3, 2],
  },
  {
    id: '7-8',
    label: '7/8',
    beatsPerBar: 3,
    accents: [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK],
    pulsesPerBeat: [2, 2, 3],
  },
  {
    id: '9-8',
    label: '9/8',
    beatsPerBar: 3,
    accents: [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK],
    pulsesPerBeat: 3,
  },
  {
    id: '12-8',
    label: '12/8',
    beatsPerBar: 4,
    accents: [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK, METRONOME_TICK],
    pulsesPerBeat: 3,
  },
  {
    id: '11-8',
    label: '11/8',
    beatsPerBar: 5,
    accents: [METRONOME_ACCENT, METRONOME_TICK, METRONOME_TICK, METRONOME_TICK, METRONOME_TICK],
    pulsesPerBeat: [2, 2, 3, 2, 2],
  },
]

/** Strong downbeat + medium accent on each later additive group start. */
export function accentsForAdditiveGroups(beatsPerBar) {
  const count = Math.max(1, Math.min(16, parseInt(beatsPerBar, 10) || 1))
  const accents = []
  for (let i = 0; i < count; i++) {
    accents.push(i === 0 ? METRONOME_ACCENT : METRONOME_TICK)
  }
  return accents
}

export function createAdditiveRhythm(pulses) {
  const pattern = Array.isArray(pulses) ? pulses.slice() : []
  if (!pattern.length || pattern.some(function(value) {
    return !METRONOME_PULSE_OPTIONS.includes(value)
  })) {
    return null
  }
  return createRhythm(pattern.length, accentsForAdditiveGroups(pattern.length), pattern)
}

function parseAdditivePulseText(text) {
  const raw = String(text || '').trim()
  const withDen = raw.match(/^(\d+(?:\s*\+\s*\d+)+)\s*\/\s*(\d+)$/)
  if (withDen) {
    const pulses = withDen[1].split(/\s*\+\s*/).map(function(part) { return parseInt(part, 10) })
    return createAdditiveRhythm(pulses)
  }
  const bare = raw.match(/^(\d+(?:\s*\+\s*\d+)+)$/)
  if (bare) {
    const pulses = bare[1].split(/\s*\+\s*/).map(function(part) { return parseInt(part, 10) })
    return createAdditiveRhythm(pulses)
  }
  return null
}

/**
 * Build meter text from an abcjs timeSignature / meter element (supports additive value[]).
 */
export function meterTextFromAbcMeterElement(element) {
  if (!element) return ''
  if (element.type === 'common_time') return '4/4'
  if (element.type === 'cut_time') return '2/2'
  if (element.el_type === 'meter' && element.num && element.den) {
    return String(element.num) + '/' + String(element.den)
  }
  const values = element.value
  if (Array.isArray(values) && values.length > 0) {
    if (values.length > 1) {
      const den = values[0] && values[0].den ? values[0].den : 8
      return values.map(function(part) { return parseInt(part.num, 10) || 0 }).join('+') + '/' + den
    }
    if (values[0] && values[0].num && values[0].den) {
      return String(values[0].num) + '/' + String(values[0].den)
    }
  }
  return ''
}

/** Rhythm grid from abcjs meter element (additive-aware). */
export function rhythmFromAbcMeterElement(element) {
  const text = meterTextFromAbcMeterElement(element)
  if (text) return rhythmFromTimeSignature(text)
  return defaultMetronomeRhythm()
}

const ACCENT_CYCLE = [METRONOME_ACCENT, METRONOME_TICK, METRONOME_MUTE]

export function normalizeAccentPattern(accents, beatsPerBar) {
  const count = Math.max(1, Math.min(16, beatsPerBar || 1))
  const pattern = Array.isArray(accents) ? accents.slice(0, count) : []
  while (pattern.length < count) {
    pattern.push(pattern.length === 0 ? METRONOME_ACCENT : METRONOME_TICK)
  }
  return pattern.map(function(level) {
    return ACCENT_CYCLE.includes(level) ? level : METRONOME_TICK
  })
}

export function normalizePulsesPerBeat(pulsesPerBeat) {
  const value = parseInt(pulsesPerBeat, 10)
  if (!METRONOME_PULSE_OPTIONS.includes(value)) return 1
  return value
}

export function normalizePulsesPattern(pulsesPerBeat, beatsPerBar) {
  const count = Math.max(1, Math.min(16, beatsPerBar || 1))
  if (Array.isArray(pulsesPerBeat)) {
    const pattern = pulsesPerBeat.slice(0, count).map(normalizePulsesPerBeat)
    while (pattern.length < count) {
      pattern.push(pattern.length > 0 ? pattern[pattern.length - 1] : 1)
    }
    return pattern
  }
  const value = normalizePulsesPerBeat(pulsesPerBeat)
  return Array.from({ length: count }, function() { return value })
}

export function pulsesPatternEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return left.every(function(value, index) { return value === right[index] })
}

export function accentsPatternEqual(left, right) {
  if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
  return left.every(function(value, index) { return value === right[index] })
}

export function rhythmsEqual(left, right) {
  if (!left || !right) return false
  return left.beatsPerBar === right.beatsPerBar
    && accentsPatternEqual(left.accents, right.accents)
    && pulsesPatternEqual(left.pulsesPerBeat, right.pulsesPerBeat)
}

export function rhythmKey(rhythm) {
  if (!rhythm) return ''
  return rhythm.beatsPerBar + '|'
    + (rhythm.accents || []).join(',') + '|'
    + (rhythm.pulsesPerBeat || []).join(',')
}

export function createRhythm(beatsPerBar, accents, pulsesPerBeat) {
  const beats = Math.max(1, Math.min(16, parseInt(beatsPerBar, 10) || 4))
  return {
    beatsPerBar: beats,
    accents: normalizeAccentPattern(accents, beats),
    pulsesPerBeat: normalizePulsesPattern(pulsesPerBeat, beats),
  }
}

export function rhythmFromPreset(presetId) {
  const preset = METRONOME_RHYTHM_PRESETS.find(function(item) { return item.id === presetId })
  if (!preset) return createRhythm(4)
  return createRhythm(preset.beatsPerBar, preset.accents, preset.pulsesPerBeat)
}

export function defaultMetronomeRhythm() {
  return createRhythm(4, [METRONOME_ACCENT], 1)
}

/** Normalize ABC/common time-signature tokens to numeric form. */
export function normalizeTimeSignatureText(text) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const lowered = raw.toLowerCase()
  if (lowered === 'c' || lowered === 'common') return '4/4'
  if (lowered === 'c|' || lowered === 'cut') return '2/2'
  return raw
}

/**
 * Default metronome rhythm for a tune's time signature.
 * Uses full preset accent patterns when the meter matches a known preset.
 */
export function rhythmFromTimeSignature(text) {
  const normalized = normalizeTimeSignatureText(text)
  if (!normalized) return defaultMetronomeRhythm()

  const lowered = normalized.toLowerCase()
  const preset = METRONOME_RHYTHM_PRESETS.find(function(item) {
    return item.label.toLowerCase() === lowered
      || item.id === lowered
      || item.id === lowered.replace('/', '-')
  })
  if (preset) return rhythmFromPreset(preset.id)

  const parsed = parseRhythmText(normalized)
  return parsed || defaultMetronomeRhythm()
}

/**
 * Parse free-text time signatures such as "4/4", "6-8", or preset labels.
 * Sets beats per bar and pulses per beat, with an accent on the first beat only.
 */
export function parseRhythmText(text) {
  const raw = String(text || '').trim()
  if (!raw) return null

  const lowered = raw.toLowerCase()
  const preset = METRONOME_RHYTHM_PRESETS.find(function(item) {
    return item.label.toLowerCase() === lowered
      || item.id === lowered
      || item.id === lowered.replace('/', '-')
  })
  if (preset) {
    return rhythmFromPreset(preset.id)
  }

  const additive = parseAdditivePulseText(raw)
  if (additive) return additive

  const match = raw.match(/^(\d+)\s*[\/\-:]\s*(\d+)$/)
  if (!match) return null
  const numerator = parseInt(match[1], 10)
  const denominator = parseInt(match[2], 10)
  if (!(numerator > 0) || !(denominator > 0)) return null

  if (denominator === 8 && numerator >= 6 && numerator % 3 === 0) {
    return createRhythm(
      numerator / 3,
      accentsForAdditiveGroups(numerator / 3),
      3
    )
  }
  if (denominator === 8 && numerator === 7) {
    return rhythmFromPreset('7-8')
  }
  if (denominator === 8 && numerator === 5) {
    return rhythmFromPreset('5-8')
  }
  if (denominator === 8 && numerator === 11) {
    return rhythmFromPreset('11-8')
  }
  if (denominator === 4 && numerator === 5) {
    return rhythmFromPreset('5-4')
  }
  return createRhythm(numerator, accentsForAdditiveGroups(numerator), 1)
}

export function formatRhythmText(rhythm) {
  if (!rhythm) return '4/4'
  const preset = METRONOME_RHYTHM_PRESETS.find(function(item) {
    const candidate = createRhythm(item.beatsPerBar, item.accents, item.pulsesPerBeat)
    return candidate.beatsPerBar === rhythm.beatsPerBar
      && pulsesPatternEqual(candidate.pulsesPerBeat, rhythm.pulsesPerBeat)
  })
  if (preset) return preset.label

  const firstPulse = rhythm.pulsesPerBeat[0]
  const uniform = rhythm.pulsesPerBeat.every(function(value) { return value === firstPulse })
  if (uniform) {
    if (firstPulse === 3) return (rhythm.beatsPerBar * 3) + '/8'
    if (firstPulse === 2) return (rhythm.beatsPerBar * 2) + '/8'
    return rhythm.beatsPerBar + '/4'
  }
  return rhythm.pulsesPerBeat.join('+')
}

export function presetIdForRhythm(rhythm) {
  if (!rhythm) return ''
  const preset = METRONOME_RHYTHM_PRESETS.find(function(item) {
    const candidate = createRhythm(item.beatsPerBar, item.accents, item.pulsesPerBeat)
    return candidate.beatsPerBar === rhythm.beatsPerBar
      && pulsesPatternEqual(candidate.pulsesPerBeat, rhythm.pulsesPerBeat)
      && candidate.accents.length === rhythm.accents.length
      && candidate.accents.every(function(level, index) { return level === rhythm.accents[index] })
  })
  return preset ? preset.id : ''
}

export function cycleAccentLevel(level) {
  const index = ACCENT_CYCLE.indexOf(level)
  if (index < 0) return METRONOME_ACCENT
  return ACCENT_CYCLE[(index + 1) % ACCENT_CYCLE.length]
}

export function slotsPerBar(rhythm) {
  return rhythm.pulsesPerBeat.reduce(function(sum, pulses) { return sum + pulses }, 0)
}

/** Metronome maxBeats counts click slots; convert a beat count using pulse settings. */
export function slotsForBeatCount(rhythm, beatCount) {
  const beats = Math.max(0, Math.floor(parseFloat(beatCount) || 0))
  if (beats <= 0 || !rhythm) return 0
  let slots = 0
  for (let b = 0; b < beats; b++) {
    const beatIndex = b % rhythm.beatsPerBar
    slots += (rhythm.pulsesPerBeat && rhythm.pulsesPerBeat[beatIndex]) || 1
  }
  return slots
}

export function averagePulsesPerBeat(rhythm) {
  if (!rhythm || !Array.isArray(rhythm.pulsesPerBeat) || rhythm.pulsesPerBeat.length === 0) return 1
  const sum = rhythm.pulsesPerBeat.reduce(function(total, pulses) { return total + pulses }, 0)
  return sum / rhythm.pulsesPerBeat.length
}

/**
 * Wall-clock delay after the last count-in click before music should start.
 * abcjs beat units already match metronome rhythm beats (e.g. 2 dotted quarters in 6/8).
 * The metronome callback fires when the last click is scheduled; music enters on the
 * next subdivision/downbeat one pulse later.
 */
export function countInMusicStartDelayMs(countIn, rhythm) {
  const beatDurationMs = parseFloat(countIn && countIn.beatDurationMs) || 0
  const pickupDelayMs = parseFloat(countIn && countIn.delayMs) || 0
  if (pickupDelayMs > 0) return pickupDelayMs
  if (!(beatDurationMs > 0)) return 0
  return beatDurationMs / averagePulsesPerBeat(rhythm)
}

export function resolveSlotPosition(rhythm, slotIndex) {
  const total = slotsPerBar(rhythm)
  let remaining = ((slotIndex % total) + total) % total
  for (let beatIndex = 0; beatIndex < rhythm.beatsPerBar; beatIndex++) {
    const pulses = rhythm.pulsesPerBeat[beatIndex] || 1
    if (remaining < pulses) {
      return { beatIndex: beatIndex, pulseIndex: remaining }
    }
    remaining -= pulses
  }
  return { beatIndex: 0, pulseIndex: 0 }
}

export function slotAccentLevel(rhythm, slotIndex) {
  const position = resolveSlotPosition(rhythm, slotIndex)
  if (position.pulseIndex > 0) return METRONOME_SUB
  return rhythm.accents[position.beatIndex] || METRONOME_TICK
}

export function slotBeatIndex(rhythm, slotIndex) {
  return resolveSlotPosition(rhythm, slotIndex).beatIndex
}

export function slotPulseIndex(rhythm, slotIndex) {
  return resolveSlotPosition(rhythm, slotIndex).pulseIndex
}
