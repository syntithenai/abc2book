import { useEffect, useMemo, useState } from 'react'
import { Form } from 'react-bootstrap'
import {
  applyPlaybackFillSettings,
  getPlaybackFillSettings,
  getFillStyleDefinition,
  hasStoredDrumRhythm,
  listFillStyleGroups,
  MAX_FILL_LEVEL,
  MIN_FILL_LEVEL,
} from '../playbackFillSettings'
import { getPlaybackMetronomeSettings } from '../playbackMetronomeSettings'
import { presetLabelForId } from '../drumPatternPresets'
import './MidiPlaybackFillPanel.css'

export default function MidiPlaybackFillPanel({ tune, tunebook, mediaController }) {
  const [settings, setSettings] = useState(function() {
    return getPlaybackFillSettings(tune)
  })

  useEffect(function() {
    setSettings(getPlaybackFillSettings(tune))
  }, [
    tune && tune.id,
    tune && tune.playbackFillStyle,
    tune && tune.playbackFillLevel,
    tune && tune.playbackFillFollowDrumGroove,
    tune && tune.playbackMetronomeDrumRhythm,
    tune && tune.playbackMetronomePresetId,
  ])

  const styleGroups = useMemo(function() {
    return listFillStyleGroups()
  }, [])

  const selectedStyle = useMemo(function() {
    return getFillStyleDefinition(settings.style)
  }, [settings.style])

  const drumRhythmAvailable = useMemo(function() {
    return hasStoredDrumRhythm(tune)
  }, [tune])

  const linkedDrumPresetLabel = useMemo(function() {
    if (!tune || !drumRhythmAvailable) return ''
    const metro = getPlaybackMetronomeSettings(tune, tunebook)
    const presetId = metro.drumRhythm && metro.drumRhythm.presetId
    return presetId ? presetLabelForId(presetId) : 'Custom drum pattern'
  }, [tune, tunebook, drumRhythmAvailable])

  function persist(nextSettings) {
    setSettings(nextSettings)
    if (!tune || !tunebook) return
    const updated = applyPlaybackFillSettings(tune, nextSettings)
    tunebook.saveTune(updated)
    if (mediaController && mediaController.setTune) {
      mediaController.setTune(updated)
    }
    if (mediaController && mediaController.forceMidiChange) {
      mediaController.forceMidiChange()
    }
  }

  function handleStyleChange(event) {
    persist(Object.assign({}, settings, { style: event.target.value }))
  }

  function handleLevelChange(event) {
    const level = parseInt(event.target.value, 10)
    persist(Object.assign({}, settings, {
      level: level >= MIN_FILL_LEVEL ? Math.min(MAX_FILL_LEVEL, level) : MIN_FILL_LEVEL,
    }))
  }

  function handleFollowDrumGrooveChange(event) {
    persist(Object.assign({}, settings, { followDrumGroove: !!event.target.checked }))
  }

  const fillDisabled = settings.style === 'off'

  return (
    <div className="midi-playback-fill-panel">
      <Form.Group className="mb-3">
        <Form.Label htmlFor="midi-fill-style">Fill style</Form.Label>
        <Form.Select
          id="midi-fill-style"
          value={settings.style}
          onChange={handleStyleChange}
        >
          {styleGroups.map(function(group) {
            return (
              <optgroup key={group.id} label={group.label}>
                {group.styles.map(function(style) {
                  return (
                    <option key={style.id} value={style.id}>
                      {style.label}
                    </option>
                  )
                })}
              </optgroup>
            )
          })}
        </Form.Select>
        {selectedStyle && selectedStyle.description ? (
          <Form.Text muted>
            {selectedStyle.description}
          </Form.Text>
        ) : null}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Check
          type="checkbox"
          id="midi-fill-follow-drum-groove"
          label="Follow drum groove"
          checked={!!settings.followDrumGroove}
          disabled={fillDisabled || !drumRhythmAvailable}
          onChange={handleFollowDrumGrooveChange}
        />
        {settings.followDrumGroove && linkedDrumPresetLabel ? (
          <Form.Text muted>
            Using {linkedDrumPresetLabel} from the Metronome tab.
          </Form.Text>
        ) : null}
        {!drumRhythmAvailable ? (
          <Form.Text muted>
            Set a drum pattern on the Metronome tab (Drums mode) to enable groove-synced fills.
          </Form.Text>
        ) : (
          <Form.Text muted>
            Uses the drum pattern from the Metronome tab. Switch to Drums mode there to edit the groove.
          </Form.Text>
        )}
      </Form.Group>

      <Form.Group className="mb-3">
        <Form.Label htmlFor="midi-fill-level">
          Fill level ({settings.level}%)
        </Form.Label>
        <Form.Range
          id="midi-fill-level"
          min={MIN_FILL_LEVEL}
          max={MAX_FILL_LEVEL}
          step="5"
          value={settings.level}
          disabled={fillDisabled}
          onChange={handleLevelChange}
        />
        <Form.Text muted>
          Relative volume of the chord accompaniment versus the melody.
        </Form.Text>
      </Form.Group>
    </div>
  )
}
