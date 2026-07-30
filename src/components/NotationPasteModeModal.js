import { useMemo } from 'react'
import { Button, Modal } from 'react-bootstrap'
import NotationBarOperationPanel from './NotationBarOperationPanel'
import { applyBarOperationToVoice, tuneMeta, voiceBodyFromNotes } from '../scratchpadNotationBarUtils'
import { serializeVoiceEvents } from '../notation/abcVoiceSerializer'
import { parseVoiceEvents } from '../notation/voiceEventModel'
import { injectAbcBarNumbers } from '../scratchpadNotationMerge'
import { pasteStrainBoundaryWarnings } from '../notation/notationStrainBoundary'

export default function NotationPasteModeModal(props) {
  const show = !!props.show
  const mode = props.mode || 'merge'
  const fromBar = Math.max(1, parseInt(props.fromBar, 10) || 1)
  const toBar = props.toBar == null || props.toBar === '' ? null : Math.max(fromBar, parseInt(props.toBar, 10) || fromBar)
  const targetNotes = props.targetNotes || []
  const sourceNotes = props.sourceNotes || []
  const tune = props.tune

  const previewNotes = useMemo(function() {
    if (!tune || !sourceNotes.length) return null
    return applyBarOperationToVoice(targetNotes, sourceNotes, tune, fromBar, mode, {
      toBar: toBar,
    })
  }, [tune, targetNotes, sourceNotes, fromBar, toBar, mode])

  const previewAbc = useMemo(function() {
    if (!previewNotes || !tune) return ''
    const meta = tuneMeta(tune)
    const body = serializeVoiceEvents(
      parseVoiceEvents(voiceBodyFromNotes(previewNotes), meta),
      meta
    )
    const headers = [
      'X:1',
      'T:Preview',
      'M:' + meta.meter,
      'L:' + meta.noteLength,
      'K:' + meta.key,
      body,
    ].join('\n')
    return injectAbcBarNumbers(headers)
  }, [previewNotes, tune])

  const strainWarnings = useMemo(function() {
    return pasteStrainBoundaryWarnings(targetNotes, fromBar, toBar, mode)
  }, [targetNotes, fromBar, toBar, mode])

  return (
    <Modal show={show} onHide={props.onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Paste notation</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <NotationBarOperationPanel
          mode={mode}
          fromBar={fromBar}
          toBar={toBar}
          previewAbc={previewAbc}
          strainWarnings={strainWarnings}
          onModeChange={props.onModeChange}
          onFromBarChange={props.onFromBarChange}
          onToBarChange={props.onToBarChange}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={props.onHide}>Cancel</Button>
        <Button variant="primary" onClick={props.onConfirm}>Paste</Button>
      </Modal.Footer>
    </Modal>
  )
}
