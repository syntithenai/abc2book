import { useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup, Dropdown, Spinner } from 'react-bootstrap'
import html2canvas from 'html2canvas'
import { toast } from 'react-toastify'
import SheetImageCameraModal from './SheetImageCameraModal'
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal'
import DriveFilePickerModal from './DriveFilePickerModal'
import FileDrawModal from './FileDrawModal'
import useMediaResolverHealth from '../useMediaResolverHealth'
import {
  createTuneFileFromBlob,
  deleteTuneFile,
  findTuneFileMeta,
  getTuneFiles,
  isPdfTuneFileType,
  resolveTuneFileBlob,
  setActiveTuneFile,
  updateTuneFileBlob,
} from '../tuneFiles'
import { rasterizePdfPageToPng } from '../tuneFilePdfRasterize'
import {
  enqueueFileOcrJob,
  findFileOcrJobForFile,
  subscribeFileOcrJobs,
} from '../fileOcrJobs'

function isAcceptableFile(file) {
  if (!file) return false
  const type = String(file.type || '').toLowerCase()
  const name = String(file.name || '').toLowerCase()
  if (type === 'application/pdf' || name.endsWith('.pdf')) return true
  if (type.indexOf('image/') === 0 && type !== 'image/svg+xml') return true
  return false
}

