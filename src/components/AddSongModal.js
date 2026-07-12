import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import { Button, Form, Alert, ProgressBar } from 'react-bootstrap'
import { toast } from 'react-toastify'
import ImportCollectionsAccordion from './ImportCollectionsAccordion'
import useAbcjsParser from '../useAbcjsParser'
import useMediaResolverHealth from '../useMediaResolverHealth'
import useGoogleDocument from '../useGoogleDocument'
import {
  hasActiveImportReviewSession,
  requestImportReview,
  showImportReviewUi,
} from '../importReviewSessionStore'
import DriveFilePickerModal from './DriveFilePickerModal'
import BulkYouTubePlaylistModal from './BulkYouTubePlaylistModal'
import AudioDriveUploadModal from './AudioDriveUploadModal'
import { bulkFileAcceptList } from '../importSourceParse'
import { driveListTextToBulkLines, normalizeBulkTextLocally } from '../bulkListFormat'
import { formatBulkImportLinesViaResolver } from '../bulkListFormatClient'
import { readAudioFileMetadata } from '../audioFileMetadata'
import { createAttachedAudioLink } from '../linkRecording'
import { buildImportContext, dispatchAddImport } from '../addImportDispatch'
import { processReviewResult } from '../addSongModalHelper'

const DEFAULT_BOOK = 'songs'
const BULK_TEXT_STORAGE_KEY = 'addSongModal_bulkText'

