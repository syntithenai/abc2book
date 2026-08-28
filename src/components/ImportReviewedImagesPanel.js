/**
 * Import EuroSession review package (JSON + crop folder) into the tunebook.
 */
import { useRef, useState } from 'react'
import { Alert, Button, Form, ProgressBar } from 'react-bootstrap'
import { toast } from 'react-toastify'
import {
  parseEurosessionImportPackage,
  indexCropFilesByBasename,
  importEurosessionPackage,
  readImportJsonFile,
} from '../eurosessionTunebookImport'

export default function ImportReviewedImagesPanel(props) {
  const tunebook = props.tunebook
  const tunes = props.tunes || {}
  const jsonInputRef = useRef(null)
  const folderInputRef = useRef(null)

  const [jsonFile, setJsonFile] = useState(null)
  const [cropFiles, setCropFiles] = useState(null)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState(null)
  const [summary, setSummary] = useState(null)
  const [error, setError] = useState('')

  const cropCount = cropFiles && cropFiles.length ? cropFiles.length : 0
  const canImport = !!(jsonFile && cropCount > 0 && tunebook && !busy)

  async function handleImport() {
    setError('')
    setSummary(null)
    if (!jsonFile) {
      setError('Choose eurosession-import.json from the review page export.')
      return
    }
    if (!cropCount) {
      setError('Choose the eurosession-work/tunes folder (or parent work folder with crops).')
      return
    }
    setBusy(true)
    setProgress({ done: 0, total: 1, title: '', status: 'reading' })
    try {
      const text = await readImportJsonFile(jsonFile)
      const pkg = parseEurosessionImportPackage(text)
      const cropIndex = indexCropFilesByBasename(cropFiles)
      const result = await importEurosessionPackage({
        packageData: pkg,
        cropIndex: cropIndex,
        tunebook: tunebook,
        tunes: tunes,
        onProgress: function(done, total, title, status) {
          setProgress({ done: done, total: total, title: title, status: status })
        },
      })
      setSummary(result)
      if (typeof props.setCurrentTuneBook === 'function') {
        props.setCurrentTuneBook(pkg.book)
      }
      if (typeof props.forceRefresh === 'function') {
        props.forceRefresh()
      }
      const msg = 'Imported ' + result.inserted + ' new, updated ' + result.updated +
        (result.skipped ? ', skipped ' + result.skipped : '')
      toast.success(msg)
      if (result.missingCrop.length || result.errors.length) {
        toast.warn(
          (result.missingCrop.length ? result.missingCrop.length + ' missing crops' : '') +
          (result.errors.length ? (result.missingCrop.length ? '; ' : '') + result.errors.length + ' errors' : '')
        )
      }
    } catch (err) {
      const message = err && err.message ? err.message : String(err)
      setError(message)
      toast.error(message)
    } finally {
      setBusy(false)
    }
  }

  const pct = progress && progress.total
    ? Math.min(100, Math.round((100 * (progress.done || 0)) / progress.total))
    : 0

  return (
    <div className="import-reviewed-images-panel" data-testid="import-reviewed-images-panel">
      <div className="mb-3">
        <h5 className="mb-1">Import Reviewed Images</h5>
        <p className="text-muted small mb-0">
          Import all EuroSession review tunes into the <strong>eurosession</strong> book.
          Incomplete tunes open on the crop snapshot; complete tunes open as notation.
          Re-running updates the same tunes (stable ids from the review export) instead of duplicating.
        </p>
      </div>

      <ol className="small text-muted mb-3 ps-3">
        <li>In <code>review_abc.html</code>, click <strong>Export tunebook import</strong>.</li>
        <li>Select that <code>eurosession-import.json</code> below.</li>
        <li>Select the <code>eurosession-work/tunes</code> folder (crop images).</li>
        <li>Click <strong>Import Reviewed Images</strong>.</li>
      </ol>

      <Form.Group className="mb-2">
        <Form.Label className="small mb-1">Import JSON</Form.Label>
        <Form.Control
          type="file"
          accept="application/json,.json"
          data-testid="reviewed-images-json"
          onChange={function(e) {
            const f = e.target.files && e.target.files[0]
            setJsonFile(f || null)
            setSummary(null)
            setError('')
          }}
          ref={jsonInputRef}
        />
        {jsonFile ? (
          <div className="small text-muted mt-1">{jsonFile.name}</div>
        ) : null}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label className="small mb-1">Crop folder</Form.Label>
        <input
          className="form-control"
          type="file"
          data-testid="reviewed-images-folder"
          webkitdirectory="true"
          directory="true"
          multiple
          onChange={function(e) {
            setCropFiles(e.target.files)
            setSummary(null)
            setError('')
          }}
          ref={folderInputRef}
        />
        {cropCount ? (
          <div className="small text-muted mt-1">{cropCount} files selected</div>
        ) : null}
      </Form.Group>

      <div className="d-flex gap-2 align-items-center flex-wrap">
        <Button
          variant="primary"
          disabled={!canImport}
          onClick={handleImport}
          data-testid="import-reviewed-images"
        >
          {busy ? 'Importing…' : 'Import Reviewed Images'}
        </Button>
      </div>

      {busy && progress ? (
        <div className="mt-3" data-testid="reviewed-images-progress">
          <ProgressBar now={pct} label={pct + '%'} />
          <div className="small text-muted mt-1">
            {progress.done}/{progress.total}
            {progress.title ? ' — ' + progress.title : ''}
            {progress.status ? ' (' + progress.status + ')' : ''}
          </div>
        </div>
      ) : null}

      {error ? (
        <Alert variant="danger" className="mt-3 mb-0" data-testid="reviewed-images-error">
          {error}
        </Alert>
      ) : null}

      {summary ? (
        <Alert variant="success" className="mt-3 mb-0" data-testid="reviewed-images-summary">
          <div>
            Inserted <strong>{summary.inserted}</strong>, updated <strong>{summary.updated}</strong>
            {summary.skipped ? <>, skipped <strong>{summary.skipped}</strong></> : null}.
          </div>
          {summary.missingCrop && summary.missingCrop.length ? (
            <div className="small mt-2">
              Missing crops: {summary.missingCrop.slice(0, 8).join('; ')}
              {summary.missingCrop.length > 8 ? '…' : ''}
            </div>
          ) : null}
          {summary.errors && summary.errors.length ? (
            <div className="small mt-2 text-danger">
              Errors: {summary.errors.slice(0, 5).join('; ')}
              {summary.errors.length > 5 ? '…' : ''}
            </div>
          ) : null}
        </Alert>
      ) : null}
    </div>
  )
}
