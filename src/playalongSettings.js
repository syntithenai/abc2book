import { midiToFrequency } from './tunerTuningUtils'
import {
  clampReferenceGain,
  DEFAULT_PRACTICE_SETTINGS,
} from './practiceSessionSettings'
import { PLAYALONG_MAX_LOOP_TAKES } from './playalongTakes'

export const PLAYALONG_SETTINGS_STORAGE_KEY = 'bookstorage_playalong_settings'

export const PLAYALONG_INSTRUMENTS = [
  { id: 'whistle', label: 'Tin whistle (low D)', lowestMidi: 62, highestMidi: 95 },
  { id: 'whistle-high-d', label: 'Tin whistle (high D) / recorder', lowestMidi: 74, highestMidi: 98 },
  { id: 'flute', label: 'Flute', lowestMidi: 60, highestMidi: 96 },
  { id: 'violin', label: 'Violin', lowestMidi: 55, highestMidi: 88 },
  { id: 'viola', label: 'Viola', lowestMidi: 48, highestMidi: 81 },
  { id: 'cello', label: 'Cello', lowestMidi: 36, highestMidi: 81 },
  { id: 'mandolin', label: 'Mandolin', lowestMidi: 55, highestMidi: 88 },
  { id: 'guitar', label: 'Guitar (melody)', lowestMidi: 40, highestMidi: 88 },
  { id: 'piano', label: 'Piano (right-hand melody)', lowestMidi: 48, highestMidi: 96 },
  { id: 'voice', label: 'Voice', lowestMidi: 36, highestMidi: 88 },
]

const INSTRUMENT_IDS = PLAYALONG_INSTRUMENTS.map(function(item) { return item.id })

export const DEFAULT_PLAYALONG_SETTINGS = {
  cutoffPercent: 20,
  playbackGain: DEFAULT_PRACTICE_SETTINGS.practiceReferenceGain,
  instrumentId: 'whistle',
  repeats: 3,
  /** User-measured output latency from clap/loopback calibration; 0 = unset. */
  calibratedOutputLatencySeconds: 0,
}

export function clampPlayalongRepeats(value) {
  const n = parseInt(value, 10)
  if (!Number.isFinite(n)) return DEFAULT_PLAYALONG_SETTINGS.repeats
  return Math.max(1, Math.min(PLAYALONG_MAX_LOOP_TAKES, n))
}

export function clampCutoffPercent(value) {
  const n = Math.round(parseFloat(value))
  if (!Number.isFinite(n)) return DEFAULT_PLAYALONG_SETTINGS.cutoffPercent
  return Math.max(0, Math.min(100, n))
}

export function normalizePlayalongInstrument(value) {
  const id = value != null ? String(value).trim().toLowerCase() : ''
  if (INSTRUMENT_IDS.indexOf(id) !== -1) return id
  return DEFAULT_PLAYALONG_SETTINGS.instrumentId
}

export function getPlayalongInstrument(instrumentId) {
  const id = normalizePlayalongInstrument(instrumentId)
  return PLAYALONG_INSTRUMENTS.find(function(item) { return item.id === id }) || PLAYALONG_INSTRUMENTS[0]
}

/** 0% → ~0.00004 (near-open gate), 50% → 0.0055, 100% → 0.028 */
export function cutoffPercentToRmsFloor(percent) {
  const clamped = clampCutoffPercent(percent)
  if (clamped <= 0) return 0.00004
  const t = clamped / 100
  if (t <= 0.5) return 0.0015 + (0.0055 - 0.0015) * (t / 0.5)
  return 0.0055 + (0.028 - 0.0055) * ((t - 0.5) / 0.5)
}

export function cutoffPercentToHoldRms(percent) {
  const floor = cutoffPercentToRmsFloor(percent)
  if (clampCutoffPercent(percent) <= 0) return floor * 0.85
  return floor * 0.6
}

