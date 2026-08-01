import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Button, Form, ListGroup, Modal } from 'react-bootstrap'
import { toast } from 'react-toastify'
import useAbcjsParser from '../../useAbcjsParser'
import LyricsMergePanel, { buildLyricsMergeResult } from '../mediaImportWizard/LyricsMergePanel'
import ScratchpadNotationBarPickerPanel from './ScratchpadNotationBarPickerPanel'
import { getScratchpadBlob } from '../../scratchpadBlobs'
import { getActiveTake, normalizeAudioProject } from '../../scratchpadAudioProject'
import { updateScratchpadItem, getScratchpadItem } from '../../scratchpadStore'
import {
  attachScratchpadImageToTune,
  attachScratchpadAudioToTune,
  attachScratchpadNotationMidiToTune,
  mergeScratchpadNotationIntoTune,
  mergeScratchpadLyricsIntoTune,
  mergeScratchpadBackgroundIntoTune,
  mergeScratchpadChordsIntoTune,
  mergeScratchpadCompositionIntoTune,
  getNotationAssociateMergeMode,
  isNotationAssociateMode,
  isNotationBarPickerMode,
} from '../../scratchpadAssociate'
import {
  buildDefaultVoiceMapping,
  countVoiceBars,
  defaultEndBarForRange,
  maxVoiceBarCount,
} from '../../scratchpadNotationMerge'
import { getPlainLyricLines } from '../../wLinesUtils'
import { getScratchpadAssociateSuggestions, recordScratchpadAssociateTarget } from '../../scratchpadAssociateRecent'
import {
  editorPathForScratchpadAssociate,
  showScratchpadAssociateSuccessToast,
} from '../../scratchpadAssociateToast'

function modalTitleForMode(associateMode, itemType, step) {
  if (isNotationAssociateMode(associateMode)) {
    if (step === 'pick') return 'Assign notation - Pick a song'
    return 'Assign notation'
  }
  if (associateMode === 'midi') return 'Attach as MIDI link'
  if (itemType === 'image') return 'Attach snapshot to tune'
  if (itemType === 'audio') return 'Attach audio to tune'
  return 'Associate with tune'
}

function attachLabelForMode(associateMode, notationOperation) {
  if (associateMode === 'midi') return 'Attach as MIDI link'
  if (notationOperation === 'insert') return 'Insert'
  if (notationOperation === 'replace') return 'Replace'
  if (isNotationAssociateMode(associateMode)) return 'Assign'
  return 'Attach'
}

function successMessageForMode(associateMode, tuneName, notationOperation) {
  const name = tuneName || 'tune'
  const op = notationOperation || 'merge'
  if (isNotationAssociateMode(associateMode)) {
    if (op === 'insert') return 'Inserted into ' + name
    if (op === 'replace') return 'Replaced notation on ' + name
    return 'Merged into ' + name
  }
  if (associateMode === 'chords') return 'Pasted chords and lyrics into ' + name
  if (associateMode === 'lyrics') return 'Merged lyrics into ' + name
  if (associateMode === 'background') return 'Copied background info into ' + name
  if (associateMode === 'composition') return 'Associated composition with ' + name
  return 'Attached to ' + name
}

function historyLabelForMode(associateMode, notationOperation) {
  const op = notationOperation || 'merge'
  if (isNotationAssociateMode(associateMode)) {
    if (op === 'insert') return 'Insert scratchpad notation'
    if (op === 'replace') return 'Replace with scratchpad notation'
    return 'Merge scratchpad notation'
  }
  if (associateMode === 'chords') return 'Paste chords and lyrics from scratchpad'
  if (associateMode === 'lyrics') return 'Merge scratchpad lyrics'
  if (associateMode === 'background') return 'Copy scratchpad background info'
  if (associateMode === 'composition') return 'Associate scratchpad composition'
  return 'Associate scratchpad'
}

function getScratchpadNotationTune(item) {
  const current = getScratchpadItem(item && item.id) || item
  if (!current || !current.notation || !current.notation.tuneSnapshot) return null
  return JSON.parse(JSON.stringify(current.notation.tuneSnapshot))
}

