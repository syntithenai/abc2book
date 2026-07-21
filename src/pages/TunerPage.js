import React, { useEffect, useState, useCallback } from 'react'
import { useSearchParams, useNavigate, useLocation } from 'react-router-dom'
import { Container, Button } from 'react-bootstrap'
import TunerComponent from '../tunerlib/TunerComponent'
import { resolvePresetForTune, isValidTunerInstrument } from '../tuningPresetResolver'
import { useDocumentTitle } from '../pageTitle'
import AudioAnalysisModal from '../components/AudioAnalysisModal'

function isAudioAnalysisPath(pathname) {
  return /\/tuner\/audioanalysis\/?$/.test(pathname) || pathname === '/tuner/audioanalysis'
}

export default function TunerPage(props) {
  useDocumentTitle('Tuner')
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const location = useLocation()
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
  const [liveInstrument, setLiveInstrument] = useState(instrument)
  const [liveTuningPresetId, setLiveTuningPresetId] = useState(tuningPresetId)

  const showAudioAnalysis = isAudioAnalysisPath(location.pathname)

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

  function openAudioAnalysis() {
    const search = location.search || ''
    navigate('/tuner/audioanalysis' + search)
  }

  function closeAudioAnalysis() {
    const search = location.search || ''
    navigate('/tuner' + search)
  }

  return (
    <Container fluid className="App-chords py-3 px-3">
      <div className="d-flex align-items-center justify-content-between gap-2 mb-2">
        <h1 className="mb-0">Tuner</h1>
        <Button variant="outline-primary" onClick={openAudioAnalysis}>
          Audio Analysis
        </Button>
      </div>
      <TunerComponent
        instrument={instrument}
        tuningPresetId={tuningPresetId}
        tuneId={tuneId}
        suggestedForTune={suggestedForTune}
        onSaveTuning={onSaveTuning}
        pauseAudio={showAudioAnalysis}
        onPresetChange={function(next) {
          if (next && next.instrument) setLiveInstrument(next.instrument)
          if (next && next.tuningPresetId) setLiveTuningPresetId(next.tuningPresetId)
        }}
      />
      <AudioAnalysisModal
        show={showAudioAnalysis}
        onHide={closeAudioAnalysis}
        instrument={liveInstrument || instrument}
        tuningPresetId={liveTuningPresetId || tuningPresetId}
        token={props.token}
        login={props.login}
        logout={props.logout}
      />
    </Container>
  )
}