export function playalongInstrumentHzRange(instrumentId) {
  const profile = getPlayalongInstrument(instrumentId)
  const minHz = midiToFrequency(profile.lowestMidi) * 0.94
  const maxHz = midiToFrequency(profile.highestMidi) * 1.06
  return {
    minHz: minHz,
    maxHz: maxHz,
    lowestMidi: profile.lowestMidi,
    highestMidi: profile.highestMidi,
  }
}

export function playalongTrackingOptions(settings) {
  const next = normalizePlayalongSettings(settings)
  const range = playalongInstrumentHzRange(next.instrumentId)
  const isVoice = next.instrumentId === 'voice'
  // Voice is quieter and less pure than whistle; ease the gate so soft singing
  // still draws a continuous pitch line.
  const rmsScale = isVoice ? 0.62 : 1
  return {
    rmsFloor: cutoffPercentToRmsFloor(next.cutoffPercent) * rmsScale,
    holdRms: cutoffPercentToHoldRms(next.cutoffPercent) * rmsScale,
    minHz: range.minHz,
    maxHz: range.maxHz,
    minMidi: range.lowestMidi - 2,
    maxMidi: range.highestMidi + 2,
    // Whistle/flute often lock onto overtones; fold toward a fundamental.
    // Voice formants make that fold unreliable — keep the detector's raw Hz.
    preferFundamental: !isVoice && (
      next.instrumentId === 'whistle'
      || next.instrumentId === 'whistle-high-d'
      || next.instrumentId === 'flute'
    ),
  }
}

export function playalongTrackingCacheKey(settings) {
  const tracking = playalongTrackingOptions(settings)
  return [
    tracking.rmsFloor,
    tracking.holdRms,
    tracking.minHz,
    tracking.maxHz,
    tracking.minMidi,
    tracking.maxMidi,
  ].join(':')
}

export function clampCalibratedOutputLatencySeconds(value) {
  const n = parseFloat(value)
  if (!Number.isFinite(n) || n < 0.02) return 0
  return Math.min(0.5, n)
}

export function normalizePlayalongSettings(raw) {
  const src = raw && typeof raw === 'object' ? raw : {}
  return {
    cutoffPercent: clampCutoffPercent(src.cutoffPercent),
    playbackGain: clampReferenceGain(src.playbackGain),
    instrumentId: normalizePlayalongInstrument(src.instrumentId),
    repeats: clampPlayalongRepeats(src.repeats),
    calibratedOutputLatencySeconds: clampCalibratedOutputLatencySeconds(
      src.calibratedOutputLatencySeconds
    ),
  }
}

export function loadPlayalongSettings() {
  try {
    const stored = localStorage.getItem(PLAYALONG_SETTINGS_STORAGE_KEY)
    if (!stored) return Object.assign({}, DEFAULT_PLAYALONG_SETTINGS)
    const parsed = JSON.parse(stored)
    const next = normalizePlayalongSettings(parsed)
    // One-time soften: previous default was 50 with a harsher RMS curve.
    if (
      !parsed.cutoffSoftenedV2
      && (parsed.cutoffPercent === 50 || parsed.cutoffPercent === '50')
    ) {
      next.cutoffPercent = DEFAULT_PLAYALONG_SETTINGS.cutoffPercent
      savePlayalongSettings(Object.assign({}, next, { cutoffSoftenedV2: true }))
      return next
    }
    return next
  } catch (e) {
    return Object.assign({}, DEFAULT_PLAYALONG_SETTINGS)
  }
}

export function savePlayalongSettings(settings) {
  const next = normalizePlayalongSettings(settings)
  const toStore = Object.assign({}, next, {
    cutoffSoftenedV2: settings && settings.cutoffSoftenedV2 != null
      ? !!settings.cutoffSoftenedV2
      : true,
  })
  try {
    localStorage.setItem(PLAYALONG_SETTINGS_STORAGE_KEY, JSON.stringify(toStore))
  } catch (e) {}
  return next
}