function sourceBarCountForTune(sourceTune) {
  if (!sourceTune || !sourceTune.voices) return 0
  const keys = Object.keys(sourceTune.voices)
  if (!keys.length) return 0
  return countVoiceBars(sourceTune.voices[keys[0]].notes, sourceTune)
}

function maxBarForTune(tune) {
  if (!tune || !tune.voices) return 1
  const byKey = {}
  Object.keys(tune.voices).forEach(function(key) {
    byKey[key] = tune.voices[key].notes
  })
  return Math.max(1, maxVoiceBarCount(byKey, tune))
}

export default function ScratchpadAssociateModal(props) {
  const navigate = useNavigate()
  const abcjsParser = useAbcjsParser()
  const item = props.item
  const tunes = props.tunes || {}
  const associateMode = props.associateMode || ''
  const [search, setSearch] = useState('')
  const [selectedTuneId, setSelectedTuneId] = useState('')
  const [step, setStep] = useState('pick')
  const [busy, setBusy] = useState(false)
  const [voiceMapping, setVoiceMapping] = useState({})
  const [notationOperation, setNotationOperation] = useState('merge')
  const [fromBar, setFromBar] = useState(1)
  const [toBar, setToBar] = useState(null)

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

  const suggestedTunes = useMemo(function() {
    return getScratchpadAssociateSuggestions(tunes, {
      associateMode: associateMode,
      linkedTuneId: item && item.linkedTuneId,
      limit: 10,
    })
  }, [tunes, associateMode, item && item.id, item && item.linkedTuneId])

  const selectedTune = selectedTuneId ? tunes[selectedTuneId] : null
  const scratchpadTune = useMemo(function() {
    return getScratchpadNotationTune(item)
  }, [item && item.id, item && item.notation])

  useEffect(function() {
    if (!selectedTune || !scratchpadTune) {
      setVoiceMapping({})
      return
    }
    setVoiceMapping(buildDefaultVoiceMapping(scratchpadTune, selectedTune))
  }, [selectedTune && selectedTune.id, scratchpadTune])

  function resetBarRangeForAssign(tune, sourceTune, operation) {
    const start = 1
    setFromBar(start)
    if (operation === 'insert') {
      setToBar(null)
      return
    }
    const sourceBars = sourceBarCountForTune(sourceTune)
    setToBar(defaultEndBarForRange(start, sourceBars, maxBarForTune(tune)))
  }

  useEffect(function() {
    if (!selectedTune || !scratchpadTune) return
    resetBarRangeForAssign(selectedTune, scratchpadTune, notationOperation)
  }, [selectedTune && selectedTune.id, scratchpadTune, notationOperation])

  function reset() {
    setSearch('')
    setSelectedTuneId('')
    setStep('pick')
    setBusy(false)
    setVoiceMapping({})
    setNotationOperation('merge')
    setFromBar(1)
    setToBar(null)
  }

  function handleHide() {
    reset()
    if (props.onHide) props.onHide()
  }

  function goToBarPicker(tune) {
    const source = getScratchpadNotationTune(item) || scratchpadTune
    resetBarRangeForAssign(tune, source, notationOperation)
    setStep('bar-picker')
  }

  function goToNextStepForTune(tune) {
    if (!tune) return
    setSelectedTuneId(tune.id)
    if (item.type === 'image' || item.type === 'audio') {
      setStep('confirm')
      return
    }
    if (item.type === 'notation') {
      if (associateMode === 'midi') {
        setStep('confirm-midi')
        return
      }
      goToBarPicker(tune)
      return
    }
    if (item.type === 'text') {
      if (associateMode === 'background') {
        setStep('background')
      } else if (associateMode === 'chords') {
        setStep('chords')
      } else {
        setStep('lyrics')
      }
      return
    }
    if (item.type === 'composition') {
      setStep('confirm')
    }
  }

  function goToNextStep() {
    if (!selectedTune) return
    goToNextStepForTune(selectedTune)
  }

  function handlePickPrimary() {
    if (!selectedTune) return
    goToNextStep()
  }

  function handleNotationOperationChange(nextOperation) {
    const op = nextOperation || 'merge'
    setNotationOperation(op)
    if (selectedTune && scratchpadTune) {
      resetBarRangeForAssign(selectedTune, scratchpadTune, op)
    }
  }

  function handleFromBarChange(nextFrom) {
    const next = Math.max(1, parseInt(nextFrom, 10) || 1)
    setFromBar(next)
    if (notationOperation === 'insert') return
    const sourceBars = sourceBarCountForTune(scratchpadTune)
    setToBar(defaultEndBarForRange(next, sourceBars, maxBarForTune(selectedTune)))
  }

  async function handleAttach(tuneOverride) {
    const targetTune = tuneOverride || selectedTune
    if (!targetTune || !props.tunebook) return
    setBusy(true)
    try {
      let tune = JSON.parse(JSON.stringify(targetTune))
      const sourceNotation = getScratchpadNotationTune(item)
      const mergeMode = getNotationAssociateMergeMode(associateMode, notationOperation)

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
        if (!sourceNotation) throw new Error('Scratchpad notation is empty')
        if (associateMode === 'midi') {
          tune = await attachScratchpadNotationMidiToTune(
            tune,
            sourceNotation,
            {
              tunebook: props.tunebook,
              title: item.title || 'Scratchpad notation MIDI',
              token: props.token,
              uploadToDrive: false,
              scratchpadItemId: item.id,
            }
          )
        } else {
          tune = mergeScratchpadNotationIntoTune(
            tune,
            sourceNotation,
            '',
            mergeMode,
            { voiceMapping: voiceMapping, fromBar: fromBar, toBar: toBar }
          )
        }
      } else if (item.type === 'composition') {
        const compositionTune = item.composition && item.composition.tuneSnapshot
        if (!compositionTune) throw new Error('Composition is empty')
        tune = mergeScratchpadCompositionIntoTune(tune, compositionTune)
      } else if (item.type === 'text') {
        if (associateMode === 'background') {
          tune = mergeScratchpadBackgroundIntoTune(
            tune,
            String(item.text && item.text.body || ''),
            'replace'
          )
        } else if (associateMode === 'chords') {
          tune = mergeScratchpadChordsIntoTune(
            tune,
            String(item.text && item.text.body || ''),
            {
              tunebook: props.tunebook,
              abcjsParser: abcjsParser,
              abc: props.tunebook.abcTools
                ? props.tunebook.abcTools.json2abc(tune)
                : undefined,
            }
          )
        } else {
          const merged = buildLyricsMergeResult(
            getPlainLyricLines(targetTune),
            String(item.text && item.text.body || '').split('\n')
          )
          const lines = Array.isArray(merged) ? merged : String(merged).split('\n')
          tune = mergeScratchpadLyricsIntoTune(tune, lines.join('\n'), 'replace')
        }
      }

      tune.id = targetTune.id
      await props.tunebook.saveTune(tune, false, {
        historyLabel: historyLabelForMode(associateMode, notationOperation),
        immediate: true,
      })
      if (props.tunebook.forceRefresh) props.tunebook.forceRefresh()
      updateScratchpadItem(item.id, { linkedTuneId: targetTune.id })
      const recentMode = isNotationAssociateMode(associateMode)
        ? ('notation:' + mergeMode)
        : associateMode
      recordScratchpadAssociateTarget(targetTune.id, targetTune.name, recentMode)
      showScratchpadAssociateSuccessToast({
        message: successMessageForMode(associateMode, targetTune.name, notationOperation),
        tuneId: targetTune.id,
        onOpenTune: function(tuneId) {
          navigate(editorPathForScratchpadAssociate(associateMode, tuneId))
        },
      })
      if (props.onAssociated) props.onAssociated()
      handleHide()
    } catch (e) {
      toast.error(e && e.message ? e.message : 'Could not associate')
    } finally {
      setBusy(false)
    }
  }

  function handleSuggestedTunePick(tune) {
    goToNextStepForTune(tune)
  }

  const modalTitle = modalTitleForMode(associateMode, item && item.type, step)
  const attachLabel = attachLabelForMode(associateMode, notationOperation)
  const mergeMode = getNotationAssociateMergeMode(associateMode, notationOperation)
  const notationFullscreen = isNotationBarPickerMode(associateMode)

  return (
    <Modal
      show={!!props.show}
      onHide={handleHide}
      size={notationFullscreen ? undefined : 'lg'}
      centered={!notationFullscreen}
      scrollable
      fullscreen={notationFullscreen || undefined}
      className={'scratchpad-associate-modal' + (notationFullscreen ? ' scratchpad-associate-modal--notation' : '')}
      contentClassName={notationFullscreen ? 'scratchpad-associate-modal-content' : undefined}
    >
      <Modal.Header closeButton>
        <Modal.Title>{modalTitle}</Modal.Title>
      </Modal.Header>
      <Modal.Body className={step === 'bar-picker' ? 'scratchpad-associate-modal-body--bar-picker' : undefined}>
        {step === 'pick' ? (
          <>
            {suggestedTunes.length ? (
              <div className="scratchpad-associate-tune-suggestions mb-3">
                <div className="small text-muted mb-1">Suggestions</div>
                <div className="scratchpad-associate-tune-suggestions__buttons">
                  {suggestedTunes.map(function(entry) {
                    const tune = entry.tune
                    const composer = String(tune.composer || '').trim()
                    return (
                      <Button
                        key={tune.id}
                        size="sm"
                        variant="outline-secondary"
                        className="scratchpad-associate-tune-suggestion-btn"
                        onClick={function() { handleSuggestedTunePick(tune) }}
                        title={composer ? ((tune.name || 'Untitled') + ' — ' + composer) : (tune.name || 'Untitled')}
                      >
                        <span className="scratchpad-associate-tune-suggestion-text">
                          <span className="scratchpad-associate-tune-suggestion-label">{tune.name || 'Untitled'}</span>
                          {composer ? (
                            <span className="scratchpad-associate-tune-suggestion-composer text-muted">{composer}</span>
                          ) : null}
                        </span>
                      </Button>
                    )
                  })}
                </div>
              </div>
            ) : null}
            <Form.Control
              className="mb-2"
              type="search"
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
                    onDoubleClick={function() { goToNextStepForTune(tune) }}
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
            Attach <strong>{item.title}</strong> to <strong>{selectedTune && selectedTune.name}</strong>
            {item.type === 'image' ? ' as a snapshot' : ''}
            {item.type === 'audio' ? ' as audio media' : ''}
            {item.type === 'composition' ? ' (replace tune content with composition)' : ''}
            ?
          </p>
        ) : null}

        {step === 'confirm-midi' && selectedTune ? (
          <p>
            Attach <strong>{item.title}</strong> to <strong>{selectedTune.name}</strong> as a MIDI link?
          </p>
        ) : null}

        {step === 'bar-picker' && selectedTune && scratchpadTune ? (
          <ScratchpadNotationBarPickerPanel
            tune={selectedTune}
            sourceTune={scratchpadTune}
            sourceTitle={item.title}
            voiceMapping={voiceMapping}
            onVoiceMappingChange={setVoiceMapping}
            mode={mergeMode}
            onModeChange={handleNotationOperationChange}
            fromBar={fromBar}
            onFromBarChange={handleFromBarChange}
            toBar={toBar}
            onToBarChange={setToBar}
          />
        ) : null}

        {step === 'background' && selectedTune ? (
          <p>
            Copy scratchpad text into <strong>{selectedTune.name}</strong> background information?
          </p>
        ) : null}

        {step === 'chords' && selectedTune ? (
          <p>
            Paste scratchpad chord sheet into <strong>{selectedTune.name}</strong> chords editor
            (updates chords and lyrics; notation is replaced)?
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
        {step === 'bar-picker' ? (
          <Button
            variant="outline-secondary"
            onClick={function() { setStep('pick') }}
            disabled={busy}
          >
            Back
          </Button>
        ) : null}
        <Button variant="secondary" onClick={handleHide} disabled={busy}>Cancel</Button>
        {step === 'pick' ? (
          <Button variant="primary" disabled={!selectedTuneId || busy} onClick={handlePickPrimary}>
            Next
          </Button>
        ) : null}
        {step !== 'pick' ? (
          <Button variant="success" disabled={busy} onClick={function() { handleAttach() }}>
            {busy ? 'Saving…' : attachLabel}
          </Button>
        ) : null}
      </Modal.Footer>
    </Modal>
  )
}
