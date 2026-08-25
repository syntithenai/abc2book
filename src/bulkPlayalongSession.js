import { expectedNotesFromPlayalongTune } from './playalongTakeScore'
import { clampPlayalongRepeats } from './playalongSettings'
import {
  estimateMusicStartOffsetSeconds,
  estimatePlayalongMusicDurationSeconds,
} from './playalongTakes'

const STORAGE_KEY = 'abc2book.bulkPlayalongSession'

export const PLAYALONG_TEMPO_MULTIPLIER_MIN = 0.5
export const PLAYALONG_TEMPO_MULTIPLIER_MAX = 2
export const PLAYALONG_TEMPO_MULTIPLIER_DEFAULT = 1

export function clampPlayalongTempoMultiplier(value) {
  const n = parseFloat(value)
  if (!Number.isFinite(n) || n <= 0) return PLAYALONG_TEMPO_MULTIPLIER_DEFAULT
  if (n < PLAYALONG_TEMPO_MULTIPLIER_MIN) return PLAYALONG_TEMPO_MULTIPLIER_MIN
  if (n > PLAYALONG_TEMPO_MULTIPLIER_MAX) return PLAYALONG_TEMPO_MULTIPLIER_MAX
  return Math.round(n * 100) / 100
}

export function resolvePlayalongTuneTempoBpm(tune, tunebook) {
  if (tunebook && tunebook.abcTools && typeof tunebook.abcTools.getTempo === 'function') {
    const bpm = parseFloat(tunebook.abcTools.getTempo(tune))
    if (Number.isFinite(bpm) && bpm > 0) return bpm
  }
  const raw = tune && tune.tempo
  const n = parseFloat(raw)
  if (Number.isFinite(n) && n > 0 && n < 400) return n
  return 100
}

export function applyPlayalongTempoMultiplier(baseBpm, multiplier) {
  const base = Number.isFinite(baseBpm) && baseBpm > 0 ? baseBpm : 100
  const factor = clampPlayalongTempoMultiplier(multiplier)
  return Math.max(20, Math.min(400, base * factor))
}

/** Approximate wall-clock recording time for a list of tunes (count-in + music × repeats). */
export function estimateBulkPlayalongRecordingSeconds(tunes, tunebook, options) {
  const opts = options || {}
  const repeats = clampPlayalongRepeats(opts.repeats)
  const tempoMultiplier = clampPlayalongTempoMultiplier(opts.tempoMultiplier)
  let total = 0
  ;(Array.isArray(tunes) ? tunes : []).forEach(function(tune) {
    if (!tune) return
    const tempoBpm = applyPlayalongTempoMultiplier(
      resolvePlayalongTuneTempoBpm(tune, tunebook),
      tempoMultiplier
    )
    const notes = expectedNotesFromPlayalongTune(tune, 0)
    const musicSeconds = estimatePlayalongMusicDurationSeconds(notes, tempoBpm)
    const countInSeconds = estimateMusicStartOffsetSeconds(tune, tunebook, 1, tempoBpm)
    const oneTake = (Number.isFinite(musicSeconds) ? musicSeconds : 0)
      + (Number.isFinite(countInSeconds) ? countInSeconds : 0)
    if (oneTake > 0) total += oneTake * repeats
  })
  return total
}

/** Human-friendly duration, e.g. "about 45 seconds", "about 3 minutes". */
export function formatApproximatePlayalongDuration(seconds) {
  const s = Number(seconds)
  if (!(s > 0) || !Number.isFinite(s)) return 'about a moment'
  if (s < 60) {
    const rounded = Math.max(1, Math.round(s))
    return 'about ' + rounded + ' second' + (rounded === 1 ? '' : 's')
  }
  if (s < 90 * 60) {
    const minutes = Math.max(1, Math.round(s / 60))
    return 'about ' + minutes + ' minute' + (minutes === 1 ? '' : 's')
  }
  const hours = Math.floor(s / 3600)
  const minutes = Math.round((s % 3600) / 60)
  if (minutes <= 0) {
    return 'about ' + hours + ' hour' + (hours === 1 ? '' : 's')
  }
  return 'about ' + hours + ' h ' + minutes + ' min'
}

function readJson() {
  if (typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function writeJson(value) {
  if (typeof sessionStorage === 'undefined') return
  try {
    if (!value) {
      sessionStorage.removeItem(STORAGE_KEY)
      return
    }
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(value))
  } catch (e) {}
}

export function createBulkPlayalongSession(options) {
  const opts = options || {}
  const tuneIds = Array.isArray(opts.tuneIds)
    ? opts.tuneIds.filter(Boolean).map(String)
    : []
  if (!tuneIds.length) return null
  const session = {
    tuneIds: tuneIds,
    currentIndex: 0,
    settings: opts.settings || null,
    tempoMultiplier: clampPlayalongTempoMultiplier(opts.tempoMultiplier),
    startedAt: Date.now(),
  }
  writeJson(session)
  return session
}

export function getBulkPlayalongSession() {
  const session = readJson()
  if (!session || !Array.isArray(session.tuneIds) || !session.tuneIds.length) return null
  return session
}

export function clearBulkPlayalongSession() {
  writeJson(null)
}

export function isBulkPlayalongCurrentTune(tuneId) {
  const session = getBulkPlayalongSession()
  if (!session || tuneId == null) return false
  const idx = Number.isFinite(session.currentIndex) ? session.currentIndex : 0
  return String(session.tuneIds[idx]) === String(tuneId)
}

export function getBulkPlayalongProgress() {
  const session = getBulkPlayalongSession()
  if (!session) return null
  const idx = Number.isFinite(session.currentIndex) ? session.currentIndex : 0
  return {
    current: idx + 1,
    total: session.tuneIds.length,
  }
}

export function advanceBulkPlayalongSession() {
  const session = getBulkPlayalongSession()
  if (!session) return { done: true, completed: 0 }
  const idx = Number.isFinite(session.currentIndex) ? session.currentIndex : 0
  const nextIndex = idx + 1
  if (nextIndex >= session.tuneIds.length) {
    const completed = session.tuneIds.length
    clearBulkPlayalongSession()
    return { done: true, completed: completed }
  }
  const updated = Object.assign({}, session, { currentIndex: nextIndex })
  writeJson(updated)
  return {
    done: false,
    nextTuneId: session.tuneIds[nextIndex],
    progress: { current: nextIndex + 1, total: session.tuneIds.length },
  }
}
