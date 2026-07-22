import { useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Form, Modal } from 'react-bootstrap'
import { Document, Page, Outline, pdfjs } from 'react-pdf'
import 'react-pdf/dist/Page/TextLayer.css'
import 'react-pdf/dist/Page/AnnotationLayer.css'
import { clampFileViewZoom } from './FileZoomControls'
import TuneFilePdfToolbar from './TuneFilePdfToolbar'
import { savePdfViewPosition } from '../pdfViewPosition'
import { computePdfSpreadLayout } from '../pdfSpreadLayout'
import {
  collectPdfSegmentStartPages,
  computeAlignedNextPage,
  computeAlignedPrevPage,
} from '../pdfSpreadNavigation'

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.js',
  import.meta.url,
).toString()

function normalizeIndexFilter(text) {
  return String(text || '').trim().toLowerCase()
}

function formatSegmentPageRange(segment) {
  const start = Math.max(1, parseInt(segment && segment.page, 10) || 1)
  const end = Math.max(start, parseInt(segment && segment.endPage, 10) || start)
  if (end > start) return start + '–' + end
  return String(start)
}

function PdfIndexModal(props) {
  const {
    show,
    onHide,
    segments,
    onJump,
    hasNativeOutline,
  } = props
  const [filter, setFilter] = useState('')
  const hasIndexedContents = Array.isArray(segments) && segments.length > 0
  const filterText = normalizeIndexFilter(filter)
  const filteredSegments = useMemo(function() {
    if (!hasIndexedContents) return []
    if (!filterText) return segments
    return segments.filter(function(segment) {
      return normalizeIndexFilter(segment && segment.title).indexOf(filterText) !== -1
    })
  }, [segments, filterText, hasIndexedContents])

  useEffect(function() {
    if (!show) setFilter('')
  }, [show])

  return (
    <Modal show={show} onHide={onHide} centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>PDF Index</Modal.Title>
      </Modal.Header>
      <Modal.Body className="tune-file-pdf-index-modal">
        {hasIndexedContents ? (
          <>
            <Form.Control
              type="search"
              size="sm"
              className="tune-file-pdf-index-search mb-2"
              placeholder="Search tunes in this PDF"
              value={filter}
              autoFocus
              onChange={function(e) { setFilter(e.target.value) }}
            />
            {filteredSegments.length > 0 ? (
              <div className="tune-file-pdf-index-list" role="list">
                {filteredSegments.map(function(segment, index) {
                  return (
                    <div
                      key={(segment.title || 'segment') + '-' + segment.page + '-' + index}
                      role="listitem"
                      className="tune-file-pdf-index-item"
                      onClick={function() { onJump(segment.page) }}
                    >
                      <span className="tune-file-pdf-index-title">{segment.title}</span>
                      <span className="tune-file-pdf-index-page text-muted">{formatSegmentPageRange(segment)}</span>
                    </div>
                  )
                })}
              </div>
            ) : (
              <p className="text-muted small mb-0">No tunes match &ldquo;{filter}&rdquo;.</p>
            )}
          </>
        ) : hasNativeOutline ? (
          <div className="tune-file-pdf-native-outline">
            <Outline onItemClick={function(item) {
              if (item && item.pageNumber) onJump(item.pageNumber)
            }} />
          </div>
        ) : (
          <p className="text-muted small mb-0">
            No index yet. Use the search icon on the file in Snapshots to index tune titles from this PDF.
          </p>
        )}
      </Modal.Body>
    </Modal>
  )
}

/**
 * Compact PDF viewer for tune Files panel: page nav + multi-column spread in fit-height mode.
 * Fit mode and zoom come from the single-view toolbar (Fit height / file zoom).
 */
