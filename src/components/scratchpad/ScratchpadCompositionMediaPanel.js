import { useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup, Dropdown, ListGroup } from 'react-bootstrap'
import { toast } from 'react-toastify'
import useAudioUtils from '../../useAudioUtils'
import { mediaFileAcceptList, isAudioImportFile, readAudioFileMetadata } from '../../audioFileMetadata'
import {
  compositionMediaAttachments,
  createCompositionMediaAttachmentDraft,
  addCompositionMediaAttachment,
  removeCompositionMediaAttachment,
  storeCompositionMediaBlob,
  deleteCompositionMediaBlob,
} from '../../scratchpadCompositionMedia'

export default function ScratchpadCompositionMediaPanel(props) {
  const item = props.item
  const composition = props.composition || {}
  const tunebook = props.tunebook
  const icons = tunebook && tunebook.icons || {}
  const attachments = compositionMediaAttachments(composition)
  const audioUtils = useAudioUtils()
  const fileInputRef = useRef(null)
  const recordingStartedAt = useRef(0)
  const recordingIntervalRef = useRef(null)
  const [recordingDuration, setRecordingDuration] = useState(0)
  const [busy, setBusy] = useState(false)

  useEffect(function() {
    return function() {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
    }
  }, [])

  function persistComposition(nextComposition) {
    if (props.onCompositionChange) props.onCompositionChange(nextComposition)
  }

  async function addBlobAttachment(blob, options) {
    const opts = options || {}
    if (!blob || !blob.size) {
      toast.info('No audio captured')
      return
    }
    setBusy(true)
    try {
      const draft = createCompositionMediaAttachmentDraft(item.id, {
        title: opts.title || 'Audio',
        mimeType: blob.type || opts.mimeType || 'audio/webm',
        fileName: opts.fileName || 'audio.webm',
        source: opts.source || 'file',
        order: attachments.length,
      })
      await storeCompositionMediaBlob(item.id, draft.id, blob)
      const next = addCompositionMediaAttachment(composition, draft)
      persistComposition(next)
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Could not attach audio')
    } finally {
      setBusy(false)
    }
  }

  function openFilePicker() {
    if (fileInputRef.current) fileInputRef.current.click()
  }

  async function handleAttachFiles(event) {
    const files = event.target.files
    event.target.value = ''
    if (!files || !files.length) return
    for (let i = 0; i < files.length; i += 1) {
      const file = files[i]
      if (!isAudioImportFile(file)) {
        toast.warning('Please choose an audio or video file')
        continue
      }
      const metadata = await readAudioFileMetadata(file)
      await addBlobAttachment(file, {
        title: metadata.title || file.name,
        fileName: file.name,
        mimeType: file.type,
        source: 'file',
      })
    }
  }

  function startRecording() {
    if (audioUtils.isRecording || busy) return
    recordingStartedAt.current = Date.now()
    setRecordingDuration(0)
    if (recordingIntervalRef.current) clearInterval(recordingIntervalRef.current)
    recordingIntervalRef.current = setInterval(function() {
      setRecordingDuration(parseInt((Date.now() - recordingStartedAt.current) / 1000, 10))
    }, 1000)
    audioUtils.startRecording().then(function(blob) {
      if (recordingIntervalRef.current) {
        clearInterval(recordingIntervalRef.current)
        recordingIntervalRef.current = null
      }
      if (!blob) return
      return addBlobAttachment(blob, {
        title: 'Recording ' + new Date().toLocaleString(),
        fileName: 'recording.webm',
        source: 'mic',
      })
    }).catch(function(e) {
      toast.error(e && e.message ? e.message : 'Recording failed')
    })
  }

  function stopRecording() {
    audioUtils.stopRecording()
  }

  async function handleRemove(attachmentId) {
    if (!attachmentId) return
    setBusy(true)
    try {
      await deleteCompositionMediaBlob(item.id, attachmentId)
      const next = removeCompositionMediaAttachment(composition, attachmentId)
      persistComposition(next)
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Could not remove audio')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="scratchpad-composition-media-panel">
      <div className="scratchpad-composition-media-head">
        <h5 className="scratchpad-composition-media-title">Composition audio</h5>
        <div className="scratchpad-composition-media-actions">
          <input
            ref={fileInputRef}
            type="file"
            accept={mediaFileAcceptList()}
            multiple
            className="d-none"
            onChange={handleAttachFiles}
          />
          {audioUtils.isRecording ? (
            <>
              <Button size="sm" variant="danger" onClick={stopRecording}>
                {icons.stopsmall || '■'} Stop recording
              </Button>
              <Button size="sm" variant="outline-danger" disabled aria-label="Recording duration">
                {recordingDuration + 1}s
              </Button>
            </>
          ) : (
            <ButtonGroup className="scratchpad-composition-media-attach-group">
              <Button
                size="sm"
                variant="primary"
                disabled={busy}
                onClick={openFilePicker}
              >
                {icons.paperclip ? <span className="me-1">{icons.paperclip}</span> : null}
                Attach audio files
              </Button>
              <Dropdown as={ButtonGroup}>
                <Dropdown.Toggle
                  split
                  variant="primary"
                  size="sm"
                  disabled={busy}
                  aria-label="More attach options"
                />
                <Dropdown.Menu align="end">
                  <Dropdown.Item onClick={startRecording}>
                    {icons.recordcircle ? <span className="me-1">{icons.recordcircle}</span> : null}
                    Record audio
                  </Dropdown.Item>
                </Dropdown.Menu>
              </Dropdown>
            </ButtonGroup>
          )}
        </div>
      </div>
      <p className="scratchpad-composition-media-help text-muted small">
        Audio is attached to the whole composition and exported as tune media links when you associate with a tune.
      </p>
      {attachments.length ? (
        <ListGroup className="scratchpad-composition-media-list">
          {attachments.map(function(entry) {
            return (
              <ListGroup.Item
                key={entry.id}
                className="scratchpad-composition-media-item d-flex align-items-center justify-content-between gap-2"
              >
                <div className="scratchpad-composition-media-item-title">
                  {entry.title || 'Audio'}
                  {entry.source === 'mic' ? (
                    <span className="text-muted small ms-1">(recording)</span>
                  ) : null}
                </div>
                <Button
                  size="sm"
                  variant="outline-danger"
                  disabled={busy || audioUtils.isRecording}
                  onClick={function() { handleRemove(entry.id) }}
                  aria-label="Remove audio"
                >
                  {icons.deletebin || 'Remove'}
                </Button>
              </ListGroup.Item>
            )
          })}
        </ListGroup>
      ) : (
        <div className="text-muted small">No audio attached yet.</div>
      )}
    </div>
  )
}
