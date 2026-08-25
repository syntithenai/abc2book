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
 * Music-body lines only — skip ABC headers (T:/W:/…), %% directives, and comments.
 * Lyric punctuation like "grace!" must not look like Session ! line breaks.
 */
function isMusicBodyLine(line) {
  const t = String(line || '').trim()
  if (!t) return false
  if (t.charAt(0) === '%') return false
  if (/^[A-Za-z]:/.test(t)) return false
  return true
}

function musicBodyText(abc) {
  const text = String(abc || '')
  if (!text) return ''
  if (text.indexOf('\n') < 0 && text.indexOf('\r') < 0) {
    return isMusicBodyLine(text) ? text : ''
  }
  return text.split(/\r?\n/).filter(isMusicBodyLine).join('\n')
}

/**
 * True when ABC likely uses The Session / folktune ! line-break markers (not only !word! annotations).
 */
export function needsSessionLineBreakFix(abc) {
  const text = musicBodyText(abc)
  if (!text) return false
  if (/\|!/.test(text)) return true
  const protectedText = protectAbcAnnotations(text).text
  return /!(?![A-Za-z])/.test(protectedText)
}

/**
 * Convert bare ! markers to newlines; preserves !annotation! pairs.
 * Only rewrites music-body lines so W: lyric "!" punctuation is left alone.
 */
export function convertSessionLineBreaks(abc) {
  const text = String(abc || '')
  if (!needsSessionLineBreakFix(text)) return text
  return text.split(/(\r?\n)/).map(function(part) {
    if (part === '\n' || part === '\r\n') return part
    if (!isMusicBodyLine(part)) return part
    const protectedParts = protectAbcAnnotations(part)
    return restoreAbcAnnotations(
      protectedParts.text.replace(/!/g, '\n'),
      protectedParts.annotations
    )
  }).join('')
}

/**
 * Safe ABC cleanup applied on notation import.
 */
export function normalizeAbcForImport(abc) {
  return convertSessionLineBreaks(abc)
}
