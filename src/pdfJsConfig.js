import { pdfjs } from 'react-pdf'

/**
 * CRA emits import.meta.url workers under /static/media/*.js, which pdf.js
 * often cannot load as a Worker ("Setting up fake worker failed"). Serve the
 * worker from public/ instead (see scripts/copy-pdf-worker.js).
 */
export function resolvePdfWorkerSrc() {
  const pub = String(process.env.PUBLIC_URL || '').replace(/\/$/, '')
  if (!pub || pub === '.') return '/pdf.worker.min.js'
  return pub + '/pdf.worker.min.js'
}

pdfjs.GlobalWorkerOptions.workerSrc = resolvePdfWorkerSrc()

export { pdfjs }
