import {
  METRONOME_ACCENT,
  METRONOME_MUTE,
  METRONOME_SUB,
  METRONOME_TICK,
} from './metronomeTickSounds'

export const METRONOME_PULSE_OPTIONS = [1, 2, 3, 4]

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
    id: '7-8',
    label: '7/8',
    beatsPerBar: 4,
    accents: [METRONOME_ACCENT, METRONOME_TICK, METRONOME_ACCENT, METRONOME_TICK],
    pulsesPerBeat: 2,
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
]

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

export function createRhythm(beatsPerBar, accents, pulsesPerBeat) {
  const beats = Math.max(1, Math.min(16, parseInt(beatsPerBar, 10) || 4))
  return {
    beatsPerBar: beats,
    accents: normalizeAccentPattern(accents, beats),
    pulsesPerBeat: normalizePulsesPerBeat(pulsesPerBeat),
  }
}

export function rhythmFromPreset(presetId) {
  const preset = METRONOME_RHYTHM_PRESETS.find(function(item) { return item.id === presetId })
  if (!preset) return createRhythm(4)
  return createRhythm(preset.beatsPerBar, preset.accents, preset.pulsesPerBeat)
}

export function cycleAccentLevel(level) {
  const index = ACCENT_CYCLE.indexOf(level)
  if (index < 0) return METRONOME_ACCENT
  return ACCENT_CYCLE[(index + 1) % ACCENT_CYCLE.length]
}

export function slotsPerBar(rhythm) {
  return rhythm.beatsPerBar * rhythm.pulsesPerBeat
}

export function slotAccentLevel(rhythm, slotIndex) {
  const beatIndex = Math.floor(slotIndex / rhythm.pulsesPerBeat) % rhythm.beatsPerBar
  const pulseIndex = slotIndex % rhythm.pulsesPerBeat
  if (pulseIndex > 0) return METRONOME_SUB
  return rhythm.accents[beatIndex] || METRONOME_TICK
}

export function slotBeatIndex(rhythm, slotIndex) {
  return Math.floor(slotIndex / rhythm.pulsesPerBeat) % rhythm.beatsPerBar
}

export function slotPulseIndex(rhythm, slotIndex) {
  return slotIndex % rhythm.pulsesPerBeat
}
