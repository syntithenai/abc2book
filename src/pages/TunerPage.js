import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams, Link } from 'react-router-dom'
import { Container, Button } from 'react-bootstrap'
import TunerComponent from '../tunerlib/TunerComponent'
import { resolvePresetForTune, isValidTunerInstrument } from '../tuningPresetResolver'
import { useDocumentTitle } from '../pageTitle'

export default function TunerPage(props) {
  useDocumentTitle('Tuner')
  const [searchParams] = useSearchParams()
  const tuneId = searchParams.get('tuneId')
  const urlInstrument = searchParams.get('instrument')
  const urlTuning = searchParams.get('tuning')

  const [instrument, setInstrument] = useState(function() {
    if (urlInstrument && isValidTunerInstrument(urlInstrument)) return urlInstrument
    return null
  })
  const [tuningPresetId, setTuningPresetId] = useState(urlTuning || null)
  const [suggestedForTune, setSuggestedForTune] = useState(null)
  const [loadedTune, setLoadedTune] = useState(null)

  useEffect(function() {
    if (!tuneId || !props.tunebook || !props.tunebook.utils) return
    props.tunebook.utils.loadLocalforageObject('bookstorage_tunes').then(function(tunes) {
      const tune = tunes && tunes[tuneId] ? tunes[tuneId] : null
      if (!tune) return
      setLoadedTune(tune)
      setSuggestedForTune(tune.name || null)
      const resolved = resolvePresetForTune(tune)
      if (resolved) {
        setInstrument(resolved.instrument)
        setTuningPresetId(resolved.presetId)
      }
    }).catch(function() {})
  }, [tuneId, props.tunebook])

  useEffect(function() {
    if (urlInstrument && isValidTunerInstrument(urlInstrument)) {
      setInstrument(urlInstrument)
    }
    if (urlTuning) setTuningPresetId(urlTuning)
  }, [urlInstrument, urlTuning])

  const onSaveTuning = useCallback(function(label) {
    if (!loadedTune || !props.tunebook) return
    const tune = Object.assign({}, loadedTune, { tuning: label, id: loadedTune.id })
    props.tunebook.saveTune(tune).then(function() {
      setLoadedTune(tune)
    })
  }, [loadedTune, props.tunebook])

  function audioAnalysisHref() {
    const next = new URLSearchParams()
    if (instrument) next.set('instrument', instrument)
    if (tuningPresetId) next.set('tuning', tuningPresetId)
    if (tuneId) next.set('tuneId', tuneId)
    const q = next.toString()
    return '/audioanalysis' + (q ? '?' + q : '')
  }

  return (
    <Container fluid className="App-chords py-3 px-3">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <h1 className="mb-0">Tuner</h1>
        <Button as={Link} to={audioAnalysisHref()} variant="outline-primary">
          Audio Analysis
        </Button>
      </div>
      <TunerComponent
        instrument={instrument}
        tuningPresetId={tuningPresetId}
        tuneId={tuneId}
        suggestedForTune={suggestedForTune}
        onSaveTuning={onSaveTuning}
        onPresetChange={function(next) {
          if (next && next.instrument) setInstrument(next.instrument)
          if (next && next.tuningPresetId) setTuningPresetId(next.tuningPresetId)
        }}
      />
    </Container>
  )
}