export default function FileControls(props) {
  const {
    tune,
    tunebook,
    token,
    driveApi,
    requestGoogleScopes,
    login,
    captureRootSelector,
    onTuneChange,
    stopMenuClose,
    variant, // 'toolbar' | 'menu'
  } = props

  const { available: resolverAvailable } = useMediaResolverHealth()
  const [busy, setBusy] = useState(false)
  const [ocrTick, setOcrTick] = useState(0)
  const [drawState, setDrawState] = useState(null) // { meta, blob, fromPdf }
  const [showCamera, setShowCamera] = useState(false)
  const [showPhotos, setShowPhotos] = useState(false)
  const fileInputRef = useRef(null)

  useEffect(function() {
    return subscribeFileOcrJobs(function() {
      setOcrTick(function(v) { return v + 1 })
    })
  }, [])

  const files = getTuneFiles(tune)
  const activeId = tune && tune.activeFile ? tune.activeFile : ''
  const hasActive = !!findTuneFileMeta(tune, activeId)

  function stop(e) {
    if (!stopMenuClose) return
    if (e) {
      e.preventDefault()
      e.stopPropagation()
    }
  }

  function persistTune(nextTune) {
    if (onTuneChange) onTuneChange(nextTune)
    if (tunebook && typeof tunebook.saveTune === 'function') {
      tunebook.saveTune(nextTune)
    }
  }

  async function attachBlob(blob, name, type, source) {
    if (!tune || !blob) return null
    setBusy(true)
    try {
      const result = await createTuneFileFromBlob({
        tune: tune,
        blob: blob,
        name: name,
        type: type || blob.type || 'image/png',
        source: source || 'file',
        token: token,
        driveApi: driveApi,
        uploadToDrive: !!(token && driveApi),
        setActive: true,
      })
      persistTune(result.tune)
      if (resolverAvailable) {
        try {
          enqueueFileOcrJob({
            tune: result.tune,
            meta: result.meta,
            token: token,
            accessToken: token && token.access_token ? token.access_token : token,
            driveApi: driveApi,
          })
          toast.success('File saved — OCR started in background')
        } catch (e) {
          toast.success('File saved')
        }
      } else {
        toast.success('File saved')
      }
      return result
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Could not save file')
      return null
    } finally {
      setBusy(false)
    }
  }

  async function handleTakeSnapshot() {
    stop()
    const root = document.querySelector(captureRootSelector || '.music-single-panels')
    if (!root) {
      toast.error('Nothing to capture')
      return
    }
    setBusy(true)
    try {
      const canvas = await html2canvas(root, {
        backgroundColor: '#ffffff',
        useCORS: true,
        logging: false,
      })
      const blob = await new Promise(function(resolve) {
        canvas.toBlob(resolve, 'image/png')
      })
      if (!blob) throw new Error('Capture failed')
      await attachBlob(blob, 'Snapshot ' + new Date().toLocaleString(), 'image/png', 'capture')
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Capture failed')
      setBusy(false)
    }
  }

  async function handleLocalFile(file) {
    if (!isAcceptableFile(file)) {
      toast.error('Choose an image or PDF')
      return
    }
    await attachBlob(file, file.name || 'File', file.type, 'file')
  }

  async function openEdit(meta) {
    stop()
    if (!meta) return
    setBusy(true)
    try {
      const resolved = await resolveTuneFileBlob(meta, tune.id, {
        token: token,
        driveApi: driveApi,
      })
      let blob = resolved.blob
      let fromPdf = false
      if (isPdfTuneFileType(meta.type)) {
        const ras = await rasterizePdfPageToPng(blob, meta.pdfPage || 1, { scale: 2 })
        blob = ras.blob
        fromPdf = true
      }
      setDrawState({ meta: meta, blob: blob, fromPdf: fromPdf })
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Could not open file')
    } finally {
      setBusy(false)
    }
  }

  async function saveDrawing(blob, opts) {
    const submitOcr = !!(opts && opts.submitOcr)
    if (!drawState || !drawState.meta) return
    setBusy(true)
    try {
      let nextTune = tune
      let meta = drawState.meta
      if (drawState.fromPdf) {
        const name = (meta.name || 'File') + ' p' + (meta.pdfPage || 1) + ' notes'
        const created = await createTuneFileFromBlob({
          tune: tune,
          blob: blob,
          name: name,
          type: 'image/png',
          source: 'capture',
          token: token,
          driveApi: driveApi,
          uploadToDrive: !!(token && driveApi),
          setActive: true,
        })
        nextTune = created.tune
        meta = created.meta
      } else {
        const updated = await updateTuneFileBlob({
          tune: tune,
          fileId: meta.id,
          blob: blob,
          type: 'image/png',
          token: token,
          driveApi: driveApi,
          uploadToDrive: !!(token && driveApi),
        })
        nextTune = updated.tune
        meta = findTuneFileMeta(nextTune, meta.id)
      }
      persistTune(nextTune)
      if (submitOcr && resolverAvailable && meta) {
        enqueueFileOcrJob({
          tune: nextTune,
          meta: meta,
          token: token,
          accessToken: token && token.access_token ? token.access_token : token,
          driveApi: driveApi,
        })
        toast.success('Drawing saved — OCR started')
      } else {
        toast.success('Drawing saved')
      }
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Save failed')
    } finally {
      setBusy(false)
      setDrawState(null)
    }
  }

  function selectFile(fileId) {
    stop()
    persistTune(setActiveTuneFile(tune, fileId))
  }

  function clearActive() {
    stop()
    persistTune(setActiveTuneFile(tune, ''))
  }

  async function removeFile(meta) {
    stop()
    if (!meta || !window.confirm('Delete file "' + (meta.name || 'File') + '"?')) return
    setBusy(true)
    try {
      const next = await deleteTuneFile(tune, meta.id, { driveApi: driveApi })
      persistTune(next)
      toast.success('File deleted')
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Delete failed')
    } finally {
      setBusy(false)
    }
  }

  function submitOcr(meta) {
    stop()
    if (!resolverAvailable || !meta) return
    const existing = findFileOcrJobForFile(tune.id, meta.id)
    if (existing && (existing.status === 'pending' || existing.status === 'running')) {
      toast.info('OCR already in progress')
      return
    }
    enqueueFileOcrJob({
      tune: tune,
      meta: meta,
      token: token,
      accessToken: token && token.access_token ? token.access_token : token,
      driveApi: driveApi,
    })
    toast.success('OCR submitted for review')
    setOcrTick(function(v) { return v + 1 })
  }

  void ocrTick

  const menuItems = (
    <>
      <Dropdown.Item as="button" disabled={busy} onClick={handleTakeSnapshot}>
        Take snapshot
      </Dropdown.Item>
      <Dropdown.Item as="button" disabled={busy} onClick={function() {
        stop()
        if (fileInputRef.current) fileInputRef.current.click()
      }}>
        Choose file…
      </Dropdown.Item>
      <Dropdown.Item as="button" disabled={busy} onClick={function() {
        stop()
        setShowCamera(true)
      }}>
        Capture photo
      </Dropdown.Item>
      <Dropdown.Item as="button" disabled={busy} onClick={function() {
        stop()
        setShowPhotos(true)
      }}>
        Google Photos
      </Dropdown.Item>
      <div className="px-2 py-1" onClick={function(e) { e.stopPropagation() }}>
        <DriveFilePickerModal
          label="Google Drive"
          token={token}
          requestGoogleScopes={requestGoogleScopes}
          login={login}
          driveApi={driveApi}
          mimeTypes="image/png,image/jpeg,image/webp,application/pdf"
          onFile={function(file) {
            if (!isAcceptableFile(file)) {
              toast.error('Choose an image or PDF')
              return
            }
            attachBlob(file, file.name || 'Drive file', file.type, 'drive')
          }}
        />
      </div>
      <Dropdown.Divider />
      <Dropdown.Header>Files</Dropdown.Header>
      {files.length === 0 ? (
        <Dropdown.ItemText className="text-muted small">No files yet</Dropdown.ItemText>
      ) : files.map(function(meta) {
        const job = findFileOcrJobForFile(tune && tune.id, meta.id)
        const active = meta.id === activeId
        return (
          <div key={meta.id} className="tune-file-menu-row d-flex align-items-center gap-1 px-2 py-1">
            <Button
              size="sm"
              variant={active ? 'primary' : 'outline-secondary'}
              className="flex-grow-1 text-start text-truncate"
              onClick={function() { selectFile(meta.id) }}
              title={meta.name}
            >
              {meta.name || 'File'}
              {job && (job.status === 'pending' || job.status === 'running') ? ' …' : ''}
              {job && job.status === 'ready' ? ' ✓' : ''}
            </Button>
            <Button
              size="sm"
              variant="outline-secondary"
              title="Edit"
              onClick={function() { openEdit(meta) }}
              disabled={busy}
            >
              {tunebook.icons.pencil}
            </Button>
            {resolverAvailable ? (
              <Button
                size="sm"
                variant="outline-secondary"
                title="Submit for OCR"
                onClick={function() { submitOcr(meta) }}
                disabled={busy}
              >
                OCR
              </Button>
            ) : null}
            <Button
              size="sm"
              variant="outline-danger"
              title="Delete"
              onClick={function() { removeFile(meta) }}
              disabled={busy}
            >
              ×
            </Button>
          </div>
        )
      })}
      <Dropdown.Divider />
      <Dropdown.Item as="button" active={!hasActive} onClick={clearActive}>
        None
      </Dropdown.Item>
    </>
  )

  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,.pdf,application/pdf"
        style={{ display: 'none' }}
        onChange={function(e) {
          const file = e.target.files && e.target.files[0]
          e.target.value = ''
          if (file) handleLocalFile(file)
        }}
      />

      {variant === 'menu' ? (
        <div className="file-controls-menu" onClick={function(e) { e.stopPropagation() }} onMouseDown={stop}>
          <div className="fw-semibold small mb-1">
            {tunebook.icons.tunefile} Files
            {busy ? <Spinner animation="border" size="sm" className="ms-2" /> : null}
          </div>
          <div className="d-grid gap-1">{menuItems}</div>
        </div>
      ) : (
        <Dropdown align="end" autoClose="outside" className="file-controls-dropdown">
          <Dropdown.Toggle
            size="sm"
            variant={hasActive ? 'primary' : 'outline-secondary'}
            id="tune-files-dropdown"
            aria-label="Files"
            title="Files"
            disabled={busy}
          >
            <span className="display-mode-group-icon">{tunebook.icons.tunefile}</span>
            <span className="display-mode-group-label">Files</span>
            {busy ? <Spinner animation="border" size="sm" className="ms-1" /> : null}
          </Dropdown.Toggle>
          <Dropdown.Menu className="file-controls-menu-panel" style={{ minWidth: '18rem' }}>
            {menuItems}
          </Dropdown.Menu>
        </Dropdown>
      )}

      <FileDrawModal
        show={!!drawState}
        onHide={function() { setDrawState(null) }}
        imageBlob={drawState && drawState.blob}
        title={drawState && drawState.meta ? ('Edit — ' + (drawState.meta.name || 'File')) : 'Edit file'}
        tunebook={tunebook}
        resolverAvailable={resolverAvailable}
        onSave={function(blob) { return saveDrawing(blob, { submitOcr: false }) }}
        onSaveAndOcr={function(blob) { return saveDrawing(blob, { submitOcr: true }) }}
      />

      <SheetImageCameraModal
        show={showCamera}
        onHide={function() { setShowCamera(false) }}
        onCapture={function(file) {
          setShowCamera(false)
          attachBlob(file, file.name || 'Photo.jpg', file.type || 'image/jpeg', 'camera')
        }}
      />
      <SheetImageGooglePhotosModal
        show={showPhotos}
        onHide={function() { setShowPhotos(false) }}
        token={token}
        requestGoogleScopes={requestGoogleScopes}
        onLogin={login}
        onSelectFile={function(file) {
          setShowPhotos(false)
          attachBlob(file, file.name || 'Photo.jpg', file.type || 'image/jpeg', 'photos')
        }}
      />
    </>
  )
}
