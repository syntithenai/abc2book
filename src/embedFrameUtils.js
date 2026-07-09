export const LYRICS_TOOLS_CLOSE_MESSAGE = 'abc2book-lyrics-tools-close'

/** Read embed=1 from the hash query (HashRouter), without waiting on React Router. */
export function readEmbedFromWindowHash() {
  if (typeof window === 'undefined') return false
  const hash = window.location.hash || ''
  const qIndex = hash.indexOf('?')
  if (qIndex < 0) return false
  return new URLSearchParams(hash.slice(qIndex + 1)).get('embed') === '1'
}

export function isEmbeddedAppFrame(searchParams) {
  if (searchParams && searchParams.get('embed') === '1') return true
  return readEmbedFromWindowHash()
}

export function buildLyricsToolsIframeSrc(query) {
  const q = encodeURIComponent(query || '')
  const params = 'embed=1&tab=lookup&q=' + q + '&toolQ=' + q
  if (typeof window === 'undefined') {
    return '#/lyrics?' + params
  }
  const base = window.location.origin + window.location.pathname + window.location.search
  return base + '#/lyrics?' + params
}
