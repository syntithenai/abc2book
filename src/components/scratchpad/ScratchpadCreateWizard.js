import { useMemo, useRef, useState } from 'react'
import { Button, Modal, Spinner } from 'react-bootstrap'
import { toast } from 'react-toastify'
import SheetImageCameraModal from '../SheetImageCameraModal'
import SheetImageGooglePhotosModal from '../SheetImageGooglePhotosModal'
import GoogleUnverifiedAppAlert from '../GoogleUnverifiedAppAlert'
import { createScratchpadItem, blankNotationTune } from '../../scratchpadStore'
import { getScratchpadNotationImportAccess } from '../../scratchpadNotationImportAccess'
import useMediaResolverHealth from '../../useMediaResolverHealth'
import {
  buildScratchpadCreateOptions,
  defaultTitle,
  getScratchpadDriveMimeTypes,
  getScratchpadFileAccept,
  pickScratchpadDriveFiles,
  prepareScratchpadCreateFiles,
  scratchpadSourcesForType,
} from '../../scratchpadCreateImport'
import { openCreditSettings } from '../../resolverCreditAccess'

function blankImageBlob() {
  const canvas = document.createElement('canvas')
  canvas.width = 1200
  canvas.height = 1600
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  return new Promise(function(resolve) {
    canvas.toBlob(function(blob) { resolve(blob) }, 'image/png')
  })
}