export default function TuneFilePdfViewer(props) {
  const {
    src,
    pageNumber,
    onPageChange,
    fitMode: fitModeProp,
    scale: scaleProp,
    pdfSegments,
    menuIcon,
    icons,
    tuneId,
    fileId,
    restoreScrollTop,
    openedFromSearch,
    fileName,
    onFileNameChange,
    embedToolbarInMainBar,
    toolbarHost,
  } = props
  const wrapRef = useRef(null)
  const pagesRef = useRef(null)
  const [numPages, setNumPages] = useState(0)
  const [pageWidth, setPageWidth] = useState(null)
  const [spreadCount, setSpreadCount] = useState(1)
  const [showOutline, setShowOutline] = useState(false)
  const fitMode = fitModeProp === 'width' ? 'width' : 'height'
  const scale = clampFileViewZoom(scaleProp != null ? scaleProp : 1)
  const pinchBaseRef = useRef(null)
  const [pinchScale, setPinchScale] = useState(null)
  const page = Math.max(1, parseInt(pageNumber, 10) || 1)
  const effectiveScale = pinchScale != null ? pinchScale : scale
  const segments = Array.isArray(pdfSegments) ? pdfSegments : []
  const hasIndexedContents = segments.length > 0
  const segmentStartPages = useMemo(function() {
    return collectPdfSegmentStartPages(segments)
  }, [segments])
  const multiSpread = spreadCount > 1 && numPages > 1
  const spreadPages = multiSpread
    ? Array.from({ length: spreadCount }, function(_, offset) { return page + offset }).filter(function(pageNum) {
      return pageNum >= 1 && (!numPages || pageNum <= numPages)
    })
    : [Math.min(page, numPages || page)]
  const lastPageRef = useRef(page)
  const restoredScrollRef = useRef(false)
  const scrollSaveTimerRef = useRef(null)
  const spreadCountRef = useRef(spreadCount)
  const pageRef = useRef(page)
  const numPagesRef = useRef(numPages)
  const segmentStartsRef = useRef(segmentStartPages)
  const edgeScrollRef = useRef({ direction: null, at: 0 })
  spreadCountRef.current = spreadCount
  pageRef.current = page
  numPagesRef.current = numPages
  segmentStartsRef.current = segmentStartPages

  function pageStep() {
    return Math.max(1, spreadCountRef.current)
  }

  function setPage(n) {
    if (!onPageChange) return
    const maxPage = numPagesRef.current > 0 ? numPagesRef.current : n
    const next = Math.min(Math.max(1, n), maxPage)
    onPageChange(next)
  }

  function goToPrevSpread() {
    setPage(computeAlignedPrevPage(
      pageRef.current,
      pageStep(),
      numPagesRef.current,
      segmentStartsRef.current
    ))
  }

  function goToNextSpread() {
    setPage(computeAlignedNextPage(
      pageRef.current,
      pageStep(),
      numPagesRef.current,
      segmentStartsRef.current
    ))
  }

  useEffect(function() {
    setPinchScale(null)
  }, [scale])

  useEffect(function() {
    restoredScrollRef.current = false
    lastPageRef.current = page
  }, [src, fileId])

  useEffect(function() {
    if (!pagesRef.current) return
    if (!restoredScrollRef.current && !openedFromSearch && restoreScrollTop > 0) {
      pagesRef.current.scrollTop = restoreScrollTop
      restoredScrollRef.current = true
      lastPageRef.current = page
      return
    }
    if (page !== lastPageRef.current) {
      pagesRef.current.scrollTop = 0
      lastPageRef.current = page
      restoredScrollRef.current = true
    }
  }, [page, src, spreadCount, restoreScrollTop, openedFromSearch])

  useEffect(function() {
    const node = pagesRef.current
    if (!node || !tuneId || !fileId) return undefined

    function persistScroll() {
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
      scrollSaveTimerRef.current = setTimeout(function() {
        savePdfViewPosition(tuneId, fileId, {
          page: page,
          scrollTop: node.scrollTop || 0,
        })
      }, 200)
    }

    node.addEventListener('scroll', persistScroll, { passive: true })
    return function() {
      node.removeEventListener('scroll', persistScroll)
      if (scrollSaveTimerRef.current) clearTimeout(scrollSaveTimerRef.current)
    }
  }, [tuneId, fileId, page])

  useEffect(function() {
    if (!tuneId || !fileId) return
    savePdfViewPosition(tuneId, fileId, {
      page: page,
      scrollTop: pagesRef.current ? pagesRef.current.scrollTop || 0 : 0,
    })
  }, [tuneId, fileId, page])

  useEffect(function() {
    function measure() {
      if (!wrapRef.current) return
      const rect = wrapRef.current.getBoundingClientRect()
      const layout = computePdfSpreadLayout({
        containerWidth: rect.width,
        containerHeight: rect.height,
        fitMode: fitMode,
        toolbarEmbedded: !!embedToolbarInMainBar,
      })
      setSpreadCount(layout.spreadCount)
      setPageWidth(layout.pageWidth)
    }
    measure()
    window.addEventListener('resize', measure)
    return function() { window.removeEventListener('resize', measure) }
  }, [fitMode, src, embedToolbarInMainBar])

  useEffect(function() {
    edgeScrollRef.current = { direction: null, at: 0 }
  }, [page, src, fileId])

  useEffect(function() {
    const node = pagesRef.current
    if (!node) return undefined

    const EDGE_SCROLL_CHAIN_MS = 300
    const SCROLL_EDGE_PX = 2

    function isAtTop(el) {
      return el.scrollTop <= SCROLL_EDGE_PX
    }

    function isAtBottom(el) {
      return el.scrollTop + el.clientHeight >= el.scrollHeight - SCROLL_EDGE_PX
    }

    function handleWheel(e) {
      const now = Date.now()
      const edge = edgeScrollRef.current

      if (e.deltaY > 0 && isAtBottom(node)) {
        if (edge.direction === 'down' && now - edge.at <= EDGE_SCROLL_CHAIN_MS) {
          e.preventDefault()
          edgeScrollRef.current = { direction: null, at: 0 }
          if (pageRef.current < (numPagesRef.current || pageRef.current)) {
            goToNextSpread()
          }
          return
        }
        edgeScrollRef.current = { direction: 'down', at: now }
        return
      }

      if (e.deltaY < 0 && isAtTop(node)) {
        if (edge.direction === 'up' && now - edge.at <= EDGE_SCROLL_CHAIN_MS) {
          e.preventDefault()
          edgeScrollRef.current = { direction: null, at: 0 }
          if (pageRef.current > 1) {
            goToPrevSpread()
          }
          return
        }
        edgeScrollRef.current = { direction: 'up', at: now }
        return
      }

      edgeScrollRef.current = { direction: null, at: 0 }
    }

    node.addEventListener('wheel', handleWheel, { passive: false })
    return function() {
      node.removeEventListener('wheel', handleWheel)
    }
  }, [src, fileId, numPages])

  function jumpToPage(nextPage) {
    setPage(nextPage)
    setShowOutline(false)
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

  const renderedWidth = pageWidth ? Math.max(120, pageWidth * effectiveScale) : undefined
  const spreadClass = multiSpread
    ? (' tune-file-pdf-spread--' + spreadCount)
    : ''

  const toolbar = (
    <TuneFilePdfToolbar
      fileName={fileName}
      page={page}
      numPages={numPages}
      pageStep={pageStep()}
      onPageChange={setPage}
      onPrevSpread={goToPrevSpread}
      onNextSpread={goToNextSpread}
      onFileNameChange={onFileNameChange}
      onOpenIndex={function() { setShowOutline(true) }}
      menuIcon={menuIcon}
      icons={icons}
      embedded={!!embedToolbarInMainBar}
    />
  )

  return (
    <div className="tune-file-pdf-viewer" ref={wrapRef}>
      {embedToolbarInMainBar && toolbarHost
        ? createPortal(toolbar, toolbarHost)
        : !embedToolbarInMainBar
          ? toolbar
          : null}

      <div
        ref={pagesRef}
        className={'tune-file-pdf-pages' + (multiSpread ? ' tune-file-pdf-pages--spread' : '')}
        style={{ touchAction: 'pan-x pan-y' }}
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
            <PdfIndexModal
              show={showOutline}
              onHide={function() { setShowOutline(false) }}
              segments={segments}
              onJump={jumpToPage}
              hasNativeOutline={!hasIndexedContents && numPages > 1}
            />
            <div className={'tune-file-pdf-spread' + spreadClass}>
              {spreadPages.map(function(pageNum) {
                return (
                  <div key={'pdf-page-wrap-' + pageNum} className="tune-file-pdf-page-sizer" data-pdf-page={pageNum}>
                    <Page
                      pageNumber={pageNum}
                      width={renderedWidth}
                      renderTextLayer={true}
                      renderAnnotationLayer={true}
                    />
                  </div>
                )
              })}
            </div>
          </Document>
        ) : null}
      </div>
    </div>
  )
}
