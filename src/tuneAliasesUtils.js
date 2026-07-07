export function aliasesToInputValue(aliases) {
  if (!Array.isArray(aliases)) return ''
  return aliases.map(function(item) {
    return String(item || '').trim()
  }).filter(Boolean).join(', ')
}

export function parseAliasesInput(text) {
  return String(text || '').split(',').map(function(item) {
    return item.trim()
  }).filter(Boolean)
}
