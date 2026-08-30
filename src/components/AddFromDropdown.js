/**
 * Compact Add From menu for the Add page header.
 * Each option opens a dialog (or native file picker / recording).
 */
import { useEffect, useRef, useState } from 'react'
import { Dropdown, Modal } from 'react-bootstrap'
import { addFromFileAcceptList } from '../importSourceParse'
import { withDropdownPositionFix } from '../reactBootstrapDropdownPatch'
import AddBulkImportPanel from './AddBulkImportPanel'
import ImportBookWizardModal from './ImportBookWizardModal'
import PasteImportModal from './PasteImportModal'
import ImportUrlModal from './ImportUrlModal'
import DriveFilePickerModal from './DriveFilePickerModal'
import YouTubeSearchModal from './YouTubeSearchModal'
import SheetImageCameraModal from './SheetImageCameraModal'
import SheetImageGooglePhotosModal from './SheetImageGooglePhotosModal'

function bumpSignal(setter) {
  setter(function(n) { return (n || 0) + 1 })
}

export default function AddFromDropdown(props) {
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)
  const [showBulk, setShowBulk] = useState(false)
  const [showImportBook, setShowImportBook] = useState(false)
  const [importBookReviewSetId, setImportBookReviewSetId] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [showGooglePhotos, setShowGooglePhotos] = useState(false)
  const [pasteOpenSignal, setPasteOpenSignal] = useState(0)
  const [urlOpenSignal, setUrlOpenSignal] = useState(0)
  const [driveOpenSignal, setDriveOpenSignal] = useState(0)
  const [youtubeOpenSignal, setYoutubeOpenSignal] = useState(0)

  const resolverAvailable = !!props.resolverAvailable
  const resolverChecked = props.resolverChecked !== false
  const isRecording = !!(props.audioUtils && props.audioUtils.isRecording)
  const recordingDuration = props.recordingDuration || 0

  useEffect(function() {
    function onOpenBookImport(event) {
      const setId = event && event.detail && event.detail.setId
        ? String(event.detail.setId)
        : ''
      setImportBookReviewSetId(setId)
      setShowImportBook(true)
    }
    window.addEventListener('abc2book-open-book-import', onOpenBookImport)
    return function() {
      window.removeEventListener('abc2book-open-book-import', onOpenBookImport)
    }
  }, [])

  function openBulk() {
    setShowBulk(true)
    if (typeof props.onOpenBulk === 'function') props.onOpenBulk()
  }

  function closeBulk() {
    setShowBulk(false)
    if (typeof props.onCloseBulk === 'function') props.onCloseBulk()
  }

  // Parent can request bulk open (e.g. /add/bulk or discography fill).
  useEffect(function() {
    if (!props.bulkOpenRequest) return
    setShowBulk(true)
  }, [props.bulkOpenRequest])

  return (
    <>
      <Dropdown align="end" className="add-from-dropdown" data-testid="add-from-dropdown">
        <Dropdown.Toggle
          variant="outline-secondary"
          size="lg"
          id="add-from-dropdown-toggle"
          data-testid="add-from-toggle"
          className="add-from-dropdown-toggle"
        >
          Add From
        </Dropdown.Toggle>
        <Dropdown.Menu popperConfig={withDropdownPositionFix({ strategy: 'fixed' })}>
          <Dropdown.Item
            data-testid="add-from-bulk"
            onClick={openBulk}
          >
            Bulk Import
          </Dropdown.Item>
          <Dropdown.Item
            data-testid="add-from-import-book"
            onClick={function() {
              setImportBookReviewSetId('')
              setShowImportBook(true)
            }}
          >
            Import scans or PDF
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item
            data-testid="add-from-file"
            onClick={function() {
              if (fileInputRef.current) fileInputRef.current.click()
            }}
          >
            File
          </Dropdown.Item>
          <Dropdown.Item
            data-testid="add-from-folder"
            onClick={function() {
              if (folderInputRef.current) folderInputRef.current.click()
            }}
          >
            Folder
          </Dropdown.Item>
          <Dropdown.Item
            data-testid="add-from-paste"
            onClick={function() { bumpSignal(setPasteOpenSignal) }}
          >
            Paste
          </Dropdown.Item>
          <Dropdown.Item
            data-testid="add-from-url"
            onClick={function() { bumpSignal(setUrlOpenSignal) }}
          >
            URL
          </Dropdown.Item>
          <Dropdown.Divider />
          {isRecording ? (
            <>
              <Dropdown.Item
                data-testid="add-from-record-stop"
                onClick={function() {
                  if (typeof props.onStopRecording === 'function') props.onStopRecording()
                }}
              >
                Stop recording
              </Dropdown.Item>
              <Dropdown.ItemText className="text-muted small">
                Recording {recordingDuration + 1}s
              </Dropdown.ItemText>
            </>
          ) : (
            <Dropdown.Item
              data-testid="add-from-record"
              onClick={function() {
                if (typeof props.onStartRecording === 'function') props.onStartRecording()
              }}
            >
              Record
            </Dropdown.Item>
          )}
          <Dropdown.Item
            data-testid="add-from-camera"
            disabled={!resolverChecked || !resolverAvailable}
            title={!resolverAvailable ? 'Camera needs the media resolver' : 'Capture sheet image'}
            onClick={function() {
              if (!resolverAvailable) return
              setShowCamera(true)
            }}
          >
            Camera
          </Dropdown.Item>
          <Dropdown.Divider />
          <Dropdown.Item
            data-testid="add-from-google-photos"
            onClick={function() {
              if (typeof props.requireGoogleLogin === 'function') {
                props.requireGoogleLogin(function() { setShowGooglePhotos(true) })
              } else {
                setShowGooglePhotos(true)
              }
            }}
          >
            Google Photos
          </Dropdown.Item>
          <Dropdown.Item
            data-testid="add-from-drive"
            onClick={function() { bumpSignal(setDriveOpenSignal) }}
          >
            Drive
          </Dropdown.Item>
          <Dropdown.Item
            data-testid="add-from-youtube"
            onClick={function() { bumpSignal(setYoutubeOpenSignal) }}
          >
            YouTube
          </Dropdown.Item>
        </Dropdown.Menu>
      </Dropdown>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={addFromFileAcceptList(resolverAvailable)}
        style={{ display: 'none' }}
        onChange={function(event) {
          const selected = event.target.files ? Array.from(event.target.files) : []
          event.target.value = ''
          if (!selected.length) return
          if (selected.length > 1 && typeof props.onImportFiles === 'function') {
            props.onImportFiles(selected)
            return
          }
          if (typeof props.onImportFile === 'function') {
            props.onImportFile(selected[0])
          }
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        webkitdirectory=""
        directory=""
        accept={addFromFileAcceptList(resolverAvailable)}
        style={{ display: 'none' }}
        onChange={function(event) {
          const selected = event.target.files ? Array.from(event.target.files).filter(function(file) {
            const name = String(file && file.name || '').toLowerCase()
            const type = String(file && file.type || '').toLowerCase()
            return type === 'application/pdf' || /\.(pdf|png|jpe?g|webp|gif)$/i.test(name)
          }) : []
          event.target.value = ''
          if (!selected.length) return
          if (typeof props.onImportFiles === 'function') {
            props.onImportFiles(selected)
          }
        }}
      />

      <Modal
        show={showBulk}
        onHide={closeBulk}
        size="xl"
        fullscreen="lg-down"
        data-testid="add-from-bulk-dialog"
      >
        <Modal.Header closeButton>
          <Modal.Title>Bulk import</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <AddBulkImportPanel
            tunebook={props.tunebook}
            tunes={props.tunes}
            token={props.token}
            login={props.login}
            logout={props.logout}
            requestGoogleScopes={props.requestGoogleScopes}
            forceRefresh={props.forceRefresh}
            currentTuneBook={props.currentTuneBook}
            forcedBook={props.forcedBook}
            searchIndex={props.searchIndex}
            loadTuneTexts={props.loadTuneTexts}
            onStartedReview={function() {
              closeBulk()
              if (typeof props.onBulkImportStarted === 'function') props.onBulkImportStarted()
            }}
          />
        </Modal.Body>
      </Modal>

      <ImportBookWizardModal
        show={showImportBook}
        initialReviewSetId={importBookReviewSetId}
        onHide={function() {
          setShowImportBook(false)
          setImportBookReviewSetId('')
        }}
        tunebook={props.tunebook}
        tunes={props.tunes}
        token={props.token}
        user={props.user}
        login={props.login}
        logout={props.logout}
        requestGoogleScopes={props.requestGoogleScopes}
        forceRefresh={props.forceRefresh}
        setCurrentTuneBook={props.setCurrentTuneBook}
      />

      <PasteImportModal
        hideTrigger
        openSignal={pasteOpenSignal}
        onImportText={props.onImportText}
        onImportFiles={props.onImportFiles}
      />
      <ImportUrlModal
        hideTrigger
        openSignal={urlOpenSignal}
        label="URL"
        tunebook={props.tunebook}
        abcjsParser={props.abcjsParser}
        driveApi={props.driveApi}
        accessToken={props.token && props.token.access_token}
        resolverAvailable={resolverAvailable}
        onImportSource={props.onImportSource}
      />
      <DriveFilePickerModal
        hideTrigger
        openSignal={driveOpenSignal}
        label="Drive"
        title="Import from Google Drive"
        token={props.token}
        driveApi={props.driveApi}
        login={props.login}
        requestGoogleScopes={props.requestGoogleScopes}
        onImportSource={props.onImportSource}
      />
      <YouTubeSearchModal
        hideTrigger
        openSignal={youtubeOpenSignal}
        tunebook={props.tunebook}
        token={props.token}
        login={props.login}
        value={props.youtubeSearchQuery || ''}
        onChange={props.onYouTubeChange}
        setBlockKeyboardShortcuts={props.setBlockKeyboardShortcuts}
        renderTrigger={function() { return null }}
      />
      <SheetImageCameraModal
        show={showCamera}
        onHide={function() { setShowCamera(false) }}
        onCapture={function(file) {
          setShowCamera(false)
          if (typeof props.onImportFile === 'function') props.onImportFile(file)
        }}
      />
      <SheetImageGooglePhotosModal
        show={showGooglePhotos}
        onHide={function() { setShowGooglePhotos(false) }}
        token={props.token}
        requestGoogleScopes={props.requestGoogleScopes}
        onLogin={props.login}
        allowVideos={true}
        convertVideosToAudio={true}
        maxItemCount={20}
        onSelectFile={function(file) {
          setShowGooglePhotos(false)
          if (typeof props.onImportFile === 'function') props.onImportFile(file)
        }}
        onImportFiles={function(files) {
          setShowGooglePhotos(false)
          if (typeof props.onImportFiles === 'function') props.onImportFiles(files)
        }}
      />
    </>
  )
}
