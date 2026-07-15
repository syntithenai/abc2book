import { pdfjs } from 'react-pdf'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString()

/**
 * Rasterize a PDF page to a PNG blob for the ink editor.
 */
export async function rasterizePdfPageToPng(pdfBlob, pageNumber, options) {
  const opts = options || {}
  const scale = opts.scale > 0 ? opts.scale : 2
  const page = Math.max(1, parseInt(pageNumber, 10) || 1)
  const data = await pdfBlob.arrayBuffer()
  const doc = await pdfjs.getDocument({ data: data }).promise
  const pdfPage = await doc.getPage(Math.min(page, doc.numPages))
  const viewport = pdfPage.getViewport({ scale: scale })
  const canvas = document.createElement('canvas')
  canvas.width = Math.ceil(viewport.width)
  canvas.height = Math.ceil(viewport.height)
  const ctx = canvas.getContext('2d')
  await pdfPage.render({ canvasContext: ctx, viewport: viewport }).promise
  return new Promise(function(resolve, reject) {
    canvas.toBlob(function(blob) {
      if (blob) resolve({ blob: blob, width: canvas.width, height: canvas.height, numPages: doc.numPages })
      else reject(new Error('PDF rasterize failed'))
    }, 'image/png')
  })
}
