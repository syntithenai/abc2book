/**
 * Fold European letters and diacritics for case-insensitive substring search.
 * e.g. "Après un rêve" → "apres un reve"
 */
export function toSearchText(text) {
  if (!text) return ''
  return foldEuropeanLetters(String(text)).toLowerCase().trim()
}

export function foldEuropeanLetters(text) {
  return String(text)
    .replace(/ß/g, 'ss')
    .replace(/ẞ/g, 'SS')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
}
