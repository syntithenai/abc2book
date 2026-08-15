const STORAGE_KEY = 'bookstorage_global_tempo_percent'
export const GLOBAL_TEMPO_PERCENT_OFF = 0
export const GLOBAL_TEMPO_PERCENT_MIN = 25
export const GLOBAL_TEMPO_PERCENT_MAX = 200

const listeners = new Set()

function notify() {
  listeners.forEach(function(listener) {
    try { listener() } catch (e) {}
  })
}

export function subscribeGlobalTempo(listener) {
  listeners.add(listener)
  return function() {
    listeners.delete(listener)
  }
}

export function normalizeGlobalTempoPercent(value) {
  const n = parseFloat(value)
  if (!isFinite(n) || n <= 0) return GLOBAL_TEMPO_PERCENT_OFF
  if (n < GLOBAL_TEMPO_PERCENT_MIN) return GLOBAL_TEMPO_PERCENT_MIN
  if (n > GLOBAL_TEMPO_PERCENT_MAX) return GLOBAL_TEMPO_PERCENT_MAX
  return Math.round(n)
}

function readStored() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw === null || raw === '') return GLOBAL_TEMPO_PERCENT_OFF
    return normalizeGlobalTempoPercent(raw)
  } catch (e) {
    return GLOBAL_TEMPO_PERCENT_OFF
  }
}

function writeStored(percent) {
  try {
    localStorage.setItem(STORAGE_KEY, String(percent))
  } catch (e) {}
}

export function getGlobalTempoPercent() {
  return readStored()
}

export function isGlobalTempoOverrideActive() {
  return getGlobalTempoPercent() > 0
}

export function getGlobalTempoFactor() {
  const percent = getGlobalTempoPercent()
  if (!percent) return null
  return percent / 100
}

export function setGlobalTempoPercent(percent) {
  const next = normalizeGlobalTempoPercent(percent)
  writeStored(next)
  notify()
  return next
}

export function resolvePlaybackTempo(requestedTempo) {
  const override = getGlobalTempoFactor()
  if (override != null) return override
  const n = parseFloat(requestedTempo)
  if (!isFinite(n) || n <= 0) return 1
  return n
}

export function formatGlobalTempoDisplay(percent) {
  const n = normalizeGlobalTempoPercent(percent)
  if (!n) return 'Off'
  return n + '%'
}
