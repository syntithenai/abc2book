export const BULK_TEXT_STORAGE_KEY = 'addSongModal_bulkText'

export function getBulkImportText() {
  if (typeof sessionStorage === 'undefined') return ''
  try {
    return sessionStorage.getItem(BULK_TEXT_STORAGE_KEY) || ''
  } catch (e) {
    return ''
  }
}

export function setBulkImportText(text) {
  if (typeof sessionStorage === 'undefined') return
  try {
    const value = String(text || '')
    if (value) sessionStorage.setItem(BULK_TEXT_STORAGE_KEY, value)
    else sessionStorage.removeItem(BULK_TEXT_STORAGE_KEY)
  } catch (e) {}
}

export function clearBulkImportText() {
  setBulkImportText('')
}
