const ANNOTATION_PLACEHOLDER_PREFIX = '\x00ABCANN'
const ANNOTATION_PLACEHOLDER_SUFFIX = '\x00'

/**
 * Temporarily replace ABC 2.1 !annotation! tokens so bare ! line breaks can be converted.
 * @returns {{ text: string, annotations: string[] }}
 */
export function protectAbcAnnotations(abc) {
  const annotations = []
  const text = String(abc || '').replace(/!([A-Za-z][A-Za-z0-9_]*)!/g, function(match) {
    const index = annotations.length
    annotations.push(match)
    return ANNOTATION_PLACEHOLDER_PREFIX + index + ANNOTATION_PLACEHOLDER_SUFFIX
  })
  return { text: text, annotations: annotations }
}

/**
 * Restore placeholders from protectAbcAnnotations.
 */
export function restoreAbcAnnotations(text, annotations) {
  let restored = String(text || '')
  const list = Array.isArray(annotations) ? annotations : []
  return restored.replace(
    new RegExp(ANNOTATION_PLACEHOLDER_PREFIX + '(\\d+)' + ANNOTATION_PLACEHOLDER_SUFFIX, 'g'),
    function(_, indexText) {
      const index = parseInt(indexText, 10)
      return list[index] != null ? list[index] : ''
    }
  )
}

/**
 * True when ABC likely uses The Session / folktune ! line-break markers (not only !word! annotations).
 */
export function needsSessionLineBreakFix(abc) {
  const text = String(abc || '')
  if (!text) return false
  if (/\|!/.test(text)) return true
  const protectedText = protectAbcAnnotations(text).text
  return /!(?![A-Za-z])/.test(protectedText)
}

/**
 * Convert bare ! markers to newlines; preserves !annotation! pairs.
 */
export function convertSessionLineBreaks(abc) {
  const text = String(abc || '')
  if (!needsSessionLineBreakFix(text)) return text
  const protectedParts = protectAbcAnnotations(text)
  const converted = protectedParts.text.replace(/!/g, '\n')
  return restoreAbcAnnotations(converted, protectedParts.annotations)
}

/**
 * Safe ABC cleanup applied on notation import.
 */
export function normalizeAbcForImport(abc) {
  return convertSessionLineBreaks(abc)
}
