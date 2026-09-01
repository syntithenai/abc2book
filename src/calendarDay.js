/** Local calendar day helpers (midnight-to-midnight in device timezone). */

export function localDateKey(d) {
  const date = d != null ? (d instanceof Date ? d : new Date(d)) : new Date()
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return y + '-' + m + '-' + day
}

export function parseLocalDateKey(key) {
  const parts = String(key).split('-').map(Number)
  return new Date(parts[0], parts[1] - 1, parts[2])
}

export function addDays(key, delta) {
  const d = parseLocalDateKey(key)
  d.setDate(d.getDate() + delta)
  return localDateKey(d)
}

export function todayKey(now) {
  const d = now != null ? new Date(now) : new Date()
  return localDateKey(d)
}

export function yesterdayKey(now) {
  const d = now != null ? new Date(now) : new Date()
  d.setDate(d.getDate() - 1)
  return localDateKey(d)
}

export function localDayStartMs(date) {
  const d = date != null ? (date instanceof Date ? date : new Date(date)) : new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 0, 0, 0, 0).getTime()
}

export function localDayEndMs(date) {
  const d = date != null ? (date instanceof Date ? date : new Date(date)) : new Date()
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999).getTime()
}
