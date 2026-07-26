export function normalizeAutosuggestText(value) {
  return String(value || '').trim().toLowerCase()
}

export function isAutosuggestReplacementEvent(event) {
  const inputType = event && event.nativeEvent && event.nativeEvent.inputType
  return inputType === 'insertReplacementText'
}

export function findAutosuggestOptionMatch(value, options) {
  const wanted = normalizeAutosuggestText(value)
  if (!wanted || !Array.isArray(options)) return ''
  for (let i = 0; i < options.length; i += 1) {
    const option = String(options[i] || '').trim()
    if (option && normalizeAutosuggestText(option) === wanted) return option
  }
  return ''
}

/**
 * True when the input value jumped to a full datalist option (not the last
 * keystroke while typing that option character-by-character).
 */
export function isAutosuggestOptionPick(value, searchDraft, options) {
  const matched = findAutosuggestOptionMatch(value, options)
  if (!matched) return false
  const draft = String(searchDraft || '')
  if (normalizeAutosuggestText(matched) === normalizeAutosuggestText(draft)) return false
  if (!draft) return true
  const draftLower = draft.toLowerCase()
  const matchedLower = matched.toLowerCase()
  if (matchedLower.indexOf(draftLower) === 0 && matched.length - draft.length <= 1) {
    return false
  }
  return true
}

export function blurInputTarget(event) {
  const target = event && event.target
  if (target && typeof target.blur === 'function') {
    target.blur()
  }
}
