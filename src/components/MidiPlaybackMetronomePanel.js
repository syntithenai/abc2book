import { useEffect, useMemo, useState } from 'react'
import { Form } from 'react-bootstrap'
import MetronomePanel from './MetronomePanel'
import {
  applyPlaybackMetronomeSettings,
  applyPlaybackMetronomeCountInFields,
  getPlaybackMetronomeSettings,
} from '../playbackMetronomeSettings'
import { ENGINE_MODE_CLICK, ENGINE_MODE_DRUMS } from '../rhythmEngineTypes'

import {
  getPlaybackSettings,
} from '../pitchTempoUtils'

function getBaseTuneTempoBpm(tune, tunebook) {
  if (!tune) return 100
  let bpm = 100
  if (tune.tempo != null && String(tune.tempo).trim() !== '') {
    const cleaned = tunebook && tunebook.abcTools && tunebook.abcTools.cleanTempo
      ? tunebook.abcTools.cleanTempo(tune.tempo)
      : parseInt(String(tune.tempo).split('=').pop(), 10)
    if (cleaned > 0) bpm = cleaned
  }
  return bpm
}

function getMetronomePreviewTempo(tune, tunebook) {
  const playback = getPlaybackSettings(tune)
  const factor = playback.tempo > 0 ? playback.tempo : 1
  return Math.max(20, Math.min(300, Math.round(getBaseTuneTempoBpm(tune, tunebook) * factor)))
}

export default function MidiPlaybackMetronomePanel({ tune, tunebook, mediaController }) {
  const [settings, setSettings] = useState(function() {
    return getPlaybackMetronomeSettings(tune, tunebook)
  })

  useEffect(function() {
    setSettings(getPlaybackMetronomeSettings(tune, tunebook))
  }, [
    tune && tune.id,
    tune && tune.meter,
    tune && tune.rhythm,
    tune && tune.playbackMetronomeCountIn,
    tune && tune.playbackMetronomeCountInBars,
    tune && tune.playbackMetronomeDuringPlayback,
    tune && tune.playbackMetronomeRhythm,
    tune && tune.playbackMetronomeClickRhythm,
    tune && tune.playbackMetronomeDrumRhythm,
    tune && tune.playbackMetronomeEngine,
    tune && tune.playbackMetronomePresetId,
    tune && tune.playbackTempo,
    tune && tune.tempo,
    tunebook,
  ])

  function persistCountInFields(nextSettings) {
    setSettings(nextSettings)
    if (!tune || !tunebook) return
    const updated = applyPlaybackMetronomeCountInFields(tune, nextSettings)
    tunebook.saveTune(updated)
    if (mediaController && mediaController.setTune) {
      mediaController.setTune(updated)
    }
    if (mediaController && mediaController.forceMidiChange) {
      mediaController.forceMidiChange()
    }
  }

  function persistRhythm(nextSettings) {
    setSettings(nextSettings)
    if (!tune || !tunebook) return
    const updated = applyPlaybackMetronomeSettings(tune, nextSettings, { tunebook: tunebook })
    tunebook.saveTune(updated)
    if (mediaController && mediaController.setTune) {
      mediaController.setTune(updated)
    }
    if (mediaController && mediaController.forceMidiChange) {
      mediaController.forceMidiChange()
    }
  }

  function handleCountInToggle(event) {
    persistCountInFields(Object.assign({}, settings, { countIn: !!event.target.checked }))
  }

  function handleDuringPlaybackToggle(event) {
    persistCountInFields(Object.assign({}, settings, { duringPlayback: !!event.target.checked }))
  }

  function handleCountInBarsChange(event) {
    const bars = parseInt(event.target.value, 10)
    persistCountInFields(Object.assign({}, settings, {
      countInBars: bars > 0 ? Math.min(4, bars) : 1,
    }))
  }

  function handleTempoChange(targetBpm) {
    if (!tune || !tunebook) return
    const bpm = Math.max(20, Math.min(300, Math.round(targetBpm)))
    const playback = getPlaybackSettings(tune)
    const updated = Object.assign({}, tune, {
      tempo: bpm,
      playbackTempo: 1,
    })
    tunebook.saveTune(updated, false, { historyLabel: 'Edit tempo' })
    if (mediaController && mediaController.setTune) {
      mediaController.setTune(updated)
    }
    if (mediaController && mediaController.applyLivePlaybackSettings) {
      mediaController.applyLivePlaybackSettings(
        1,
        playback.pitch,
        playback.fineTune,
        { fromUserGesture: true }
      )
    } else if (mediaController && mediaController.updateTunePlaybackSettings) {
      mediaController.updateTunePlaybackSettings(1, playback.pitch, playback.fineTune)
    }
    if (mediaController && mediaController.forceMidiChange) {
      mediaController.forceMidiChange()
    }
  }

  function handleRhythmSettingsChange(next) {
    const updatedRhythm = next.rhythm
    const nextSettings = Object.assign({}, settings, { rhythm: updatedRhythm })
    if (updatedRhythm.engineMode === ENGINE_MODE_DRUMS) {
      nextSettings.drumRhythm = updatedRhythm
      nextSettings.clickRhythm = settings.clickRhythm
      nextSettings.engine = ENGINE_MODE_DRUMS
    } else {
      nextSettings.clickRhythm = updatedRhythm
      nextSettings.drumRhythm = settings.drumRhythm
      nextSettings.engine = ENGINE_MODE_CLICK
    }
    persistRhythm(nextSettings)
  }

  const previewTempo = useMemo(function() {
    return getMetronomePreviewTempo(tune, tunebook)
  }, [
    tune && tune.id,
    tune && tune.tempo,
    tune && tune.playbackTempo,
    tunebook,
  ])

  const stopPreviewOnPlayback = !!(mediaController
    && (mediaController.isPlaying || mediaController.isLoading))

  return (
    <div className="midi-playback-metronome-panel">
      <Form.Group className="mb-3">
        <Form.Check
          type="checkbox"
          id="midi-count-in-enabled"
          label="Count-in before MIDI playback"
          checked={settings.countIn !== false}
          onChange={handleCountInToggle}
        />
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Check
          type="checkbox"
          id="midi-metronome-during-playback"
          label="Metronome during playback"
          checked={settings.duringPlayback === true}
          onChange={handleDuringPlaybackToggle}
        />
        <Form.Text muted>
          Keep the click track running through the tune, not only during count-in.
        </Form.Text>
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label htmlFor="midi-count-in-bars">Count-in bars</Form.Label>
        <Form.Control
          id="midi-count-in-bars"
          type="number"
          min="1"
          max="4"
          step="1"
          value={settings.countInBars}
          disabled={settings.countIn === false}
          onChange={handleCountInBarsChange}
        />
        <Form.Text muted>
          With an anacrusis, count-in length is this many bars minus the pickup, then one beat of silence before the first note.
        </Form.Text>
      </Form.Group>

      <MetronomePanel
        settingsOnly={true}
        showPreview={true}
        hideTempo={false}
        tune={tune}
        tunebook={tunebook}
        previewTempo={previewTempo}
        onTempoChange={handleTempoChange}
        stopOnPlayback={stopPreviewOnPlayback}
        rhythm={settings.rhythm}
        rhythmStores={{
          clickRhythm: settings.clickRhythm,
          drumRhythm: settings.drumRhythm,
        }}
        onRhythmChange={handleRhythmSettingsChange}
      />
    </div>
  )
}
