import { useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup, Dropdown, Spinner } from 'react-bootstrap'
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
  flushPendingDriveDeletes,
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
import { captureTuneChartPanels } from '../tuneFileScreenshot'
import {
  consumeFilePickerIntent,
  writeFilePickerIntent,
} from '../filePickerIntent'
import { indexPdfTuneFile, tuneFileNeedsPdfIndexing } from '../pdfSnapshotIndex'

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
  const [photosAutoStart, setPhotosAutoStart] = useState(false)
  const [driveOpenToken, setDriveOpenToken] = useState(0)
  const fileInputRef = useRef(null)
  const resumeDoneRef = useRef(false)

  useEffect(function() {
    return subscribeFileOcrJobs(function() {
      setOcrTick(function(v) { return v + 1 })
    })
  }, [])

  // Resume Photos/Drive picker after OAuth consent returns focus.
  useEffect(function() {
    if (resumeDoneRef.current) return
    if (!tune || !tune.id) return
    const kind = consumeFilePickerIntent(tune.id)
    if (!kind) return
    resumeDoneRef.current = true
    if (kind === 'photos') {
      setPhotosAutoStart(true)
      setShowPhotos(true)
      return
    }
    if (kind === 'drive') {
      setDriveOpenToken(function(v) { return v + 1 })
    }
  }, [tune && tune.id, token && token.access_token, requestGoogleScopes])

  // Flush queued Drive file deletes when signed in / back online.
  useEffect(function() {
    if (!token || !driveApi) return undefined
    flushPendingDriveDeletes({ token: token, driveApi: driveApi }).catch(function() { /* ignore */ })
    function onOnline() {
      flushPendingDriveDeletes({ token: token, driveApi: driveApi }).catch(function() { /* ignore */ })
    }
    window.addEventListener('online', onOnline)
    return function() {
      window.removeEventListener('online', onOnline)
    }
  }, [token && token.access_token, driveApi])

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

  async function indexPdfMeta(meta, blob, fileName) {
    if (!tune || !meta || !blob) return tune
    try {
      const nextTune = await indexPdfTuneFile(tune, meta.id, blob, {
        fileName: fileName || meta.name || 'sheet.pdf',
        type: meta.type || 'application/pdf',
        resolverAvailable: resolverAvailable,
        accessToken: token && token.access_token ? token.access_token : token,
      })
      persistTune(nextTune)
      const segmentCount = (findTuneFileMeta(nextTune, meta.id) || {}).pdfSegments
      const count = Array.isArray(segmentCount) ? segmentCount.length : 0
      if (count > 0) {
        toast.info('Indexed ' + count + ' PDF title' + (count === 1 ? '' : 's'))
      } else {
        toast.info('No PDF titles were detected')
      }
      return nextTune
    } catch (err) {
      toast.error(err && err.message ? err.message : 'PDF indexing failed')
      return tune
    }
  }

  async function indexPdfMetaFromStored(meta) {
    if (!meta) return
    setBusy(true)
    try {
      const resolved = await resolveTuneFileBlob(meta, tune.id, {
        token: token,
        driveApi: driveApi,
      })
      await indexPdfMeta(meta, resolved.blob, meta.name)
    } finally {
      setBusy(false)
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
      // Screenshots of on-screen notation/lyrics are already digital — OCR often
      // fails looking up the just-saved blob and only adds noise.
      const skipOcr = source === 'capture'
      if (isPdfTuneFileType(result.meta && result.meta.type)) {
        indexPdfMeta(result.meta, blob, name).catch(function() { /* toast handled */ })
      }
      if (resolverAvailable && !skipOcr) {
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

  async function attachBlobAndEdit(blob, name, type, source) {
    const result = await attachBlob(blob, name, type, source)
    if (result && result.meta) {
      if (isPdfTuneFileType(result.meta.type || type)) {
        await openEdit(result.meta)
      } else {
        stop()
        setDrawState({ meta: result.meta, blob: blob, fromPdf: false })
      }
    }
    return result
  }

  async function handleTakeSnapshot() {
    stop()
    setBusy(true)
    try {
      const blob = await captureTuneChartPanels()
      await attachBlobAndEdit(blob, 'Screenshot ' + new Date().toLocaleString(), 'image/png', 'capture')
    } catch (err) {
      toast.error(err && err.message ? err.message : 'Capture failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleLocalFile(file) {
    if (!isAcceptableFile(file)) {
      toast.error('Choose an image or PDF')
      return
    }
    await attachBlobAndEdit(file, file.name || 'File', file.type, 'file')
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
      const next = await deleteTuneFile(tune, meta.id, {
        driveApi: driveApi,
        token: token,
      })
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

  function openPhotos() {
    stop()
    if (tune && tune.id) writeFilePickerIntent('photos', tune.id)
    setPhotosAutoStart(false)
    setShowPhotos(true)
  }

  function openDriveBefore() {
    if (tune && tune.id) writeFilePickerIntent('drive', tune.id)
    return true
  }

  function openLocalFilePicker() {
    stop()
    if (fileInputRef.current) fileInputRef.current.click()
  }

  function openCamera() {
    stop()
    setShowCamera(true)
  }

  function openDrivePicker() {
    stop()
    openDriveBefore()
    setDriveOpenToken(function(v) { return v + 1 })
  }

  const captureAddGroup = (
    <div
      className="file-capture-add-group"
      onClick={function(e) { e.stopPropagation() }}
      onMouseDown={function(e) { e.stopPropagation() }}
    >
      <Dropdown as={ButtonGroup} className="file-capture-split" align="end">
        <Button
          size="sm"
          variant="primary"
          className="file-capture-main"
          disabled={busy}
          onClick={handleTakeSnapshot}
          title="Capture screenshot"
        >
          <span className="file-capture-main-icon">
            {tunebook && tunebook.icons ? tunebook.icons.camera : null}
          </span>
          <span className="file-capture-main-label">Capture</span>
        </Button>
        <Dropdown.Toggle
          split
          size="sm"
          variant="primary"
          disabled={busy}
          id="file-capture-add-sources"
          aria-label="Add file from…"
          title="Add from…"
        />
        <Dropdown.Menu>
          <Dropdown.Item as="button" onClick={openLocalFilePicker}>Choose file…</Dropdown.Item>
          <Dropdown.Item as="button" onClick={openCamera}>Capture photo</Dropdown.Item>
          <Dropdown.Item as="button" onClick={openPhotos}>Google Photos</Dropdown.Item>
          <Dropdown.Item as="button" onClick={openDrivePicker}>Google Drive</Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>
    </div>
  )

  const filesHeader = (
    <div className="file-controls-header d-flex align-items-center gap-2 px-2 py-1">
      <div className="fw-semibold small mb-0 d-flex align-items-center gap-1">
        <span>Snapshots</span>
        {busy ? <Spinner animation="border" size="sm" /> : null}
      </div>
      <div className="ms-auto">{captureAddGroup}</div>
    </div>
  )

  const menuItems = (
    <>
      {filesHeader}
      <Dropdown.Divider />
      <div className="tune-file-menu-row px-2 py-1">
        <Button
          size="sm"
          variant={!hasActive ? 'primary' : 'outline-secondary'}
          className="w-100 text-start"
          onClick={clearActive}
          disabled={busy}
        >
          None
        </Button>
      </div>
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
            {isPdfTuneFileType(meta.type) ? (
              <Button
                size="sm"
                variant="outline-secondary"
                className="file-controls-icon-btn"
                title={tuneFileNeedsPdfIndexing(meta) ? 'Index PDF titles for search' : 'Re-index PDF titles for search'}
                onClick={function() { indexPdfMetaFromStored(meta) }}
                disabled={busy}
              >
                {tunebook.icons && tunebook.icons.search ? tunebook.icons.search : 'Idx'}
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

      {/* Drive picker host — trigger button hidden; opened via driveOpenToken */}
      <DriveFilePickerModal
        label="Google Drive"
        token={token}
        requestGoogleScopes={requestGoogleScopes}
        login={login}
        driveApi={driveApi}
        mimeTypes="image/png,image/jpeg,image/webp,application/pdf"
        buttonClassName="d-none"
        openSignal={driveOpenToken}
        onBeforeOpen={openDriveBefore}
        onFile={function(file) {
          if (!isAcceptableFile(file)) {
            toast.error('Choose an image or PDF')
            return
          }
          attachBlobAndEdit(file, file.name || 'Drive file', file.type, 'drive')
        }}
      />

      {variant === 'menu' ? (
        <div className="file-controls-menu" onClick={function(e) { e.stopPropagation() }} onMouseDown={stop}>
          <div className="d-grid gap-1">{menuItems}</div>
        </div>
      ) : (
        <Dropdown align="end" autoClose="outside" className="file-controls-dropdown">
          <Dropdown.Toggle
            size="sm"
            variant={hasActive ? 'primary' : 'outline-secondary'}
            id="tune-files-dropdown"
            aria-label="Snapshots"
            title="Snapshots"
            disabled={busy}
          >
            <span className="display-mode-group-icon">{tunebook.icons.tunefile}</span>
            <span className="display-mode-group-label">Snapshots</span>
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
        onSave={function(blob) { return saveDrawing(blob, { submitOcr: false }) }}
      />

      <SheetImageCameraModal
        show={showCamera}
        onHide={function() { setShowCamera(false) }}
        onCapture={function(file) {
          setShowCamera(false)
          attachBlobAndEdit(file, file.name || 'Photo.jpg', file.type || 'image/jpeg', 'camera')
        }}
      />
      <SheetImageGooglePhotosModal
        show={showPhotos}
        autoStart={photosAutoStart}
        onHide={function() {
          setShowPhotos(false)
          setPhotosAutoStart(false)
        }}
        token={token}
        requestGoogleScopes={requestGoogleScopes}
        onLogin={login}
        onSelectFile={function(file) {
          setShowPhotos(false)
          setPhotosAutoStart(false)
          attachBlobAndEdit(file, file.name || 'Photo.jpg', file.type || 'image/jpeg', 'photos')
        }}
      />
    </>
  )
}
