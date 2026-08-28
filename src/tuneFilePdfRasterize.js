import { pdfjs } from './pdfJsConfig'

function renderPageToPngBlob(pdfPage, scale) {
  const viewport = pdfPage.getViewport({ scale: scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  return pdfPage.render({ canvasContext: ctx, viewport: viewport }).promise.then(function() {
    return new Promise(function(resolve, reject) {
      canvas.toBlob(function(blob) {
        // Drop canvas pixels ASAP
        canvas.width = 0
        canvas.height = 0
        if (blob) {
          resolve({
            blob: blob,
            width: Math.ceil(viewport.width),
            height: Math.ceil(viewport.height),
          })
        } else {
          reject(new Error('PDF rasterize failed'))
        }
      }, 'image/png')
    })
  })
}

/**
 * Rasterize a single PDF page to a PNG blob.
 */
export async function rasterizePdfPageToPng(pdfBlob, pageNumber, options) {
  const opts = options || {}
  const scale = opts.scale > 0 ? opts.scale : 2
  const page = Math.max(1, parseInt(pageNumber, 10) || 1)
  const data = await pdfBlob.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: data }).promise
  try {
    const pdfPage = await doc.getPage(Math.min(page, doc.numPages))
    const rendered = await renderPageToPngBlob(pdfPage, scale)
    return {
      blob: rendered.blob,
      width: rendered.width,
      height: rendered.height,
      numPages: doc.numPages,
    }
  } finally {
    try {
      if (doc && typeof doc.destroy === 'function') await doc.destroy()
    } catch (e) {
      // ignore
    }
  }
}

/**
 * Rasterize every page of a PDF once (single parse). Prefer this for multi-page imports.
 * @returns {Promise<{ numPages: number, pages: Array<{ page: number, blob: Blob, width: number, height: number }> }>}
 */
export async function rasterizePdfToPngPages(pdfBlob, options) {
  const opts = options || {}
  const scale = opts.scale > 0 ? opts.scale : 2
  const signal = opts.signal
  const data = await pdfBlob.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: data }).promise
  const pages = []
  try {
    const numPages = doc.numPages
    for (let p = 1; p <= numPages; p += 1) {
      if (signal && signal.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      if (typeof opts.onPage === 'function') {
        opts.onPage(p, numPages)
      }
      const pdfPage = await doc.getPage(p)
      const rendered = await renderPageToPngBlob(pdfPage, scale)
      pages.push({
        page: p,
        blob: rendered.blob,
        width: rendered.width,
        height: rendered.height,
      })
      // Let the UI paint progress between heavy pages
      await new Promise(function(resolve) { setTimeout(resolve, 0) })
    }
    return { numPages: numPages, pages: pages }
  } finally {
    try {
      if (doc && typeof doc.destroy === 'function') await doc.destroy()
    } catch (e) {
      // ignore
    }
  }
}
