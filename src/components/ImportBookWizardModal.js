/**
 * Import Book wizard: home (open/delete/create) → sources → process → review.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { Alert, Button, Form, ListGroup, Modal, ProgressBar, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import BookSelectorModal from './BookSelectorModal'
import DriveFilePickerModal from './DriveFilePickerModal'
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal'
import SheetImageCameraModal from './SheetImageCameraModal'
import BookImportReviewPanel from './BookImportReviewPanel'
import {
  listReviewSets,
  createReviewSet,
  deleteReviewSet,
  filterBookImportFiles,
  isAllowedBookImportFile,
  getReviewSet,
} from '../bookImportReviewStore'
import {
  enqueueBookImportJobForSet,
  findActiveBookImportJobForSet,
  getBookImportJob,
  noticeBookImportJobContinuing,
  subscribeBookImportJobs,
  listRecoverableBookImportReviewSets,
} from '../bookImportJobStore'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useGoogleDocument from '../useGoogleDocument'
import useAbcjsParser from '../useAbcjsParser'
import { isMusicGenerationAdmin } from '../musicGenerationAdmin'
import {
  fetchReviewProjectsCatalog,
  findReviewProject,
  reviewProjectsAvailableFromStatus,
} from '../reviewProjectsClient'
import { ensureMillinerReviewSet } from '../reviewProjectsMilliner'
import { ensureOldtimeReviewSet } from '../reviewProjectsOldtime'
import { describeResolverAuthReason } from '../mediaProxyClient'

const STEPS = {
  HOME: 'home',
  CREATE: 'create',
  SOURCES: 'sources',
  PROCESS: 'process',
  REVIEW: 'review',
}

export default function ImportBookWizardModal(props) {
  const show = !!props.show
  const onHide = props.onHide || function() {}
  const tunebook = props.tunebook
  const { available: resolverAvailable, features, status: resolverStatus } = useMediaResolverHealth()
  const driveApi = useGoogleDocument(props.token, props.logout || function() {}, props.forceRefresh)
  const abcjsParser = useAbcjsParser()
  const accessToken = props.token && props.token.access_token ? props.token.access_token : props.token
  const showDocsProjects = isMusicGenerationAdmin(props.user, resolverStatus)
  const docsProjectsReady = reviewProjectsAvailableFromStatus(resolverStatus)

  const [step, setStep] = useState(STEPS.HOME)
  const [sets, setSets] = useState([])
  const [recoverableCount, setRecoverableCount] = useState(0)
  const [loadingSets, setLoadingSets] = useState(false)
  const [activeSetId, setActiveSetId] = useState('')
  const [initialStatusFilter, setInitialStatusFilter] = useState('')
  const [docsCatalog, setDocsCatalog] = useState(null)
  const [docsBusy, setDocsBusy] = useState(false)
  const [createName, setCreateName] = useState('')
  const [createBook, setCreateBook] = useState('')
  const [appendMode, setAppendMode] = useState(false)
  const [selectedFiles, setSelectedFiles] = useState([])
  const [progress, setProgress] = useState(null)
  const [error, setError] = useState('')
  const [deleteConfirmId, setDeleteConfirmId] = useState('')
  const [showPhotos, setShowPhotos] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const [activeJobId, setActiveJobId] = useState('')

  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const activeJobIdRef = useRef('')

  useEffect(function() {
    activeJobIdRef.current = activeJobId
  }, [activeJobId])

  // Split needs the full local resolver (Paddle OCR), not Google login / light cloud gateway.
  const sheetSplitOk = useMemo(function() {
    if (!features) return false
    if (features.lightMode) return false
    if (features.sheetImageSplit) return true
    // Even if health probe is briefly "unavailable" (auth), local OCR flags mean split can work once calls are authed.
    return !!(features.sheetImageOcr || features.sheetImageOmr || features.sheetImage)
  }, [features])

  const isLoggedIn = !!(props.token && (props.token.access_token || props.token))

  const resolverAuthHint = useMemo(function() {
    const reason = resolverStatus && resolverStatus.authReason
      ? describeResolverAuthReason(resolverStatus.authReason)
      : ''
    if (!isLoggedIn && (!resolverAvailable || reason === 'Login required' || reason === 'Login expired or invalid')) {
      return 'Sign in with Google (menu → Log in) so Tune Book can reach the media resolver. Sheet splitting and Google Drive/Photos also need login.'
    }
    if (reason && reason !== 'Login required') {
      return reason + '. Check Settings → Media resolver or try signing in again.'
    }
    return ''
  }, [isLoggedIn, resolverAvailable, resolverStatus])

  const sheetSplitHint = useMemo(function() {
    if (sheetSplitOk) return ''
    if (features && features.lightMode) {
      return 'You are on the cloud light gateway, which cannot split sheet pages. Point Settings → Media resolver at your full local resolver (with OCR), then refresh. Signing in with Google is not enough for splitting.'
    }
    if (!resolverAvailable) {
      if (!isLoggedIn) {
        return 'Media resolver is not reachable. Sign in with Google first, then start the local resolver if you need sheet splitting (npm run start:resolver).'
      }
      return 'Media resolver is not reachable. Start the local resolver to split multi-tune pages (npm run start:resolver).'
    }
    return 'Sheet page splitting needs local OCR on the full resolver. Check that local-resolver is running with OCR enabled, then refresh health. You can still open existing sets; new imports may treat each page as one tune until split is available.'
  }, [sheetSplitOk, resolverAvailable, features, isLoggedIn])

  async function refreshSets() {
    setLoadingSets(true)
    try {
      const list = await listReviewSets()
      setSets(list)
      try {
        const recoverable = await listRecoverableBookImportReviewSets()
        setRecoverableCount(Array.isArray(recoverable) ? recoverable.length : 0)
      } catch (e) {
        setRecoverableCount(0)
      }
    } catch (e) {
      setSets([])
      setRecoverableCount(0)
    } finally {
      setLoadingSets(false)
    }
  }

  useEffect(function() {
    if (!show) return
    const openSetId = props.initialReviewSetId ? String(props.initialReviewSetId) : ''
    setSelectedFiles([])
    setProgress(null)
    setError('')
    setAppendMode(false)
    setCreateName('')
    setCreateBook('')
    setDeleteConfirmId('')
    setShowPhotos(false)
    setShowCamera(false)
    setActiveJobId('')
    setInitialStatusFilter('')
    setDocsCatalog(null)
    if (openSetId) {
      setActiveSetId(openSetId)
      setStep(STEPS.REVIEW)
    } else {
      setStep(STEPS.HOME)
      setActiveSetId('')
    }
    refreshSets()
  }, [show, props.initialReviewSetId])

  useEffect(function() {
    if (!show || step !== STEPS.HOME || !showDocsProjects || !docsProjectsReady) return undefined
    let cancelled = false
    fetchReviewProjectsCatalog(accessToken).then(function(cat) {
      if (!cancelled) setDocsCatalog(cat)
    }).catch(function() {
      if (!cancelled) setDocsCatalog(null)
    })
    return function() { cancelled = true }
  }, [show, step, showDocsProjects, docsProjectsReady, accessToken])

  useEffect(function() {
    if (!show || !activeJobId) return undefined
    function syncFromJob() {
      const job = getBookImportJob(activeJobId)
      if (!job) return
      setProgress({
        phase: job.phase,
        message: job.message,
        current: job.current,
        total: job.total,
      })
      if (job.status === 'ready') {
        setSelectedFiles([])
        setActiveJobId('')
        setProgress(null)
        setStep(STEPS.REVIEW)
        refreshSets()
      } else if (job.status === 'failed') {
        setError(job.error || job.message || 'Processing failed')
        setActiveJobId('')
        setProgress(null)
        setStep(STEPS.SOURCES)
      } else if (job.status === 'cancelled') {
        setError('Processing cancelled — partial results kept')
        setActiveJobId('')
        setProgress(null)
        setStep(STEPS.REVIEW)
        refreshSets()
      }
    }
    syncFromJob()
    return subscribeBookImportJobs(syncFromJob)
  }, [show, activeJobId])

  function handleClose() {
    const jobId = activeJobIdRef.current
    if (jobId) {
      const job = getBookImportJob(jobId)
      if (job && (job.status === 'pending' || job.status === 'running')) {
        noticeBookImportJobContinuing(jobId)
      }
    }
    setActiveJobId('')
    onHide()
  }

  function addFiles(fileList) {
    const next = filterBookImportFiles(fileList)
    if (!next.length) {
      toast.warn('Select image or PDF files')
      return
    }
    setSelectedFiles(function(current) {
      return current.concat(next)
    })
  }

  async function handleCreateAndContinue() {
    const book = String(createBook || '').trim().toLowerCase()
    if (!book) {
      setError('A book is required')
      return
    }
    try {
      const set = await createReviewSet({
        name: createName,
        book: book,
      })
      setActiveSetId(set.id)
      setAppendMode(false)
      setStep(STEPS.SOURCES)
      setError('')
      await refreshSets()
    } catch (e) {
      setError(e && e.message ? e.message : String(e))
    }
  }

  function handleOpenSet(id, filterHint) {
    setActiveSetId(id)
    setInitialStatusFilter(filterHint || '')
    setStep(STEPS.REVIEW)
  }

  async function openDocumentsProject(projectId) {
    if (!docsProjectsReady) {
      setError('Local resolver Documents review root is not available')
      return
    }
    setDocsBusy(true)
    setError('')
    try {
      const cat = docsCatalog || await fetchReviewProjectsCatalog(accessToken)
      setDocsCatalog(cat)
      const project = findReviewProject(cat, projectId)
      if (!project) throw new Error('Project not found on resolver')
      let set
      if (projectId === 'milliner-koken') {
        set = await ensureMillinerReviewSet(project, accessToken)
      } else if (projectId === 'oldtimefiddletunes') {
        set = await ensureOldtimeReviewSet(project, accessToken)
      } else {
        throw new Error('Unknown documents project')
      }
      await refreshSets()
      const full = await getReviewSet(set.id)
      const filterHint = (full && full.defaultStatusFilter) || 'incomplete'
      toast.success('Loaded ' + ((full && full.tunes) || []).length + ' tunes')
      handleOpenSet(set.id, filterHint)
    } catch (e) {
      setError(e && e.message ? e.message : String(e))
      toast.error(e && e.message ? e.message : String(e))
    } finally {
      setDocsBusy(false)
    }
  }

  function handleAppendToSet(id) {
    setActiveSetId(id)
    setAppendMode(true)
    setSelectedFiles([])
    setStep(STEPS.SOURCES)
  }

  async function handleDeleteSet(id) {
    try {
      await deleteReviewSet(id)
      toast.success('Review set deleted')
      setDeleteConfirmId('')
      if (activeSetId === id) {
        setActiveSetId('')
        setStep(STEPS.HOME)
      }
      await refreshSets()
    } catch (e) {
      toast.error(e && e.message ? e.message : String(e))
    }
  }

  async function startProcessing() {
    if (!activeSetId) {
      setError('No review set selected')
      return
    }
    if (!selectedFiles.length) {
      setError('Select at least one image or PDF')
      return
    }
    if (findActiveBookImportJobForSet(activeSetId)) {
      setError('This review set is already being processed in the background')
      return
    }
    setError('')
    setStep(STEPS.PROCESS)
    setProgress({ phase: 'start', message: 'Starting…', current: 0, total: selectedFiles.length || 1 })
    try {
      const jobId = await enqueueBookImportJobForSet(activeSetId, selectedFiles, {
        accessToken: props.token && props.token.access_token ? props.token.access_token : props.token,
        resolverAvailable: resolverAvailable,
        abcTools: abcjsParser || (tunebook && tunebook.abcTools),
        showStartedToast: true,
      })
      setActiveJobId(jobId)
      setSelectedFiles([])
    } catch (e) {
      setError(e && e.message ? e.message : String(e))
      setProgress(null)
      setStep(STEPS.SOURCES)
    }
  }

  function requireLogin(callback) {
    if (props.token) {
      callback()
      return
    }
    if (typeof props.login === 'function') {
      props.login()
    } else {
      toast.warn('Log in with Google first')
    }
  }

  const canCreate = !!String(createBook || '').trim()
  const progressPct = progress && progress.phase === 'done'
    ? 100
    : (progress && progress.total
      ? Math.min(99, Math.round(100 * (Number(progress.current) || 0) / Math.max(1, Number(progress.total) || 1)))
      : 5)

  const title = useMemo(function() {
    if (step === STEPS.REVIEW) return 'Import scans or PDF — Review'
    if (step === STEPS.PROCESS) return 'Import scans or PDF — Processing'
    if (step === STEPS.SOURCES) return appendMode ? 'Import scans or PDF — Add sources' : 'Import scans or PDF — Sources'
    if (step === STEPS.CREATE) return 'Import scans or PDF — New review set'
    return 'Import scans or PDF'
  }, [step, appendMode])

  return (
    <>
      <Modal
        show={show && !showPhotos}
        onHide={handleClose}
        size="xl"
        fullscreen="lg-down"
        data-testid="import-book-wizard-modal"
      >
        <Modal.Header closeButton>
          <Modal.Title>{title}</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {error ? <Alert variant="danger" onClose={function() { setError('') }} dismissible>{error}</Alert> : null}

          {step === STEPS.HOME ? (
            <div data-testid="import-book-home">
              <p className="text-muted">
                Split <strong>new</strong> sheet photos or PDFs into a review set, then import into a book.
                A book slug is required and forced onto every tune.
              </p>
              <Alert variant="light" className="small border mb-3" data-testid="import-book-eurosession-hint">
                Already finished a review package (e.g. EuroSession with YouTube links)?
                Use <strong>Add From → File</strong> and choose <code>eurosession-final.abc</code> instead of this wizard.
              </Alert>
              {resolverAuthHint ? (
                <Alert variant="warning" className="small" data-testid="import-book-login-hint">
                  {resolverAuthHint}
                  {!isLoggedIn && typeof props.login === 'function' ? (
                    <>
                      {' '}
                      <Button
                        size="sm"
                        variant="outline-dark"
                        className="ms-1 align-baseline"
                        onClick={function() { props.login() }}
                      >
                        Log in with Google
                      </Button>
                    </>
                  ) : null}
                </Alert>
              ) : null}
              {recoverableCount > 0 ? (
                <Alert variant="info" className="small" data-testid="import-book-recoverable-hint">
                  {recoverableCount} review set{recoverableCount === 1 ? '' : 's'} from a previous session
                  {recoverableCount === 1 ? ' is' : ' are'} still in IndexedDB (crops/source PDF survive a hard reload;
                  in-flight jobs do not). Open a set below to continue reviewing.
                </Alert>
              ) : null}
              {!sheetSplitOk ? (
                <Alert variant="warning" className="small" data-testid="import-book-split-hint">
                  {sheetSplitHint}
                </Alert>
              ) : null}
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Button
                  variant="primary"
                  onClick={function() { setStep(STEPS.CREATE); setError('') }}
                  data-testid="import-book-create"
                >
                  Create new review set
                </Button>
              </div>

              {showDocsProjects ? (
                <div className="mb-4" data-testid="import-book-documents-projects">
                  <h6 className="text-muted">Optional — developer scrape imports</h6>
                  <p className="small text-muted mb-2">
                    <strong>Skip this for EuroSession.</strong> These load Milliner–Koken or Old Time Fiddle
                    review packages from a folder on your dev machine (
                    <code>~/Documents/oldtime sources review</code>
                    ) through a <strong>local</strong> resolver with that folder mounted.
                    Not stored in Tune Book until you review and import.
                  </p>
                  {!docsProjectsReady ? (
                    <Alert variant="secondary" className="small py-2">
                      Not available: start the full local resolver with the Documents review root mounted
                      (see <code>local-resolver</code> docs). Sign in with Google if Settings shows a login error,
                      but this feature still needs the local resolver — not the cloud gateway alone.
                    </Alert>
                  ) : (
                    <div className="d-flex flex-column gap-2">
                      {[{
                        id: 'milliner-koken',
                        label: 'Milliner–Koken',
                        warn: '~1500 tunes — Incomplete filter; crops load lazily. Safe to open and chip away.',
                        book: 'milliner koken',
                      }, {
                        id: 'oldtimefiddletunes',
                        label: 'Old Time Fiddle',
                        warn: 'Source MIDI / PDF convert into candidates (proof or full package).',
                        book: 'old time',
                      }].map(function(card) {
                        const loaded = sets.find(function(s) {
                          return s && (
                            String(s.book || '').toLowerCase() === card.book
                            || String(s.name || '').indexOf(card.label) >= 0
                          )
                        })
                        const catalogHit = docsCatalog && findReviewProject(docsCatalog, card.id)
                        return (
                          <ListGroup.Item
                            key={card.id}
                            as="div"
                            className="d-flex flex-wrap align-items-center justify-content-between gap-2 border rounded px-3 py-2"
                          >
                            <div>
                              <strong>{card.label}</strong>
                              <div className="small text-muted">{card.warn}</div>
                              <div className="small text-muted">
                                {loaded
                                  ? ('Loaded locally: ' + (loaded.tuneCount || 0) + ' tunes')
                                  : (catalogHit ? 'Available on resolver (not loaded yet)' : 'Checking catalog…')}
                              </div>
                            </div>
                            <div className="d-flex flex-wrap gap-1">
                              {loaded ? (
                                <Button
                                  size="sm"
                                  variant="primary"
                                  disabled={docsBusy}
                                  onClick={function() {
                                    handleOpenSet(loaded.id, 'incomplete')
                                  }}
                                >
                                  Open
                                </Button>
                              ) : null}
                              <Button
                                size="sm"
                                variant={loaded ? 'outline-primary' : 'primary'}
                                disabled={docsBusy || !docsProjectsReady}
                                data-testid={'import-book-docs-' + card.id}
                                onClick={function() { openDocumentsProject(card.id) }}
                              >
                                {docsBusy ? 'Loading…' : (loaded ? 'Reload from Documents' : 'Load from Documents')}
                              </Button>
                            </div>
                          </ListGroup.Item>
                        )
                      })}
                    </div>
                  )}
                </div>
              ) : null}

              <h6>Your review sets (this browser)</h6>
              {loadingSets ? (
                <Spinner animation="border" size="sm" />
              ) : !sets.length ? (
                <p className="text-muted small mb-0">
                  No review sets yet. Create one above when you have new sheet scans to split.
                  Finished packages (e.g. <code>eurosession-import-final.json</code>) are imported via
                  {' '}<strong>Add From → File</strong> with the matching ABC, not here.
                </p>
              ) : (
                <ListGroup>
                  {sets.map(function(set) {
                    return (
                      <ListGroup.Item key={set.id} className="d-flex flex-wrap align-items-center justify-content-between gap-2">
                        <div>
                          <strong>{set.name}</strong>
                          <span className="text-muted small ms-2">book: {set.book}</span>
                          <div className="small text-muted">
                            {set.tuneCount} tune{set.tuneCount === 1 ? '' : 's'}
                            {set.status ? ' · ' + set.status : ''}
                            {set.updatedAt ? ' · ' + new Date(set.updatedAt).toLocaleString() : ''}
                          </div>
                        </div>
                        <div className="d-flex flex-wrap gap-1">
                          <Button size="sm" variant="primary" onClick={function() { handleOpenSet(set.id) }}>
                            Open
                          </Button>
                          <Button size="sm" variant="outline-primary" onClick={function() { handleAppendToSet(set.id) }}>
                            Add sources
                          </Button>
                          {deleteConfirmId === set.id ? (
                            <>
                              <Button size="sm" variant="danger" onClick={function() { handleDeleteSet(set.id) }}>
                                Confirm delete
                              </Button>
                              <Button size="sm" variant="outline-secondary" onClick={function() { setDeleteConfirmId('') }}>
                                Cancel
                              </Button>
                            </>
                          ) : (
                            <Button size="sm" variant="outline-danger" onClick={function() { setDeleteConfirmId(set.id) }}>
                              Delete
                            </Button>
                          )}
                        </div>
                      </ListGroup.Item>
                    )
                  })}
                </ListGroup>
              )}
            </div>
          ) : null}

          {step === STEPS.CREATE ? (
            <div data-testid="import-book-create-form">
              <Form.Group className="mb-3">
                <Form.Label>Review set name</Form.Label>
                <Form.Control
                  value={createName}
                  onChange={function(e) { setCreateName(e.target.value) }}
                  placeholder="e.g. EuroSession phone snaps"
                />
              </Form.Group>
              <Form.Group className="mb-3">
                <Form.Label>Book (required)</Form.Label>
                <div>
                  {tunebook ? (
                    <BookSelectorModal
                      forceRefresh={props.forceRefresh}
                      title="Select a Book"
                      tunebook={tunebook}
                      value={createBook}
                      onChange={function(val) { setCreateBook(String(val || '').trim().toLowerCase()) }}
                      defaultOptions={tunebook.getTuneBookOptions}
                      searchOptions={tunebook.getSearchTuneBookOptions}
                      triggerElement={
                        <Button variant={createBook ? 'outline-primary' : 'outline-danger'}>
                          {createBook ? <b>{createBook}</b> : 'Select a book'}
                        </Button>
                      }
                    />
                  ) : (
                    <Form.Control
                      value={createBook}
                      onChange={function(e) { setCreateBook(e.target.value) }}
                      placeholder="book slug"
                    />
                  )}
                </div>
                <Form.Text muted>Every tune in this set is forced into this book.</Form.Text>
              </Form.Group>
              <div className="d-flex gap-2">
                <Button variant="outline-secondary" onClick={function() { setStep(STEPS.HOME) }}>Back</Button>
                <Button variant="primary" disabled={!canCreate} onClick={handleCreateAndContinue}>
                  Continue to sources
                </Button>
              </div>
            </div>
          ) : null}

          {step === STEPS.SOURCES ? (
            <div data-testid="import-book-sources">
              <p className="text-muted small">
                Choose image or PDF files from your device, a folder, camera roll, Google Drive, or Google Photos.
              </p>
              {resolverAuthHint ? (
                <Alert variant="warning" className="small" data-testid="import-book-sources-login-hint">
                  {resolverAuthHint}
                  {!isLoggedIn && typeof props.login === 'function' ? (
                    <>
                      {' '}
                      <Button size="sm" variant="outline-dark" className="ms-1" onClick={function() { props.login() }}>
                        Log in with Google
                      </Button>
                    </>
                  ) : null}
                </Alert>
              ) : null}
              {!sheetSplitOk ? (
                <Alert variant="info" className="small" data-testid="import-book-sources-split-hint">
                  {sheetSplitHint}
                </Alert>
              ) : null}
              <div className="d-flex flex-wrap gap-2 mb-3">
                <Button
                  variant="outline-primary"
                  onClick={function() { setShowCamera(true) }}
                  title="Take multiple sheet photos before importing"
                  data-testid="import-book-camera"
                >
                  {tunebook && tunebook.icons && tunebook.icons.camera
                    ? <span className="me-1">{tunebook.icons.camera}</span>
                    : null}
                  Camera
                </Button>
                <Button variant="outline-primary" onClick={function() { fileInputRef.current && fileInputRef.current.click() }}>
                  Files
                </Button>
                <Button
                  variant="outline-primary"
                  onClick={function() { folderInputRef.current && folderInputRef.current.click() }}
                  title="Import every PDF or image in a folder"
                >
                  Folder
                </Button>
                <Button
                  variant="outline-primary"
                  onClick={function() {
                    requireLogin(function() { setShowPhotos(true) })
                  }}
                  title="Import photos from Google Photos"
                >
                  Google Photos
                </Button>
                <DriveFilePickerModal
                  label="Drive"
                  title="Import from Google Drive"
                  token={props.token}
                  driveApi={driveApi}
                  login={props.login}
                  requestGoogleScopes={props.requestGoogleScopes}
                  onImportSource={function(source) {
                    if (source && source.file && isAllowedBookImportFile(source.file)) {
                      addFiles([source.file])
                    } else {
                      toast.warn('Drive selection must be an image or PDF')
                    }
                  }}
                />
              </div>
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept="image/*,application/pdf,.pdf,.png,.jpg,.jpeg,.webp,.gif"
                style={{ display: 'none' }}
                onChange={function(event) {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              <input
                ref={folderInputRef}
                type="file"
                multiple
                webkitdirectory=""
                directory=""
                style={{ display: 'none' }}
                onChange={function(event) {
                  addFiles(event.target.files)
                  event.target.value = ''
                }}
              />
              {selectedFiles.length ? (
                <ListGroup className="mb-3" style={{ maxHeight: '240px', overflow: 'auto' }}>
                  {selectedFiles.map(function(file, index) {
                    return (
                      <ListGroup.Item key={file.name + '-' + index} className="py-1 small d-flex justify-content-between">
                        <span>{file.name}</span>
                        <Button
                          size="sm"
                          variant="link"
                          className="text-danger p-0"
                          onClick={function() {
                            setSelectedFiles(function(current) {
                              return current.filter(function(_, i) { return i !== index })
                            })
                          }}
                        >
                          Remove
                        </Button>
                      </ListGroup.Item>
                    )
                  })}
                </ListGroup>
              ) : (
                <p className="text-muted small">No files selected yet.</p>
              )}
              <div className="d-flex gap-2">
                <Button
                  variant="outline-secondary"
                  onClick={function() {
                    setStep(appendMode ? STEPS.HOME : STEPS.CREATE)
                  }}
                >
                  Back
                </Button>
                <Button
                  variant="primary"
                  disabled={!selectedFiles.length}
                  onClick={startProcessing}
                  data-testid="import-book-start-process"
                >
                  Process {selectedFiles.length || ''} file{selectedFiles.length === 1 ? '' : 's'}
                </Button>
              </div>
            </div>
          ) : null}

          {step === STEPS.PROCESS ? (
            <div data-testid="import-book-process">
              <p>{(progress && progress.message) || 'Processing…'}</p>
              <ProgressBar animated now={progressPct} label={progressPct + '%'} className="mb-2" />
              <p className="small text-muted mb-2">
                You can close this dialog — processing continues in the background.
                Open Settings → Background jobs → Import scans to track progress.
              </p>
              <Button
                variant="outline-secondary"
                size="sm"
                onClick={handleClose}
              >
                Continue in background
              </Button>
            </div>
          ) : null}

          {step === STEPS.REVIEW && activeSetId ? (
            <BookImportReviewPanel
              setId={activeSetId}
              tunebook={tunebook}
              tunes={props.tunes}
              token={props.token}
              accessToken={accessToken}
              resolverAvailable={resolverAvailable}
              forceRefresh={props.forceRefresh}
              setCurrentTuneBook={props.setCurrentTuneBook}
              initialStatusFilter={initialStatusFilter}
              onBack={function() {
                setStep(STEPS.HOME)
                setInitialStatusFilter('')
                refreshSets()
              }}
              onImported={function() {
                if (typeof props.onImported === 'function') props.onImported()
              }}
            />
          ) : null}
        </Modal.Body>
      </Modal>

      <SheetImageCameraModal
        show={showCamera}
        multiCapture
        onHide={function() { setShowCamera(false) }}
        onCapture={function(file) {
          addFiles([file])
        }}
        onDone={function(count) {
          if (count > 0) {
            toast.success('Added ' + count + ' photo' + (count === 1 ? '' : 's') + ' from camera')
          }
        }}
      />

      <SheetImageGooglePhotosModal
        show={showPhotos}
        onHide={function() { setShowPhotos(false) }}
        token={props.token}
        login={props.login}
        requestGoogleScopes={props.requestGoogleScopes}
        maxItemCount={50}
        onImportFiles={function(files) {
          addFiles(files)
          setShowPhotos(false)
        }}
        onSelectFile={function(file) {
          addFiles([file])
          setShowPhotos(false)
        }}
      />
    </>
  )
}
