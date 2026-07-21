const STORAGE_PREFIX = 'abcbook-pdf-view:'

export function pdfViewPositionKey(tuneId, fileId) {
  return STORAGE_PREFIX + String(tuneId || '') + ':' + String(fileId || '')
}

export function loadPdfViewPosition(tuneId, fileId) {
  if (!tuneId || !fileId) return null
  try {
    const raw = localStorage.getItem(pdfViewPositionKey(tuneId, fileId))
    if (!raw) return null
    const parsed = JSON.parse(raw)
    const page = parseInt(parsed && parsed.page, 10)
    const scrollTop = parseInt(parsed && parsed.scrollTop, 10)
    if (!page || page < 1) return null
    return {
      page: page,
      scrollTop: scrollTop > 0 ? scrollTop : 0,
    }
  } catch (e) {
    return null
  }
}

export function savePdfViewPosition(tuneId, fileId, position) {
  if (!tuneId || !fileId || !position) return
  try {
    const page = parseInt(position.page, 10)
    if (!page || page < 1) return
    localStorage.setItem(pdfViewPositionKey(tuneId, fileId), JSON.stringify({
      page: page,
      scrollTop: Math.max(0, parseInt(position.scrollTop, 10) || 0),
    }))
  } catch (e) { /* ignore quota errors */ }
}

export function resolvePdfOpenPage(options) {
  const opts = options || {}
  const routeFileId = String(opts.routeFileId || '').trim()
  const routePage = parseInt(opts.routePage, 10)
  const fileId = String(opts.fileId || '').trim()
  if (routeFileId && routeFileId === fileId && routePage > 0) {
    return routePage
  }
  const metaPage = parseInt(opts.metaPage, 10)
  if (metaPage > 0) return metaPage
  const stored = loadPdfViewPosition(opts.tuneId, fileId)
  if (stored && stored.page > 0) return stored.page
  return 1
}