export default function ScratchpadCreateWizard(props) {
  const [itemType, setItemType] = useState('')
  const [busy, setBusy] = useState(false)
  const [importStatus, setImportStatus] = useState('')
  const [showCamera, setShowCamera] = useState(false)
  const [showGooglePhotos, setShowGooglePhotos] = useState(false)
  const [showDriveConsent, setShowDriveConsent] = useState(false)
  const [pendingDriveType, setPendingDriveType] = useState('')
  const fileRef = useRef(null)
  const pendingImportType = useRef('')
  const { available: resolverAvailable, checked: resolverChecked, status: resolverStatus } = useMediaResolverHealth()
  const notationImportAccess = useMemo(function() {
    return getScratchpadNotationImportAccess({
      resolverAvailable: resolverAvailable,
      resolverChecked: resolverChecked,
      resolverStatus: resolverStatus,
      accessToken: props.token,
    })
  }, [resolverAvailable, resolverChecked, resolverStatus, props.token])

  function reset() {
    setItemType('')
    setBusy(false)
    setImportStatus('')
    setShowCamera(false)
    setShowGooglePhotos(false)
    setShowDriveConsent(false)
    setPendingDriveType('')
    pendingImportType.current = ''
  }

  function handleHide() {
    reset()
    if (props.onHide) props.onHide()
  }

  function finishCreate(itemIds) {
    const ids = Array.isArray(itemIds) ? itemIds.filter(Boolean) : []
    if (!ids.length) return
    if (ids.length === 1) {
      if (props.onCreated) props.onCreated(ids[0])
    } else if (props.onCreatedMany) {
      props.onCreatedMany(ids)
    } else if (props.onCreated) {
      props.onCreated(ids[0])
      toast.success('Created ' + ids.length + ' scratchpad items')
    }
    handleHide()
  }

  async function createScratchpadItemFromOptions(type, options) {
    const opts = options || {}
    const workspaceId = props.workspaceId
    const title = defaultTitle(type)

    if (type === 'text') {
      return createScratchpadItem({
        workspaceId: workspaceId,
        type: 'text',
        title: opts.title || title,
        textBody: opts.textBody || '',
      })
    }
    if (type === 'image') {
      return createScratchpadItem({
        workspaceId: workspaceId,
        type: 'image',
        title: opts.title || title,
        blob: opts.blob,
      })
    }
    if (type === 'notation') {
      return createScratchpadItem({
        workspaceId: workspaceId,
        type: 'notation',
        title: opts.title || title,
        tuneSnapshot: opts.tuneSnapshot || blankNotationTune(null, title),
      })
    }
    if (type === 'audio') {
      return createScratchpadItem({
        workspaceId: workspaceId,
        type: 'audio',
        title: opts.title || title,
        blob: opts.blob,
      })
    }
    return null
  }

  async function createFromOptions(type, options) {
    const item = await createScratchpadItemFromOptions(type, options)
    if (item) finishCreate([item.id])
    return item
  }

  function beginGoogleImport(statusMessage) {
    setBusy(true)
    setImportStatus(statusMessage || 'Creating scratchpad items…')
  }

  function endGoogleImport() {
    setBusy(false)
    setImportStatus('')
  }

  function driveFetchStatus(done, total) {
    if (total > 1) {
      return 'Fetching file ' + done + ' of ' + total + ' from Google Drive…'
    }
    return 'Fetching file from Google Drive…'
  }

  function createItemsStatus(done, total) {
    if (total > 1) {
      return 'Creating scratchpad item ' + done + ' of ' + total + '…'
    }
    return 'Creating scratchpad item…'
  }

  async function createManyFromFiles(type, files, options) {
    const opts = options || {}
    const prepared = prepareScratchpadCreateFiles(type, files)
    const filesToImport = prepared.files
    if (!filesToImport.length) return
    if (prepared.skipped > 0) {
      toast.info('Only the first file was imported because MIDI import uses a wizard.')
    }
    const createdIds = []
    let failed = 0
    for (let i = 0; i < filesToImport.length; i += 1) {
      const file = filesToImport[i]
      if (!opts.silentProgress) {
        setImportStatus(createItemsStatus(i + 1, filesToImport.length))
      }
      try {
        const options = await buildScratchpadCreateOptions(type, file, {
          tunebook: props.tunebook,
          token: props.token,
          abcOnly: notationImportAccess.abcOnly,
        })
        if (!options) {
          failed += 1
          continue
        }
        const item = await createScratchpadItemFromOptions(type, options)
        if (item && item.id) createdIds.push(item.id)
      } catch (e) {
        failed += 1
        console.error(e)
      }
    }
    if (!createdIds.length) {
      throw new Error('Could not create scratchpad items from the selected files')
    }
    if (failed > 0) {
      toast.warn('Created ' + createdIds.length + ' items; ' + failed + ' file(s) could not be imported')
    }
    finishCreate(createdIds)
  }

  function beginNotationLogin() {
    if (typeof props.login !== 'function') {
      toast.error('Log in to import MusicXML and MIDI')
      return
    }
    props.login().catch(function(e) {
      if (e && e.message && e.message.indexOf('cancelled') === -1
        && e.message.indexOf('Sign-in cancelled') === -1) {
        toast.error(e.message)
      }
    })
  }

  async function handleDriveImport(type) {
    if (busy) return
    if (!props.token) return
    try {
      const files = await pickScratchpadDriveFiles({
        token: props.token,
        driveApi: props.driveApi,
        requestGoogleScopes: props.requestGoogleScopes,
        itemType: type,
        mimeTypes: getScratchpadDriveMimeTypes(type, notationImportAccess),
        title: 'Choose Google Drive files',
        multiSelect: true,
        onFetchStart: function(total) {
          beginGoogleImport(driveFetchStatus(1, total))
        },
        onFetchProgress: function(done, total) {
          setImportStatus(driveFetchStatus(done, total))
        },
      })
      if (!files.length) return
      beginGoogleImport(createItemsStatus(1, files.length))
      await createManyFromFiles(type, files)
    } catch (e) {
      if (!e || !e.message || e.message.indexOf('cancelled') === -1) {
        toast.error(e && e.message ? e.message : 'Could not import from Google Drive')
      }
    } finally {
      endGoogleImport()
    }
  }

  async function handleSourceClick(type, sourceKey) {
    if (busy) return

    if (sourceKey === 'blank') {
      if (type === 'image') {
        const blob = await blankImageBlob()
        await createFromOptions(type, { blob: blob })
        return
      }
      await createFromOptions(type, {})
      return
    }

    if (sourceKey === 'camera') {
      setShowCamera(true)
      return
    }

    if (sourceKey === 'google-photos') {
      setShowGooglePhotos(true)
      return
    }

    if (sourceKey === 'capture') {
      await createFromOptions('audio', {})
      return
    }

    if (sourceKey === 'login-import') {
      beginNotationLogin()
      return
    }

    if (sourceKey === 'credit-import') {
      openCreditSettings()
      return
    }

    if (sourceKey === 'drive') {
      setPendingDriveType(type)
      setShowDriveConsent(true)
      return
    }

    if (sourceKey === 'import') {
      if (type === 'notation' && !notationImportAccess.canPickFile) {
        return
      }
      pendingImportType.current = type
      if (fileRef.current) fileRef.current.click()
    }
  }

  async function handleFilesSelected(fileList) {
    const type = pendingImportType.current || itemType
    const allFiles = fileList ? Array.from(fileList).filter(Boolean) : []
    if (!allFiles.length || !type) return

    const prepared = prepareScratchpadCreateFiles(type, allFiles)
    const files = prepared.files
    if (prepared.skipped > 0) {
      toast.info('Only the first file was imported because MIDI import uses a wizard.')
    }
    if (!files.length) return

    if (files.length === 1) {
      try {
        const options = await buildScratchpadCreateOptions(type, files[0], {
          tunebook: props.tunebook,
          token: props.token,
          abcOnly: notationImportAccess.abcOnly,
        })
        if (!options) {
          toast.error('Could not import file')
          return
        }
        await createFromOptions(type, options)
      } catch (e) {
        if (!e || !e.message || e.message.indexOf('cancelled') === -1) {
          toast.error(e && e.message ? e.message : 'Could not import file')
        }
      }
      return
    }

    setBusy(true)
    try {
      await createManyFromFiles(type, files)
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Could not import files')
    } finally {
      setBusy(false)
    }
  }

  function renderTypeChoices() {
    return (
      <div className="scratchpad-wizard-types">
        {['text', 'image', 'notation', 'audio'].map(function(type) {
          const label = type.charAt(0).toUpperCase() + type.slice(1)
          return (
            <Button
              key={type}
              variant={itemType === type ? 'primary' : 'outline-primary'}
              className="m-1"
              disabled={busy}
              onClick={function() { setItemType(type) }}
            >
              {label}
            </Button>
          )
        })}
      </div>
    )
  }

  function renderSourceChoices() {
    if (!itemType) return null
    return (
      <div className="scratchpad-wizard-sources mt-3">
        <div className="small text-muted mb-2">Choose how to create your {itemType} item:</div>
        {scratchpadSourcesForType(itemType, notationImportAccess, {
          loggedIn: !!props.token,
        }).map(function(src) {
          const disabled = busy
            || (itemType === 'notation' && src.key === 'import' && !notationImportAccess.canPickFile)
          const importTitle = itemType === 'notation'
            && (src.key === 'login-import' || src.key === 'credit-import')
            && notationImportAccess.loginWarning
            ? notationImportAccess.loginWarning.message
            : undefined
          return (
            <Button
              key={src.key}
              variant="outline-primary"
              className="m-1"
              disabled={disabled}
              title={importTitle}
              onClick={function() { handleSourceClick(itemType, src.key) }}
            >
              {src.label}
            </Button>
          )
        })}
      </div>
    )
  }

  const fileAccept = getScratchpadFileAccept(itemType, notationImportAccess)

  return (
    <>
      <Modal
        show={!!props.show && !showCamera && !showGooglePhotos && !showDriveConsent && !busy}
        onHide={handleHide}
        centered
        size="lg"
      >
        <Modal.Header closeButton>
          <Modal.Title>Create scratchpad item</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          {renderTypeChoices()}
          {renderSourceChoices()}
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" onClick={handleHide} disabled={busy}>Cancel</Button>
        </Modal.Footer>
        <input
          ref={fileRef}
          type="file"
          multiple
          style={{ display: 'none' }}
          accept={fileAccept || undefined}
          onChange={function(e) {
            handleFilesSelected(e.target.files)
            e.target.value = ''
          }}
        />
      </Modal>

      <Modal
        show={busy}
        onHide={function() {}}
        backdrop="static"
        keyboard={false}
        centered
        dialogClassName="scratchpad-create-import-loading-modal"
      >
        <Modal.Body className="text-center py-4">
          <Spinner animation="border" role="status" className="mb-3" />
          <div>{importStatus || 'Creating scratchpad items…'}</div>
        </Modal.Body>
      </Modal>

      <Modal
        show={showDriveConsent}
        onHide={function() {}}
        backdrop="static"
        keyboard={false}
        centered
      >
        <Modal.Header>
          <Modal.Title>Choose Google Drive files</Modal.Title>
        </Modal.Header>
        <Modal.Body>
          <p className="mb-2">
            Choose one or more files from your Google Drive library.
          </p>
          <GoogleUnverifiedAppAlert permissionNote="Drive access is a sensitive permission." />
        </Modal.Body>
        <Modal.Footer>
          <Button
            variant="outline-secondary"
            onClick={function() {
              setShowDriveConsent(false)
              setPendingDriveType('')
            }}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            disabled={busy}
            onClick={async function() {
              const type = pendingDriveType
              setShowDriveConsent(false)
              setPendingDriveType('')
              if (type) await handleDriveImport(type)
            }}
          >
            {busy ? 'Opening…' : 'Choose files'}
          </Button>
        </Modal.Footer>
      </Modal>

      <SheetImageCameraModal
        show={showCamera}
        onHide={function() { setShowCamera(false) }}
        onCapture={async function(file) {
          setShowCamera(false)
          if (!file || !file.blob) return
          const title = file.name ? file.name.replace(/\.[^.]+$/, '') : 'Camera capture'
          await createFromOptions('image', { blob: file.blob, title: title })
        }}
      />

      <SheetImageGooglePhotosModal
        show={showGooglePhotos}
        onHide={function() { setShowGooglePhotos(false) }}
        token={props.token}
        requestGoogleScopes={props.requestGoogleScopes}
        onLogin={props.login}
        maxItemCount={50}
        onSelectFile={async function(file) {
          setShowGooglePhotos(false)
          if (!file) return
          beginGoogleImport('Creating scratchpad item…')
          try {
            const title = file.name ? file.name.replace(/\.[^.]+$/, '') : 'Google Photos'
            await createFromOptions('image', { blob: file, title: title })
          } catch (e) {
            toast.error(e && e.message ? e.message : 'Could not import photo')
            endGoogleImport()
          }
        }}
        onImportFiles={async function(files) {
          setShowGooglePhotos(false)
          if (!files || !files.length) return
          beginGoogleImport(createItemsStatus(1, files.length))
          try {
            await createManyFromFiles('image', files)
          } catch (e) {
            toast.error(e && e.message ? e.message : 'Could not import photos')
          } finally {
            endGoogleImport()
          }
        }}
      />
    </>
  )
}
