import { useRef, useState } from 'react'
import { Button, Modal } from 'react-bootstrap'
import SheetImageCameraModal from '../SheetImageCameraModal'
import { classifyAddFormFile } from '../../addFormAttach'
import { abcTextToCandidates } from '../../importSourceParse'
import { importMidiToAbc } from '../../midiToAbcClient'
import { isMidiImportFile } from '../../midiFileUtils'
import { createScratchpadItem, blankNotationTune } from '../../scratchpadStore'
import utilsFunctions from '../../utilsFunctions'
import { toast } from 'react-toastify'

const utils = utilsFunctions()

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

function defaultTitle(itemType) {
  if (itemType === 'text') return 'Text note'
  if (itemType === 'image') return 'Image'
  if (itemType === 'notation') return 'Notation'
  if (itemType === 'audio') return 'Audio'
  return 'Scratchpad item'
}

function sourcesForType(itemType) {
  if (itemType === 'image') {
    return [
      { key: 'blank', label: 'Blank canvas' },
      { key: 'camera', label: 'Camera' },
      { key: 'import', label: 'Import file' },
    ]
  }
  if (itemType === 'audio') {
    return [
      { key: 'capture', label: 'Record audio' },
      { key: 'import', label: 'Import file' },
    ]
  }
  if (itemType === 'notation') {
    return [
      { key: 'blank', label: 'Blank notation' },
      { key: 'import', label: 'Import ABC/MusicXML/MIDI' },
    ]
  }
  return [
    { key: 'blank', label: 'Blank text' },
    { key: 'import', label: 'Import text file' },
  ]
}

async function importNotationTuneFromFile(file, tunebook, token) {
  const fileTitle = file.name ? file.name.replace(/\.[^.]+$/, '') : 'Notation'
  const kind = classifyAddFormFile(file)

  if (kind === 'midi' || isMidiImportFile(file)) {
    const buffer = await file.arrayBuffer()
    const result = await importMidiToAbc(new Uint8Array(buffer), file.name, token)
    const candidates = abcTextToCandidates(result.abc, tunebook, null)
    if (candidates && candidates.length > 0 && candidates[0].tune) {
      return {
        title: candidates[0].tune.name || fileTitle,
        tuneSnapshot: candidates[0].tune,
      }
    }
    return { title: fileTitle, tuneSnapshot: blankNotationTune(null, fileTitle) }
  }

  const text = await (utils.blobToText ? utils.blobToText(file) : new Response(file).text())
  const candidates = abcTextToCandidates(text, tunebook, null)
  if (candidates && candidates.length > 0 && candidates[0].tune) {
    return {
      title: candidates[0].tune.name || fileTitle,
      tuneSnapshot: candidates[0].tune,
    }
  }
  return null
}

export default function ScratchpadCreateWizard(props) {
  const [itemType, setItemType] = useState('')
  const [busy, setBusy] = useState(false)
  const [showCamera, setShowCamera] = useState(false)
  const fileRef = useRef(null)
  const pendingImportType = useRef('')

  function reset() {
    setItemType('')
    setBusy(false)
    setShowCamera(false)
    pendingImportType.current = ''
  }

  function handleHide() {
    reset()
    if (props.onHide) props.onHide()
  }

  async function finishCreate(item) {
    if (item && props.onCreated) props.onCreated(item.id)
    handleHide()
  }

  async function createFromOptions(type, options) {
    if (busy) return
    setBusy(true)
    try {
      const workspaceId = props.workspaceId
      const title = defaultTitle(type)
      let item

      if (type === 'text') {
        item = await createScratchpadItem({
          workspaceId: workspaceId,
          type: 'text',
          title: options.title || title,
          textBody: options.textBody || '',
        })
      } else if (type === 'image') {
        item = await createScratchpadItem({
          workspaceId: workspaceId,
          type: 'image',
          title: options.title || title,
          blob: options.blob,
        })
      } else if (type === 'notation') {
        item = await createScratchpadItem({
          workspaceId: workspaceId,
          type: 'notation',
          title: options.title || title,
          tuneSnapshot: options.tuneSnapshot || blankNotationTune(null, title),
        })
      } else if (type === 'audio') {
        item = await createScratchpadItem({
          workspaceId: workspaceId,
          type: 'audio',
          title: options.title || title,
          blob: options.blob,
        })
      }

      await finishCreate(item)
    } catch (e) {
      console.error(e)
      toast.error(e && e.message ? e.message : 'Could not create item')
    } finally {
      setBusy(false)
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

    if (sourceKey === 'capture') {
      await createFromOptions('audio', {})
      return
    }

    if (sourceKey === 'import') {
      pendingImportType.current = type
      if (fileRef.current) fileRef.current.click()
    }
  }

  async function handleFileSelected(file) {
    const type = pendingImportType.current || itemType
    if (!file || !type) return

    const kind = classifyAddFormFile(file)
    const fileTitle = file.name ? file.name.replace(/\.[^.]+$/, '') : defaultTitle(type)

    if (type === 'image' && (kind === 'sheetImage' || (file.type && file.type.indexOf('image/') === 0))) {
      await createFromOptions(type, { blob: file, title: fileTitle })
      return
    }
    if (type === 'audio' && kind === 'audio') {
      await createFromOptions(type, { blob: file, title: fileTitle })
      return
    }
    if (type === 'notation') {
      try {
        const imported = await importNotationTuneFromFile(file, props.tunebook, props.token)
        if (imported) {
          await createFromOptions(type, imported)
        } else {
          toast.error('Could not import notation from file')
        }
      } catch (e) {
        toast.error(e && e.message ? e.message : 'Could not import notation')
      }
      return
    }
    if (type === 'text') {
      const text = await new Response(file).text()
      await createFromOptions(type, { textBody: text, title: fileTitle })
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
        {sourcesForType(itemType).map(function(src) {
          return (
            <Button
              key={src.key}
              variant="outline-primary"
              className="m-1"
              disabled={busy}
              onClick={function() { handleSourceClick(itemType, src.key) }}
            >
              {src.label}
            </Button>
          )
        })}
      </div>
    )
  }

  return (
    <>
      <Modal show={!!props.show && !showCamera} onHide={handleHide} centered size="lg">
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
          style={{ display: 'none' }}
          accept={
            itemType === 'image' ? 'image/*,.pdf'
              : itemType === 'audio' ? 'audio/*'
                : itemType === 'notation' ? '.abc,.txt,.xml,.musicxml,.mxl,.mid,.midi,audio/midi'
                  : '.txt,.md'
          }
          onChange={function(e) {
            const file = e.target.files && e.target.files[0]
            if (file) handleFileSelected(file)
            e.target.value = ''
          }}
        />
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
    </>
  )
}
