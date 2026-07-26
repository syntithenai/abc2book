/** User preference for bulk import Enhance checkbox (off by default). */

const STORAGE_KEY = 'addSongModal_bulkEnhance'

export function getBulkImportEnhanceEnabled() {
  if (typeof localStorage === 'undefined') return false
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored === '1') return true
    if (stored === '0') return false
    // One-time migration from session-scoped storage.
    if (typeof sessionStorage !== 'undefined') {
      const legacy = sessionStorage.getItem(STORAGE_KEY)
      if (legacy === '1' || legacy === '0') {
        localStorage.setItem(STORAGE_KEY, legacy)
        sessionStorage.removeItem(STORAGE_KEY)
        return legacy === '1'
      }
    }
    return false
  } catch (e) {
    return false
  }
}

export function setBulkImportEnhanceEnabled(enabled) {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0')
  } catch (e) {}
}
