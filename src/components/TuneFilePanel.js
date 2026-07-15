import { useEffect, useState } from 'react'
import {
  findTuneFileMeta,
  isPdfTuneFileType,
  resolveTuneFileBlob,
  updateTuneFileMeta,
} from '../tuneFiles'
import TuneFilePdfViewer from './TuneFilePdfViewer'

/**
 * Fit-to-height display of the tune's active File (image or PDF).
 */
export default function TuneFilePanel(props) {
  const {
    tune,
    token,
    driveApi,
    onTuneChange,
  } = props
  const activeId = tune && tune.activeFile ? tune.activeFile : ''
  const meta = findTuneFileMeta(tune, activeId)
  const [objectUrl, setObjectUrl] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

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

  return (
    <div className="tune-panel-file music-panels-fit-height" style={{ width: '100%' }}>
      <div className="tune-file-panel-label small text-muted px-2 py-1">{meta.name || 'File'}</div>
      {loading ? <div className="p-3">Loading file…</div> : null}
      {error ? <div className="p-3 text-danger">{error}</div> : null}
      {!loading && !error && objectUrl && isPdfTuneFileType(meta.type) ? (
        <div style={{ height: 'calc(100vh - 8rem)' }}>
          <TuneFilePdfViewer
            src={objectUrl}
            pageNumber={meta.pdfPage || 1}
            onPageChange={handlePageChange}
          />
        </div>
      ) : null}
      {!loading && !error && objectUrl && !isPdfTuneFileType(meta.type) ? (
        <div
          className="tune-file-image-wrap"
          style={{
            height: 'calc(100vh - 8rem)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            overflow: 'auto',
          }}
        >
          <img
            src={objectUrl}
            alt={meta.name || 'File'}
            style={{ maxHeight: '100%', maxWidth: '100%', width: 'auto', height: 'auto', objectFit: 'contain' }}
          />
        </div>
      ) : null}
    </div>
  )
}
