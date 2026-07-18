import { useEffect, useState } from 'react'
import { Button, Modal } from 'react-bootstrap'
import Abc from './Abc'
import MelodyProcessingPanel from './MelodyProcessingPanel'
import useAbcjsParser from '../useAbcjsParser'
import { buildMediaAnalysisNotationAbc } from '../mediaAnalysisSuggestions'
import {
  applyMelodyNoteSettingsToDraft,
} from '../melodyRefilterUtils'
import { loadMelodyNoteSettings } from '../melodyProcessingSettings'

function buildRefineDraft(props) {
  const timedMelody = props.timedMelody || null
  const melodySourceNotes = Array.isArray(props.melodySourceNotes)
    ? props.melodySourceNotes
    : []
  const tune = props.tune || {}
  return {
    melodySourceNotes: melodySourceNotes,
    timedMelody: timedMelody,
    melodyNoteSettings: loadMelodyNoteSettings(),
    metadata: {
      meter: (timedMelody && timedMelody.meter) || tune.meter || '4/4',
      noteLength: tune.noteLength || '1/8',
      key: (timedMelody && (timedMelody.detectedKey || timedMelody.key))
        || tune.key
        || 'C',
    },
    chordsText: props.chordsText || '',
  }
}

/**
 * Fine-tune media-analysis melody notes (refilter) then rematch chords into ABC.
 * Reuses MelodyProcessingPanel notation variant — same path as media-import Notation step.
 */
export default function MelodyAnalysisRefineModal(props) {
  const {
    show,
    onHide,
    tunebook,
    tune,
    melodySourceNotes,
    timedMelody,
    chordsText,
    onApply,
  } = props
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const [settings, setSettings] = useState(loadMelodyNoteSettings)
  const [previewAbc, setPreviewAbc] = useState('')
  const [draftBase, setDraftBase] = useState(null)

  function rebuildPreview(base, nextSettings) {
    if (!base || !base.melodySourceNotes || base.melodySourceNotes.length === 0) {
      setPreviewAbc('')
      return
    }
    const patch = applyMelodyNoteSettingsToDraft(base, nextSettings, tunebook)
    const abc = buildMediaAnalysisNotationAbc({
      melodyText: patch.melodyNotesText || patch.melodyAbcText || '',
      chordsText: base.chordsText || '',
      meter: base.metadata && base.metadata.meter,
      key: base.metadata && base.metadata.key,
      tempo: tune && tune.tempo,
    }, tune, { abcjsParser: abcjsParser })
    setPreviewAbc(abc)
  }

  useEffect(function() {
    if (!show) return
    const base = buildRefineDraft({
      tune: tune,
      melodySourceNotes: melodySourceNotes,
      timedMelody: timedMelody,
      chordsText: chordsText,
    })
    const nextSettings = loadMelodyNoteSettings()
    setDraftBase(base)
    setSettings(nextSettings)
    rebuildPreview(base, nextSettings)
  // eslint-disable-next-line react-hooks/exhaustive-deps -- open-only init from props
  }, [show, melodySourceNotes, timedMelody, chordsText, tune && tune.id])

  function handleSettingsChange(nextSettings) {
    setSettings(nextSettings)
    rebuildPreview(draftBase, nextSettings)
  }

  function handleApply() {
    if (!previewAbc || typeof onApply !== 'function') return
    onApply(previewAbc, { settings: settings })
    if (typeof onHide === 'function') onHide()
  }

  return (
    <Modal show={!!show} onHide={onHide} size="lg" centered>
      <Modal.Header closeButton>
        <Modal.Title>Fine-tune analysis</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p style={{ fontSize: '0.95em', color: '#555' }}>
          Adjust note detection settings, then apply the refined melody (with chord symbols) to this tune.
        </p>
        {(melodySourceNotes || []).length > 0 ? (
          <MelodyProcessingPanel
            variant="notation"
            settings={settings}
            persist={false}
            onChange={handleSettingsChange}
          />
        ) : (
          <p>No analysis source notes available to refine.</p>
        )}
        {previewAbc && tunebook ? (
          <div style={{ marginTop: '1em' }}>
            <Abc
              tunebook={tunebook}
              abc={previewAbc}
              hidePlayer={true}
              hideSvg={false}
              editableTempo={false}
              autoStart={false}
            />
          </div>
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={onHide}>Cancel</Button>
        <Button
          variant="success"
          disabled={!previewAbc}
          onClick={handleApply}
        >
          Apply
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
