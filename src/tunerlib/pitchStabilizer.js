export const DEFAULT_GATE_THRESHOLD = 0.04
export const HOLD_AFTER_MS = 300
export const MEDIAN_WINDOW = 7
export const IN_TUNE_HOLD_MS = 400

export function medianOf(values) {
  if (!values || !values.length) return null
  const sorted = values.slice().sort(function(a, b) { return a - b })
  const mid = Math.floor(sorted.length / 2)
  if (sorted.length % 2 === 1) return sorted[mid]
  return (sorted[mid - 1] + sorted[mid]) / 2
}

export function stddev(values) {
  if (!values || values.length < 2) return null
  let sum = 0
  for (let i = 0; i < values.length; i += 1) sum += values[i]
  const mean = sum / values.length
  let sq = 0
  for (let j = 0; j < values.length; j += 1) {
    const d = values[j] - mean
    sq += d * d
  }
  return Math.sqrt(sq / values.length)
}

export function formatDetectedNoteLabel(note) {
  if (!note) return ''
  const octave = note.octave != null ? note.octave : ''
  return String(note.name || '') + String(octave)
}

export function createPitchStabilizer(options) {
  const opts = options || {}
  let windowSize = opts.windowSize || MEDIAN_WINDOW
  let gateThreshold = opts.gateThreshold != null ? opts.gateThreshold : DEFAULT_GATE_THRESHOLD
  let holdAfterMs = opts.holdAfterMs || HOLD_AFTER_MS
  let freqWindow = []
  let held = null
  let lastLiveAt = 0
  let recentCents = []
  const recentCentsMax = opts.recentCentsMax || 24

  return {
    setGateThreshold: function(threshold) {
      gateThreshold = threshold
    },
    reset: function() {
      freqWindow = []
      held = null
      lastLiveAt = 0
      recentCents = []
    },
    getStabilityCents: function() {
      return stddev(recentCents)
    },
    process: function(rawFreq, inputLevel, cents, noteLabel, now) {
      const t = now != null ? now : Date.now()
      const gated = inputLevel >= gateThreshold && rawFreq > 0 && Number.isFinite(rawFreq)

      if (gated) {
        freqWindow.push(rawFreq)
        if (freqWindow.length > windowSize) freqWindow.shift()
        const freq = medianOf(freqWindow)
        lastLiveAt = t
        held = {
          freq: freq,
          cents: cents,
          noteLabel: noteLabel,
          isHeld: false,
          at: t
        }
        if (cents != null && Number.isFinite(cents)) {
          recentCents.push(cents)
          if (recentCents.length > recentCentsMax) recentCents.shift()
        }
        return Object.assign({}, held)
      }

      if (held && t - lastLiveAt < holdAfterMs) {
        return Object.assign({}, held, { isHeld: false })
      }

      if (held) {
        return Object.assign({}, held, { isHeld: true })
      }

      return {
        freq: null,
        cents: null,
        noteLabel: null,
        isHeld: true
      }
    }
  }
}

export function fineDisplayRange(absCents, fineModeEnabled) {
  if (!fineModeEnabled) return null
  if (absCents == null || !Number.isFinite(absCents)) return null
  if (Math.abs(absCents) <= 8) return 3
  return null
}
