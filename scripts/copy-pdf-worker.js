/**
 * Ensure pdf.js worker is available at PUBLIC_URL/pdf.worker.min.js
 * (CRA's hashed /static/media worker URL breaks Worker loading).
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const src = path.join(root, 'node_modules', 'pdfjs-dist', 'build', 'pdf.worker.min.js')
const dest = path.join(root, 'public', 'pdf.worker.min.js')

if (!fs.existsSync(src)) {
  console.warn('[copy-pdf-worker] missing', src)
  process.exit(0)
}

fs.mkdirSync(path.dirname(dest), { recursive: true })
fs.copyFileSync(src, dest)
console.log('[copy-pdf-worker] wrote', path.relative(root, dest))