function AddSongModal(props) {
  const abcjsParser = useAbcjsParser()
  const { available: resolverAvailable } = useMediaResolverHealth()
  const driveApi = useGoogleDocument(props.token, props.login || function() {}, props.forceRefresh)
  const bulkFileInputRef = useRef(null)

  const defaultTab = props.defaultTab === 'bulk' ? 'bulk' : 'add'
  const [activeTab, setActiveTab] = useState(defaultTab)
  const [bulkText, setBulkText] = useState(function() {
    try {
      return sessionStorage.getItem(BULK_TEXT_STORAGE_KEY) || ''
    } catch (e) {
      return ''
    }
  })
  const [bulkBusy, setBulkBusy] = useState(false)
  const [audioImportBusy, setAudioImportBusy] = useState(false)
  const [importError, setImportError] = useState('')
  const [pendingBulkAudioFiles, setPendingBulkAudioFiles] = useState([])
  const [showAudioDriveUploadModal, setShowAudioDriveUploadModal] = useState(false)

  const importContext = buildImportContext({
    resolverAvailable: resolverAvailable,
    token: props.token,
    driveApi: driveApi,
    tunebook: props.tunebook,
    abcjsParser: abcjsParser,
    book: props.currentTuneBook || DEFAULT_BOOK,
    stayOnForm: false,
  })

  useEffect(function() {
    setActiveTab(props.defaultTab === 'bulk' ? 'bulk' : 'add')
  }, [props.defaultTab])

  useEffect(function() {
    try {
      if (bulkText) sessionStorage.setItem(BULK_TEXT_STORAGE_KEY, bulkText)
      else sessionStorage.removeItem(BULK_TEXT_STORAGE_KEY)
    } catch (e) {}
  }, [bulkText])

  const dismissRoute = useCallback(function() {
    if (props.routeMode && typeof props.onRouteClose === 'function') {
      props.onRouteClose()
    }
  }, [props.routeMode, props.onRouteClose])

  const startImportReview = useCallback(function(candidates, options) {
    if (!Array.isArray(candidates) || candidates.length === 0) return
    setImportError('')
    setAudioImportBusy(false)
    requestImportReview(candidates, options)
    showImportReviewUi()
    dismissRoute()
  }, [dismissRoute])

  const openBlankOrResumeAdd = useCallback(function() {
    if (hasActiveImportReviewSession()) {
      showImportReviewUi()
      if (props.routeMode) dismissRoute()
      return
    }
    requestImportReview([], {
      entryMode: 'add',
      book: props.currentTuneBook || DEFAULT_BOOK,
      tags: Array.isArray(props.tagFilter) ? props.tagFilter : [],
    })
    showImportReviewUi()
    if (props.routeMode) dismissRoute()
  }, [props.currentTuneBook, props.tagFilter, props.routeMode, dismissRoute])

  useEffect(function() {
    if (!props.routeMode) return undefined
    if (activeTab !== 'add') return undefined
    openBlankOrResumeAdd()
    return undefined
  }, [props.routeMode, activeTab, openBlankOrResumeAdd])

  function handleShow() {
    openBlankOrResumeAdd()
  }

  function handleClose() {
    dismissRoute()
  }

  function appendBulkLines(lines) {
    setBulkText(function(prev) {
      const next = String(lines || '').trim()
      if (!next) return prev
      if (!prev.trim()) return next
      return prev.replace(/\s+$/, '') + '\n' + next
    })
  }

  async function handleBulkSearch() {
    if (!bulkText.trim()) return
    setBulkBusy(true)
    setImportError('')
    try {
      if (resolverAvailable && props.token && props.token.access_token) {
        try {
          const formatted = await formatBulkImportLinesViaResolver(bulkText, props.token.access_token)
          setBulkText(formatted)
          return
        } catch (e) {
          // fall through
        }
      }
      setBulkText(normalizeBulkTextLocally(bulkText))
    } finally {
      setBulkBusy(false)
    }
  }

  async function applyBulkImportResult(result) {
    if (!result || result.action === 'error') {
      setImportError(result && result.message ? result.message : 'Import failed.')
      return false
    }
    if (result.action === 'review') {
      const outcome = processReviewResult(
        result,
        Object.assign({}, importContext, { stayOnForm: false, bulkMode: true }),
        function() {},
        startImportReview,
        toast
      )
      if (outcome.handled) {
        showImportReviewUi()
        dismissRoute()
        return false
      }
    }
    if (result.action === 'audio') {
      const files = result.files || []
      if (files.length === 0) return false
      setPendingBulkAudioFiles(files)
      setShowAudioDriveUploadModal(true)
      return true
    }
    if (result.action === 'bulkAppend') {
      appendBulkLines(result.text)
      return false
    }
    return false
  }

  async function handleBulkImport() {
    if (!bulkText.trim()) return
    setImportError('')
    setAudioImportBusy(true)
    try {
      const result = await dispatchAddImport(bulkText, Object.assign({}, importContext, { bulkMode: true }))
      const keepBusy = await applyBulkImportResult(result)
      if (!keepBusy) setAudioImportBusy(false)
    } catch (e) {
      setImportError(e.message || 'Import failed.')
      setAudioImportBusy(false)
    }
  }

  async function continueBulkAudioImport(files, uploadToDriveFlags) {
    if (!Array.isArray(files) || files.length === 0) return
    setAudioImportBusy(true)
    setImportError('')
    setShowAudioDriveUploadModal(false)
    const book = (props.currentTuneBook || DEFAULT_BOOK).trim().toLowerCase()
    const generateId = props.tunebook.utils && props.tunebook.utils.generateObjectId
      ? props.tunebook.utils.generateObjectId.bind(props.tunebook.utils)
      : function() { return 'draft-' + Date.now() + '-' + Math.random().toString(36).slice(2, 7) }
    try {
      const candidates = []
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        const uploadToDrive = Array.isArray(uploadToDriveFlags) ? !!uploadToDriveFlags[i] : false
        const metadata = await readAudioFileMetadata(file)
        const title = metadata.title || file.name
        const artist = metadata.artist || ''
        const tuneId = generateId()
        const result = await createAttachedAudioLink({
          tune: { id: tuneId, name: title, composer: artist, links: [] },
          file: file,
          title: title,
          uploadToDrive: uploadToDrive,
          token: props.token,
          driveApi: driveApi,
        })
        candidates.push({
          tune: {
            id: tuneId,
            name: title,
            composer: artist,
            links: [result.link],
            mediaCacheLocked: true,
            voices: { '1': { meta: '', notes: [] } },
            books: book ? [book] : [],
          },
          sourceKind: 'bulk-audio',
        })
      }
      if (candidates.length === 0) {
        setImportError('No audio files to import.')
        return
      }
      startImportReview(candidates)
    } catch (e) {
      setImportError(e.message || 'Could not import audio files.')
    } finally {
      setAudioImportBusy(false)
      setPendingBulkAudioFiles([])
    }
  }

  async function handleBulkFileSelected(event) {
    const files = event.target.files ? Array.from(event.target.files) : []
    event.target.value = ''
    if (files.length === 0) return
    setImportError('')
    setAudioImportBusy(true)
    const audioFiles = []
    let appendText = ''
    let releaseBusy = true
    try {
      for (let i = 0; i < files.length; i += 1) {
        const file = files[i]
        const type = String(file.type || '').toLowerCase()
        const name = String(file.name || '').toLowerCase()
        if (type.indexOf('audio/') === 0 || /\.(mp3|wav|m4a|ogg|flac|aac)$/i.test(name)) {
          audioFiles.push(file)
          continue
        }
        const result = await dispatchAddImport(file, Object.assign({}, importContext, {
          bulkMode: true,
          bulkTextAppendOnly: true,
        }))
        if (result && result.action === 'bulkAppend' && result.text) {
          appendText += (appendText ? '\n' : '') + result.text
        } else if (result && result.action === 'review') {
          await applyBulkImportResult(result)
          releaseBusy = false
          return
        } else if (result && result.action === 'audio') {
          audioFiles.push.apply(audioFiles, result.files || [])
        }
      }
      if (appendText) appendBulkLines(appendText)
      if (audioFiles.length > 0) {
        setPendingBulkAudioFiles(audioFiles)
        setShowAudioDriveUploadModal(true)
        releaseBusy = true
        return
      }
    } catch (e) {
      setImportError(e.message || 'Could not import those files.')
    } finally {
      if (releaseBusy) setAudioImportBusy(false)
    }
  }

  function renderBulkPage() {
    const page = (
      <div className="add-page">
        <div className="add-page-header">
          <div className="add-tunes-panel-header">
            <div className="add-tunes-panel-header-top">
              <h1 className="add-page-title">Bulk import</h1>
              <div className="add-tunes-panel-header-end">
                <Button
                  variant="outline-primary"
                  onClick={function() {
                    setActiveTab('add')
                    if (props.onActiveTabChange) props.onActiveTabChange('add')
                    openBlankOrResumeAdd()
                  }}
                >
                  Add single
                </Button>
                <Button variant="outline-secondary" className="add-page-close" onClick={handleClose} aria-label="Close">
                  {props.tunebook.icons.closecircle || '×'}
                </Button>
              </div>
            </div>
          </div>
        </div>
        <div className="add-page-body container-fluid">
          <div style={{ display: 'flex', flexDirection: 'column', gap: '1em', maxWidth: '52em' }}>
            <div>
              <h5>Curated collections</h5>
              <p className="text-muted small">Curated imports update by tune id and skip tunes that are newer locally.</p>
              <ImportCollectionsAccordion
                tunebook={props.tunebook}
                setCurrentTuneBook={props.setCurrentTuneBook}
                startCollapsed={true}
              />
            </div>
            <p className="text-muted">
              Paste or build a list of tunes to import one at a time through the review queue.
              Each line: Title, Title by Artist, or Title | url.
            </p>
            {importError ? <Alert variant="danger">{importError}</Alert> : null}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.6em', alignItems: 'center' }}>
              <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'stretch' }}>
                <Button
                  variant="outline-primary"
                  disabled={audioImportBusy}
                  onClick={function() { bulkFileInputRef.current && bulkFileInputRef.current.click() }}
                >
                  {audioImportBusy ? 'Processing files...' : 'File'}
                </Button>
                {audioImportBusy ? (
                  <ProgressBar
                    animated
                    striped
                    now={100}
                    style={{ marginTop: '0.35em', height: '0.45em', minWidth: '10em', width: '100%' }}
                  />
                ) : null}
              </div>
              <DriveFilePickerModal
                label="Drive"
                title="Load list from Google Drive"
                token={props.token}
                driveApi={driveApi}
                login={props.login}
                requestGoogleScopes={props.requestGoogleScopes}
                mimeTypes={[
                  'text/plain',
                  'text/csv',
                  'application/vnd.google-apps.document',
                  'application/vnd.google-apps.spreadsheet',
                ]}
                onFileText={function(text) { appendBulkLines(driveListTextToBulkLines(text)) }}
              />
              <BulkYouTubePlaylistModal onLines={appendBulkLines} disabled={audioImportBusy} />
              <Button
                variant="outline-primary"
                disabled={bulkBusy || audioImportBusy || !bulkText.trim()}
                onClick={handleBulkSearch}
              >
                {bulkBusy ? 'Searching…' : 'Search'}
              </Button>
              <Button variant="success" disabled={!bulkText.trim()} onClick={handleBulkImport}>Import</Button>
            </div>
            <Form.Control
              as="textarea"
              rows={32}
              value={bulkText}
              onChange={function(e) { setBulkText(e.target.value) }}
              placeholder={'Whiskey in the Jar\nThe Wild Rover by The Dubliners | https://www.youtube.com/watch?v=...'}
              style={{ fontFamily: 'monospace', fontSize: '1.05em' }}
            />
          </div>
        </div>
      </div>
    )
    return createPortal(page, document.body)
  }

  return (
    <>
      {!props.routeMode ? (
        props.buttonGroupMember ? (
          <span className="header-dropdown-add-trigger" style={{ display: 'contents' }}>
            <Button
              variant="success"
              size={props.buttonSize}
              className={(props.buttonClassName || '') + ' header-dropdown-add-btn'}
              title="Add Tunes"
              onClick={handleShow}
            >
              {props.tunebook.icons.fileadd} Add
            </Button>
          </span>
        ) : (
          <Button
            variant="success"
            size={props.buttonSize}
            className={props.buttonClassName}
            title="Add Tunes"
            onClick={handleShow}
          >
            {props.tunebook.icons.fileadd} Add
          </Button>
        )
      ) : null}

      {props.routeMode && activeTab === 'bulk' ? renderBulkPage() : null}

      <input
        ref={bulkFileInputRef}
        type="file"
        accept={bulkFileAcceptList()}
        multiple
        style={{ display: 'none' }}
        onChange={handleBulkFileSelected}
      />

      <AudioDriveUploadModal
        show={showAudioDriveUploadModal}
        files={pendingBulkAudioFiles}
        loggedIn={!!(props.token && props.token.access_token)}
        onConfirm={function(uploadToDriveFlags) {
          continueBulkAudioImport(pendingBulkAudioFiles, uploadToDriveFlags)
        }}
        onCancel={function() {
          setPendingBulkAudioFiles([])
          setShowAudioDriveUploadModal(false)
          setAudioImportBusy(false)
        }}
      />
    </>
  )
}

export default AddSongModal
