import { useEffect, useRef, useState } from 'react'
import { Button } from 'react-bootstrap'
import { Document, Page, Outline, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { clampFileViewZoom } from './FileZoomControls'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString()

/**
 * Compact PDF viewer for tune Files panel: page nav + outline.
 * Fit mode and zoom come from the single-view toolbar (Fit height / file zoom).
 */
export default function TuneFilePdfViewer(props) {
  const {
    src,
    pageNumber,
    onPageChange,
    fitMode: fitModeProp,
    scale: scaleProp,
  } = props
  const wrapRef = useRef(null)
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(null)
  const fitMode = fitModeProp === 'width' ? 'width' : 'height'
  const scale = clampFileViewZoom(scaleProp != null ? scaleProp : 1)
  const pinchBaseRef = useRef(null)
  const [pinchScale, setPinchScale] = useState(null)
  const page = Math.max(1, parseInt(pageNumber, 10) || 1)
  const effectiveScale = pinchScale != null ? pinchScale : scale

  useEffect(function() {
    setPinchScale(null)
  }, [scale])

  useEffect(function() {
    function measure() {
      if (!wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      if (fitMode === 'width') {
        setPageWidth(Math.max(120, rect.width - 8))
      } else {
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
      pinchBaseRef.current = {
        dist: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY),
        scale: effectiveScale,
      }
    }
  }

  function onTouchMove(e) {
    if (e.touches.length === 2 && pinchBaseRef.current && pinchBaseRef.current.dist > 0) {
      e.preventDefault()
      const a = e.touches[0]
      const b = e.touches[1]
      const dist = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY)
      const next = pinchBaseRef.current.scale * (dist / pinchBaseRef.current.dist)
      setPinchScale(clampFileViewZoom(next))
    }
  }

  function onTouchEnd() {
    pinchBaseRef.current = null
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
      </div>
      <div
        className="tune-file-pdf-pages"
        style={{ flex: 1, overflow: 'auto', textAlign: 'left', touchAction: 'pan-x pan-y' }}
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
            <div className="tune-file-pdf-page-sizer" style={{ display: 'inline-block' }}>
              <Page
                pageNumber={Math.min(page, numPages || page)}
                width={pageWidth ? Math.max(120, pageWidth * effectiveScale) : undefined}
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
