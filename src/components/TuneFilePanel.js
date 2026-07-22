import { useEffect, useRef, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import {
  findTuneFileMeta,
  isPdfTuneFileType,
  normalizePdfSegments,
  resolveTuneFileBlob,
  updateTuneFileMeta,
} from '../tuneFiles'
import TuneFilePdfViewer from './TuneFilePdfViewer'
import { clampFileViewZoom } from './FileZoomControls'
import { NOTATION_FIT_VERTICAL } from '../gigNotationFit'
import {
  loadPdfViewPosition,
  resolvePdfOpenPage,
} from '../pdfViewPosition'

/**
 * Display the tune's active File (image or PDF) with fit-height / fit-width + zoom.
 * Zoomed content uses overflow scroll so left/right edges stay reachable.
 */
export default function TuneFilePanel(props) {
  const {
    tune,
    token,
    driveApi,
    onTuneChange,
    fitMode,
    zoom,
    tunebook,
    embedToolbarInMainBar,
    toolbarHost,
  } = props
  const activeId = tune && tune.activeFile ? tune.activeFile : ''
  const meta = findTuneFileMeta(tune, activeId)
  const [objectUrl, setObjectUrl] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const fitHeight = fitMode === NOTATION_FIT_VERTICAL || fitMode === 'height'
  const fileZoom = clampFileViewZoom(zoom)
  const [searchParams] = useSearchParams()
  const restoredPdfRef = useRef('')

  const routeFileId = String(searchParams.get('file') || '').trim()
  const routePage = parseInt(searchParams.get('page'), 10)
  const openedFromSearchRef = useRef(false)
  const lastMetaIdRef = useRef('')
  if (meta && meta.id !== lastMetaIdRef.current) {
    lastMetaIdRef.current = meta.id
    openedFromSearchRef.current = false
  }
  if (meta && routeFileId === meta.id && routePage > 0) {
    openedFromSearchRef.current = true
  }
  const openedFromSearch = openedFromSearchRef.current
  const storedPosition = meta && tune && tune.id
    ? loadPdfViewPosition(tune.id, meta.id)
    : null

  useEffect(function() {
    if (!meta || !isPdfTuneFileType(meta.type) || !onTuneChange || !tune || !tune.id) return
    if (openedFromSearch) return
    const restoreKey = tune.id + ':' + meta.id
    if (restoredPdfRef.current === restoreKey) return
    const openPage = resolvePdfOpenPage({
      tuneId: tune.id,
      fileId: meta.id,
      routeFileId: routeFileId,
      routePage: routePage,
      metaPage: meta.pdfPage,
    })
    restoredPdfRef.current = restoreKey
    if (openPage > 0 && openPage !== (meta.pdfPage || 1)) {
      onTuneChange(updateTuneFileMeta(tune, meta.id, { pdfPage: openPage }))
    }
  }, [
    meta && meta.id,
    meta && meta.pdfPage,
    tune && tune.id,
    onTuneChange,
    openedFromSearch,
    routeFileId,
    routePage,
  ])

  useEffect(function() {
    let revoked = null
    let cancelled = false
    if (!meta) {
      setObjectUrl(null)
      setError('')
      return undefined
    }
    setLoading(true)
    setError('')
    resolveTuneFileBlob(meta, tune.id, {
      token: token,
      accessToken: token,
      driveApi: driveApi,
    }).then(function(resolved) {
      if (cancelled) return
      const url = URL.createObjectURL(resolved.blob)
      revoked = url
      setObjectUrl(url)
      setLoading(false)
    }).catch(function(err) {
      if (cancelled) return
      setError(err && err.message ? err.message : 'Could not load file')
      setObjectUrl(null)
      setLoading(false)
    })
    return function() {
      cancelled = true
      if (revoked) URL.revokeObjectURL(revoked)
    }
  }, [meta && meta.id, meta && meta.googleId, tune && tune.id])

  if (!meta) return null

  function handlePageChange(page) {
    if (!onTuneChange) return
    onTuneChange(updateTuneFileMeta(tune, meta.id, { pdfPage: page }))
  }

  function handleFileNameChange(name) {
    if (!onTuneChange) return
    onTuneChange(updateTuneFileMeta(tune, meta.id, { name: name }))
  }

  const rootClass = 'tune-panel-file'
    + (fitHeight ? ' tune-file-fit-height music-panels-fit-height tune-panel-file--fit-height' : ' tune-file-fit-width')

  return (
    <div className={rootClass} style={{ width: '100%' }}>
      {loading ? <div className="p-3">Loading file…</div> : null}
      {error ? <div className="p-3 text-danger">{error}</div> : null}
      {!loading && !error && objectUrl && isPdfTuneFileType(meta.type) ? (
        <div
          className={'tune-file-pdf-wrap' + (fitHeight ? ' tune-file-pdf-wrap--fit-height' : ' tune-file-pdf-wrap--fit-width')}
        >
          <TuneFilePdfViewer
            src={objectUrl}
            pageNumber={meta.pdfPage || 1}
            onPageChange={handlePageChange}
            fitMode={fitHeight ? 'height' : 'width'}
            scale={fileZoom}
            pdfSegments={normalizePdfSegments(meta.pdfSegments)}
            menuIcon={tunebook && tunebook.icons ? tunebook.icons.menu : null}
            icons={tunebook && tunebook.icons ? tunebook.icons : null}
            tuneId={tune.id}
            fileId={meta.id}
            fileName={meta.name || 'File'}
            onFileNameChange={handleFileNameChange}
            embedToolbarInMainBar={!!embedToolbarInMainBar}
            toolbarHost={toolbarHost}
            restoreScrollTop={openedFromSearch ? 0 : (storedPosition && storedPosition.scrollTop) || 0}
            openedFromSearch={openedFromSearch}
          />
        </div>
      ) : null}
      {!loading && !error && objectUrl && !isPdfTuneFileType(meta.type) ? (
        <>
          <div className="tune-file-panel-label small text-muted px-2 py-1">{meta.name || 'File'}</div>
        <div
          className="tune-file-image-wrap"
          style={fitHeight ? {
            height: 'calc(100vh - 8rem)',
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
          } : {
            width: '100%',
            maxWidth: '100%',
            overflow: 'auto',
            WebkitOverflowScrolling: 'touch',
          }}
        >
          <div
            className="tune-file-image-sizer"
            style={{
              display: 'inline-block',
              minWidth: fileZoom > 1 ? (fileZoom * 100) + '%' : '100%',
              // Keep scrollable width/height rooted at top-left so zoom does not clip left edge.
              verticalAlign: 'top',
            }}
          >
            <img
              src={objectUrl}
              alt={meta.name || 'File'}
              className="tune-file-image"
              style={fitHeight && fileZoom === 1 ? {
                maxHeight: 'calc(100vh - 8rem)',
                maxWidth: '100%',
                width: 'auto',
                height: 'auto',
                objectFit: 'contain',
                display: 'block',
                margin: '0 auto',
              } : {
                width: (fileZoom * 100) + '%',
                maxWidth: 'none',
                height: 'auto',
                display: 'block',
              }}
            />
          </div>
        </div>
        </>
      ) : null}
    </div>
  )
}
