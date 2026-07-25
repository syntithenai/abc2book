/**
 * Normalize lesson image URLs (Wikipedia / geograph) for reliable loading.
 */
export function lessonImageSrc(url) {
  const raw = String(url || '').trim()
  if (!raw) return ''
  try {
    const parsed = new URL(raw, typeof window !== 'undefined' ? window.location.href : 'https://example.com')
    if (parsed.hostname.endsWith('wikipedia.org') && parsed.pathname.indexOf('/Special:FilePath/') !== -1) {
      const file = decodeURIComponent(parsed.pathname.split('/Special:FilePath/')[1] || '')
      if (file) {
        const encoded = encodeURIComponent(file.replace(/ /g, '_'))
        const width = parsed.searchParams.get('width')
        const base = 'https://commons.wikimedia.org/wiki/Special:FilePath/' + encoded
        return width ? base + '?width=' + encodeURIComponent(width) : base
      }
    }
    return parsed.toString()
  } catch (e) {
    return raw
  }
}
