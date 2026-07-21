export const DEFAULT_GATE_THRESHOLD = 0.04
export const HOLD_AFTER_MS = 300
export const MEDIAN_WINDOW = 7
export const BOWED_MEDIAN_WINDOW = 14
export const BOWED_HOLD_AFTER_MS = 500
export const BOWED_RECENT_CENTS_MAX = 40
export const IN_TUNE_HOLD_MS = 400
export const BOWED_IN_TUNE_HOLD_MS = 1400
export const BOWED_IN_TUNE_MAX_STABILITY_CENTS = 4
export const BOWED_MIN_STRING_DWELL_MS = 2000
export const NOTE_STRIP_HOLD_MS = 280
export const NOTE_STRIP_HOLD_MS_BOWED = 800

const NOTE_NAMES = [
  'C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'
]

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

export function formatDetectedFrequencyLabel(freq, a4) {
  if (!freq || freq <= 0 || !Number.isFinite(freq)) return ''
  const ref = a4 == null ? 440 : a4
  const midi = Math.round(12 * (Math.log(freq / ref) / Math.log(2)) + 69)
  const octave = Math.floor(midi / 12) - 1
  return NOTE_NAMES[((midi % 12) + 12) % 12] + String(octave)
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
  let recentCentsMax = opts.recentCentsMax || 24

  return {
    setGateThreshold: function(threshold) {
      gateThreshold = threshold
    },
    configure: function(next) {
      const cfg = next || {}
      if (cfg.windowSize != null) windowSize = cfg.windowSize
      if (cfg.holdAfterMs != null) holdAfterMs = cfg.holdAfterMs
      if (cfg.recentCentsMax != null) recentCentsMax = cfg.recentCentsMax
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
    getDisplayCents: function() {
      return medianOf(recentCents)
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
    },
    pushCents: function(cents) {
      if (cents != null && Number.isFinite(cents)) {
        recentCents.push(cents)
        if (recentCents.length > recentCentsMax) recentCents.shift()
      }
    }
  }
}

export function createNoteStripController(options) {
  const opts = options || {}
  let holdMs = opts.holdMs != null ? opts.holdMs : NOTE_STRIP_HOLD_MS
  let candidate = null
  let candidateSince = 0
  let displayed = null

  return {
    setHoldMs: function(ms) {
      holdMs = ms
    },
    reset: function() {
      candidate = null
      candidateSince = 0
      displayed = null
    },
    shouldUpdate: function(midi, isHeld, now) {
      if (isHeld || midi == null || !Number.isFinite(midi)) return false
      const t = now != null ? now : Date.now()
      if (candidate !== midi) {
        candidate = midi
        candidateSince = t
        return false
      }
      if (displayed === midi) return false
      if (t - candidateSince < holdMs) return false
      displayed = midi
      return true
    }
  }
}

export function fineDisplayRange(absCents, fineModeEnabled) {
  if (!fineModeEnabled) return null
  if (absCents == null || !Number.isFinite(absCents)) return null
  if (Math.abs(absCents) <= 8) return 3
  return null
}
