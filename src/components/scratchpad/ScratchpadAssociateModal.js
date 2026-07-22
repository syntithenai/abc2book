import { useMemo, useState } from 'react'
import { Button, Form, ListGroup, Modal } from 'react-bootstrap'
import { toast } from 'react-toastify'
import ReviewNotationMergePanel from '../ReviewNotationMergePanel'
import LyricsMergePanel, { buildLyricsMergeResult } from '../mediaImportWizard/LyricsMergePanel'
import { getScratchpadBlob } from '../../scratchpadBlobs'
import { getActiveTake, normalizeAudioProject } from '../../scratchpadAudioProject'
import { updateScratchpadItem } from '../../scratchpadStore'
import {
  attachScratchpadImageToTune,
  attachScratchpadAudioToTune,
  mergeScratchpadNotationIntoTune,
  mergeScratchpadLyricsIntoTune,
  mergeScratchpadBackgroundIntoTune,
  getScratchpadMelodyNotesText,
  getTuneMelodyNotesText,
} from '../../scratchpadAssociate'
import { getPlainLyricLines } from '../../wLinesUtils'

export default function ScratchpadAssociateModal(props) {
  const item = props.item
  const tunes = props.tunes || {}
  const [search, setSearch] = useState('')
  const [selectedTuneId, setSelectedTuneId] = useState('')
  const [step, setStep] = useState('pick')
  const [melodyChoice, setMelodyChoice] = useState('')
  const [busy, setBusy] = useState(false)

  const tuneList = useMemo(function() {
    const q = String(search || '').trim().toLowerCase()
    return Object.keys(tunes).map(function(id) { return tunes[id] }).filter(function(tune) {
      if (!tune || !tune.id) return false
      if (!q) return true
      const name = String(tune.name || '').toLowerCase()
      const composer = String(tune.composer || '').toLowerCase()
      return name.indexOf(q) >= 0 || composer.indexOf(q) >= 0
    }).sort(function(a, b) {
      return String(a.name || '').localeCompare(String(b.name || ''))
    }).slice(0, 50)
  }, [tunes, search])

  const selectedTune = selectedTuneId ? tunes[selectedTuneId] : null

  function reset() {
    setSearch('')
    setSelectedTuneId('')
    setStep('pick')
    setMelodyChoice('')
    setBusy(false)
  }

  function handleHide() {
    reset()
    if (props.onHide) props.onHide()
  }

  function goToMerge() {
    if (!selectedTune) return
    if (item.type === 'image' || item.type === 'audio') {
      setStep('confirm')
    } else if (item.type === 'notation') {
      setMelodyChoice(getScratchpadMelodyNotesText(item))
      setStep('notation')
    } else if (item.type === 'text') {
      if (props.associateMode === 'background') {
        setStep('background')
      } else {
        setStep('lyrics')
      }
    }
  }

  async function handleAttach() {
    if (!selectedTune || !props.tunebook) return
    setBusy(true)
    try {
      let tune = Object.assign({}, selectedTune)

      if (item.type === 'image') {
        const blob = await getScratchpadBlob(item.image && item.image.blobKey)
        if (!blob) throw new Error('Missing image')
        tune = await attachScratchpadImageToTune(tune, blob, {
          name: item.title || 'Scratchpad image',
          type: blob.type || 'image/png',
          uploadToDrive: false,
        })
      } else if (item.type === 'audio') {
        const audio = normalizeAudioProject(item)
        let blob = null
        if (audio.mixdownBlobKey) {
          blob = await getScratchpadBlob(audio.mixdownBlobKey)
        }
        if (!blob || blob.size <= 0) {
          const track = (audio.tracks || []).find(function(t) { return t.type === 'audio' })
          const take = track ? getActiveTake(track) : null
          if (take && take.blobKey) blob = await getScratchpadBlob(take.blobKey)
        }
        if (!blob) throw new Error('Missing audio')
        tune = await attachScratchpadAudioToTune(tune, blob, {
          title: item.title || 'Scratchpad audio',
          token: props.token,
          item: Object.assign({}, item, { audio: audio }),
        })
      } else if (item.type === 'notation') {
        tune = mergeScratchpadNotationIntoTune(
          tune,
          item.notation && item.notation.tuneSnapshot,
          melodyChoice,
          'append'
        )
      } else if (item.type === 'text') {
        if (props.associateMode === 'background') {
          tune = mergeScratchpadBackgroundIntoTune(
            tune,
            String(item.text && item.text.body || ''),
            'replace'
          )
        } else {
          const merged = buildLyricsMergeResult(
            getPlainLyricLines(selectedTune),
            String(item.text && item.text.body || '').split('\n')
          )
          const lines = Array.isArray(merged) ? merged : String(merged).split('\n')
          tune = mergeScratchpadLyricsIntoTune(tune, lines.join('\n'), 'replace')
        }
      }

      tune.id = selectedTune.id
      await props.tunebook.saveTune(tune, false, { historyLabel: 'Associate scratchpad', immediate: true })
      updateScratchpadItem(item.id, { linkedTuneId: selectedTune.id })
      toast.success('Attached to ' + (selectedTune.name || 'tune'))
      if (props.onAssociated) props.onAssociated()
      handleHide()
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Could not associate')
    } finally {
      setBusy(false)
    }
  }

  return (
    <Modal show={!!props.show} onHide={handleHide} size="lg" centered scrollable>
      <Modal.Header closeButton>
        <Modal.Title>Associate with tune</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        {step === 'pick' ? (
          <>
            <Form.Control
              className="mb-2"
              placeholder="Search tunes…"
              value={search}
              onChange={function(e) { setSearch(e.target.value) }}
            />
            <ListGroup>
              {tuneList.map(function(tune) {
                return (
                  <ListGroup.Item
                    key={tune.id}
                    action
                    active={selectedTuneId === tune.id}
                    onClick={function() { setSelectedTuneId(tune.id) }}
                  >
                    {tune.name}
                    {tune.composer ? <span className="text-muted"> — {tune.composer}</span> : null}
                  </ListGroup.Item>
                )
              })}
            </ListGroup>
          </>
        ) : null}

        {step === 'confirm' ? (
          <p>
            Attach <strong>{item.title}</strong> to <strong>{selectedTune && selectedTune.name}</strong> as{' '}
            {item.type === 'image' ? 'a snapshot' : 'audio media'}?
          </p>
        ) : null}

        {step === 'notation' && selectedTune ? (
          <ReviewNotationMergePanel
            currentText={getTuneMelodyNotesText(selectedTune)}
            importedText={getScratchpadMelodyNotesText(item)}
            metadata={{
              meter: selectedTune.meter,
              noteLength: selectedTune.noteLength,
              key: selectedTune.key,
            }}
            onChange={setMelodyChoice}
          />
        ) : null}

        {step === 'background' && selectedTune ? (
          <p>
            Copy scratchpad text into <strong>{selectedTune.name}</strong> background information?
          </p>
        ) : null}

        {step === 'lyrics' && selectedTune ? (
          <LyricsMergePanel
            currentLines={getPlainLyricLines(selectedTune)}
            importedLines={String(item.text && item.text.body || '').split('\n')}
          />
        ) : null}
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleHide}>Cancel</Button>
        {step === 'pick' ? (
          <Button variant="primary" disabled={!selectedTuneId} onClick={goToMerge}>Next</Button>
        ) : (
          <Button variant="success" disabled={busy} onClick={handleAttach}>
            {busy ? 'Saving…' : 'Attach & merge'}
          </Button>
        )}
      </Modal.Footer>
    </Modal>
  )
}
