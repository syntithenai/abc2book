import { useEffect, useState } from 'react'
import { Alert, Button, Form, Modal } from 'react-bootstrap'
import { toast } from 'react-toastify'
import { exportTuneToChordPro } from '../chordProFormatUtils'
import { commitLyricChordSheetToTune } from '../commitLyricChordSheet'
import { commitPasteChordSheetToTune } from '../commitPasteChordSheetToTune'
import { tuneHasLyricEmbeddedChords } from '../timedLyricsChordsDisplay'
import {
  buildTuneSectionsFromPaste,
  listPasteChordSections,
  rebuildChordGridFromSections,
  firstSectionMeter,
} from '../chordsEditorSections'
import useAbcjsParser from '../useAbcjsParser'
import { useResponsiveModalProps } from '../useResponsiveModalProps'

/**
 * Edit the lyric-aligned chord sheet (ChordPro / COW in words + meta.chordProSource)
 * without silently mutating ABC. Optional explicit sync to ABC chords.
 */
export default function LyricChordSheetEditorModal(props) {
  const tune = props.tune
  const tunebook = props.tunebook
  const show = !!props.show
  const abcjsParser = useAbcjsParser({ tunebook: tunebook })
  const responsiveModalProps = useResponsiveModalProps()
  const [text, setText] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(function() {
    if (!show || !tune) return
    setError('')
    setBusy(false)
    try {
      setText(exportTuneToChordPro(tune) || '')
    } catch (e) {
      const source = tune.meta && tune.meta.chordProSource
        ? String(tune.meta.chordProSource)
        : ''
      setText(source)
    }
  }, [show, tune && tune.id])

  function handleClose() {
    if (props.onHide) props.onHide()
  }

  function saveLyricsOnly() {
    setBusy(true)
    setError('')
    const result = commitLyricChordSheetToTune({
      tune: tune,
      tunebook: tunebook,
      text: text,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error && result.error.message ? result.error.message : 'Save failed')
      return
    }
    toast.success('Lyric chord sheet saved')
    if (props.forceRefresh) props.forceRefresh()
    handleClose()
  }

  function syncAbcFromSheet() {
    setBusy(true)
    setError('')
    const lyricSave = commitLyricChordSheetToTune({
      tune: tune,
      tunebook: tunebook,
      text: text,
      skipSave: true,
    })
    if (!lyricSave.ok) {
      setBusy(false)
      setError(lyricSave.error && lyricSave.error.message
        ? lyricSave.error.message
        : 'Could not parse sheet')
      return
    }
    const parsed = lyricSave.parsed
    try {
      const pasteSections = listPasteChordSections(parsed)
      const mergeSections = buildTuneSectionsFromPaste(
        pasteSections,
        tune.meter || parsed.meter || '4/4'
      )
      const result = commitPasteChordSheetToTune({
        tune: tune,
        tunebook: tunebook,
        abcjsParser: abcjsParser,
        abc: tunebook.abcTools.json2abc(tune),
        forceUpdateLyrics: true,
        historyLabel: 'Sync ABC chords from lyric sheet',
        result: {
          sections: mergeSections,
          chordGridText: rebuildChordGridFromSections(mergeSections),
          meta: {
            title: parsed.title,
            name: parsed.title,
            composer: parsed.composer,
            key: parsed.key,
            capo: parsed.capo,
            tempo: parsed.tempo,
            meter: parsed.meter,
            chordProSource: parsed.chordProSource,
          },
          chordSheetAlignment: parsed.chordSheetAlignment,
          chordProSource: parsed.chordProSource,
          lyricLines: parsed.lyricLines,
          updateLyrics: true,
          selectedMeterOption: {
            meter: firstSectionMeter(mergeSections, tune.meter || parsed.meter),
            id: 'lyric-sheet-sync',
          },
        },
      })
      setBusy(false)
      if (!result.ok) {
        setError(result.error && result.error.message ? result.error.message : 'ABC sync failed')
        return
      }
      toast.success('Lyric sheet saved and ABC chords synced')
      if (props.forceRefresh) props.forceRefresh()
      handleClose()
    } catch (e) {
      setBusy(false)
      setError(e && e.message ? e.message : 'ABC sync failed')
    }
  }

  if (!tune) return null

  return (
    <Modal show={show} onHide={handleClose} {...responsiveModalProps} size="lg">
      <Modal.Header closeButton>
        <Modal.Title>Lyric chord sheet</Modal.Title>
      </Modal.Header>
      <Modal.Body>
        <p className="small text-muted">
          Edit ChordPro or chords-over-words text for singing view. Saving updates lyrics only;
          use &quot;Also sync ABC chords&quot; when you want the staff/structure chart updated too.
          {tuneHasLyricEmbeddedChords(tune)
            ? ' Lyric chords are currently the source of truth for placement.'
            : ''}
        </p>
        {error ? <Alert variant="danger">{error}</Alert> : null}
        <Form.Control
          as="textarea"
          rows={16}
          value={text}
          onChange={function(e) { setText(e.target.value); setError(''); }}
          style={{ fontFamily: 'monospace', fontSize: '0.9em' }}
          spellCheck={false}
        />
      </Modal.Body>
      <Modal.Footer>
        <Button variant="secondary" onClick={handleClose} disabled={busy}>Cancel</Button>
        <Button
          variant="outline-primary"
          onClick={syncAbcFromSheet}
          disabled={busy || !String(text || '').trim()}
        >
          Also sync ABC chords
        </Button>
        <Button
          variant="success"
          onClick={saveLyricsOnly}
          disabled={busy || !String(text || '').trim()}
        >
          Save lyrics only
        </Button>
      </Modal.Footer>
    </Modal>
  )
}
