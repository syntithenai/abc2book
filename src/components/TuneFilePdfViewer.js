import { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import { Document, Page, Outline, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString()

/**
 * Compact PDF viewer for tune Files panel: fit-height, page nav, pinch zoom.
 */
export default function TuneFilePdfViewer(props) {
  const {
    src,
    pageNumber,
    onPageChange,
    tunebook,
  } = props
  const wrapRef = useRef(null)
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(null)
  const [scale, setScale] = useState(1)
  const [fitMode, setFitMode] = useState('height') // height | width
  const pinchRef = useRef(null)
  const page = Math.max(1, parseInt(pageNumber, 10) || 1)

  useEffect(function() {
    function measure() {
      if (!wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      if (fitMode === 'width') {
        setPageWidth(Math.max(120, rect.width - 8))
      } else {
        // Fit height: approximate page width from panel height assuming A4-ish ratio
        const h = Math.max(120, rect.height - 48)
        setPageWidth(Math.max(120, h * 0.707))
      }
    }
    measure()
    window.addEventListener('resize', measure)
    return function() { window.removeEventListener('resize', measure) }
  }, [fitMode, src])

  function setPage(n) {
    if (!onPageChange) return
    const next = Math.min(Math.max(1, n), numPages || n)
    onPageChange(next)
  }

  function onTouchStart(e) {
    if (e.touches.length === 2) {
      const a = e.touches[0]
      const b = e.touches[1]
      pinchRef.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        scale: scale,
      }
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && pinchRef.current && pinchRef.current.dist > 0) {
      e.preventDefault()
      const a = e.touches[0]
      const b = e.touches[1]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const next = pinchRef.current.scale * (dist / pinchRef.current.dist)
      setScale(Math.min(4, Math.max(0.5, next)))
    }
  }

  function onTouchEnd() {
    if (!pinchRef.current) return
    // keep scale; clear pinch state when fewer than 2 touches
    pinchRef.current = null
  }

  return (
    <div className="tune-file-pdf-viewer" ref={wrapRef} style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div className="tune-file-pdf-toolbar d-flex align-items-center gap-2 px-2 py-1">
        <Button size="sm" variant="outline-secondary" onClick={function() { setPage(page - 1) }} disabled={page <= 1}>
          Prev
        </Button>
        <span className="small">
          <input
            type="number"
            value={page}
            min={1}
            max={numPages || 1}
            onChange={function(e) { setPage(parseInt(e.target.value, 10) || 1) }}
            style={{ width: '3.5em' }}
          />
          {' / '}{numPages || '…'}
        </span>
        <Button size="sm" variant="outline-secondary" onClick={function() { setPage(page + 1) }} disabled={!!numPages && page >= numPages}>
          Next
        </Button>
        <Button
          size="sm"
          variant={fitMode === 'height' ? 'primary' : 'outline-secondary'}
          onClick={function() { setFitMode('height'); setScale(1) }}
        >
          Fit height
        </Button>
        <Button
          size="sm"
          variant={fitMode === 'width' ? 'primary' : 'outline-secondary'}
          onClick={function() { setFitMode('width'); setScale(1) }}
        >
          Fit width
        </Button>
        <Button size="sm" variant="outline-secondary" onClick={function() { setScale(1) }}>
          Reset zoom
        </Button>
      </div>
      <div
        className="tune-file-pdf-pages"
        style={{ flex: 1, overflow: 'auto', textAlign: 'center', touchAction: 'pan-y' }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
      >
        {src ? (
          <Document
            file={src}
            onLoadSuccess={function(info) { setNumPages(info.numPages) }}
            loading={<div className="p-3">Loading PDF…</div>}
            error={<div className="p-3 text-danger">Could not load PDF</div>}
          >
            <div style={{ transform: 'scale(' + scale + ')', transformOrigin: 'top center', display: 'inline-block' }}>
              <Page
                pageNumber={Math.min(page, numPages || page)}
                width={pageWidth || undefined}
                renderTextLayer={true}
                renderAnnotationLayer={true}
              />
            </div>
            {numPages > 1 ? (
              <details className="text-start px-2 py-1">
                <summary>Outline</summary>
                <Outline onItemClick={function(item) {
                  if (item && item.pageNumber) setPage(item.pageNumber)
                }} />
              </details>
            ) : null}
          </Document>
        ) : null}
      </div>
    </div>
  )
}
