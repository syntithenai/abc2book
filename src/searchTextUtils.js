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

export function tokenizeMainSearchQuery(text) {
  const cleanText = toSearchText(text).replace(/\s+/g, ' ').trim()
  if (!cleanText) return []
  return cleanText
    .split(' ')
    .map(function(part) { return part.trim() })
    .filter(function(part) {
      return part.length >= 3
    })
}

export function textMatchesSearchTokens(haystackStrings, tokens) {
  if (!tokens || tokens.length === 0) return true
  const haystacks = (Array.isArray(haystackStrings) ? haystackStrings : [])
    .map(function(text) { return toSearchText(text) })
    .filter(Boolean)
  if (haystacks.length === 0) return false
  return tokens.every(function(token) {
    return haystacks.some(function(text) {
      return text.indexOf(token) !== -1
    })
  })
}

export function matchesMainSearchText(haystackStrings, filterText) {
  const tokens = tokenizeMainSearchQuery(filterText)
  if (tokens.length === 0) return true
  return textMatchesSearchTokens(haystackStrings, tokens)
}
