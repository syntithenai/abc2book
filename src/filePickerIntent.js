const PICKER_INTENT_KEY = 'abc2book.filePickerIntent'
const PICKER_INTENT_TTL_MS = 5 * 60 * 1000

export function writeFilePickerIntent(kind, tuneId) {
  if (!kind || !tuneId || typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.setItem(PICKER_INTENT_KEY, JSON.stringify({
      kind: kind,
      tuneId: String(tuneId),
      ts: Date.now(),
    }))
  } catch (e) {}
}

export function clearFilePickerIntent() {
  if (typeof sessionStorage === 'undefined') return
  try {
    sessionStorage.removeItem(PICKER_INTENT_KEY)
  } catch (e) {}
}

/**
 * Returns and clears a fresh picker intent for this tune, or null.
 * kind: 'photos' | 'drive'
 */
export function consumeFilePickerIntent(tuneId) {
  if (!tuneId || typeof sessionStorage === 'undefined') return null
  try {
    const raw = sessionStorage.getItem(PICKER_INTENT_KEY)
    if (!raw) return null
    const data = JSON.parse(raw)
    if (!data || !data.kind || !data.tuneId || !data.ts) {
      clearFilePickerIntent()
      return null
    }
    if (String(data.tuneId) !== String(tuneId)) return null
    if (Date.now() - data.ts > PICKER_INTENT_TTL_MS) {
      clearFilePickerIntent()
      return null
    }
    clearFilePickerIntent()
    return data.kind === 'photos' || data.kind === 'drive' ? data.kind : null
  } catch (e) {
    clearFilePickerIntent()
    return null
  }
}
