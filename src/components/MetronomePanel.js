import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import Metronome from '../Metronome'
import {
  METRONOME_ACCENT,
  METRONOME_MUTE,
  METRONOME_TICK,
} from '../metronomeTickSounds'
import {
  METRONOME_PULSE_OPTIONS,
  METRONOME_RHYTHM_PRESETS,
  createRhythm,
  cycleAccentLevel,
  rhythmFromPreset,
  slotBeatIndex,
  slotPulseIndex,
  slotsPerBar,
} from '../metronomeRhythmPresets'
import './MetronomePanel.css'

const STORAGE_KEY = 'bookstorage_metronome'

const TEMPO_MARKINGS = {
  40: 'Largo',
  60: 'Larghetto',
  72: 'Andante',
  96: 'Moderato',
  120: 'Allegro',
  144: 'Vivace',
  168: 'Presto',
}

function loadSavedSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return null
    return JSON.parse(raw)
  } catch (e) {
    return null
  }
}

function saveSettings(settings) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings))
  } catch (e) {}
}

function accentButtonLabel(level) {
  if (level === METRONOME_ACCENT) return '●'
  if (level === METRONOME_MUTE) return '○'
  return '·'
}

function accentButtonTitle(level) {
  if (level === METRONOME_ACCENT) return 'Accented beat — click to make a regular tick'
  if (level === METRONOME_MUTE) return 'Silent beat — click to accent'
  return 'Regular tick — click to mute'
}

function nearestTempoMarking(tempo) {
  const values = Object.keys(TEMPO_MARKINGS).map(Number).sort(function(a, b) { return a - b })
  let nearest = values[0]
  let bestDistance = Math.abs(tempo - nearest)
  values.forEach(function(value) {
    const distance = Math.abs(tempo - value)
    if (distance < bestDistance) {
      nearest = value
      bestDistance = distance
    }
  })
  return TEMPO_MARKINGS[nearest]
}

export default function MetronomePanel() {
  const saved = loadSavedSettings()
  const [tempo, setTempo] = useState(saved && saved.tempo ? saved.tempo : 120)
  const [rhythm, setRhythm] = useState(function() {
    if (saved && saved.rhythm) return createRhythm(saved.rhythm.beatsPerBar, saved.rhythm.accents, saved.rhythm.pulsesPerBeat)
    return rhythmFromPreset('4-4')
  })
  const [activePresetId, setActivePresetId] = useState(saved && saved.presetId ? saved.presetId : '4-4')
  const [isRunning, setIsRunning] = useState(false)
  const [activeSlot, setActiveSlot] = useState(-1)

  const metronomeRef = useRef(null)
  const audioContextRef = useRef(null)
  const tapTimesRef = useRef([])

  const persistSettings = useCallback(function(nextTempo, nextRhythm, presetId) {
    saveSettings({
      tempo: nextTempo,
      rhythm: nextRhythm,
      presetId: presetId,
    })
  }, [])

  useEffect(function() {
    return function cleanup() {
      if (metronomeRef.current) {
        metronomeRef.current.stop()
        metronomeRef.current = null
      }
    }
  }, [])

  useEffect(function() {
    persistSettings(tempo, rhythm, activePresetId)
  }, [tempo, rhythm, activePresetId, persistSettings])

  function ensureMetronome() {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (!metronomeRef.current) {
      metronomeRef.current = new Metronome(audioContextRef.current, tempo, rhythm.beatsPerBar, 0)
      metronomeRef.current.onSlotChange = function(slotIndex) {
        setActiveSlot(slotIndex)
      }
    }
    metronomeRef.current.setTempo(tempo)
    metronomeRef.current.setRhythm(rhythm)
    return metronomeRef.current
  }

  function startMetronome() {
    const metro = ensureMetronome()
    metro.start()
    setIsRunning(true)
  }

  function stopMetronome() {
    if (metronomeRef.current) {
      metronomeRef.current.stop()
    }
    setIsRunning(false)
    setActiveSlot(-1)
  }

  function toggleMetronome() {
    if (isRunning) stopMetronome()
    else startMetronome()
  }

  function applyPreset(presetId) {
    const nextRhythm = rhythmFromPreset(presetId)
    setRhythm(nextRhythm)
    setActivePresetId(presetId)
    if (metronomeRef.current) {
      metronomeRef.current.setRhythm(nextRhythm)
    }
  }

  function setBeatsPerBar(count) {
    const nextCount = Math.max(1, Math.min(16, count))
    const nextRhythm = createRhythm(nextCount, rhythm.accents, rhythm.pulsesPerBeat)
    setRhythm(nextRhythm)
    setActivePresetId('')
    if (metronomeRef.current) metronomeRef.current.setRhythm(nextRhythm)
  }

  function setPulsesPerBeat(pulses) {
    const nextRhythm = createRhythm(rhythm.beatsPerBar, rhythm.accents, pulses)
    setRhythm(nextRhythm)
    setActivePresetId('')
    if (metronomeRef.current) metronomeRef.current.setRhythm(nextRhythm)
  }

  function cycleBeatAccent(beatIndex) {
    const accents = rhythm.accents.slice()
    accents[beatIndex] = cycleAccentLevel(accents[beatIndex])
    const nextRhythm = createRhythm(rhythm.beatsPerBar, accents, rhythm.pulsesPerBeat)
    setRhythm(nextRhythm)
    setActivePresetId('')
    if (metronomeRef.current) metronomeRef.current.setRhythm(nextRhythm)
  }

  function adjustTempo(delta) {
    setTempo(function(current) {
      return Math.max(20, Math.min(300, (parseInt(current, 10) || 120) + delta))
    })
  }

  function handleTapTempo() {
    const now = Date.now()
    const taps = tapTimesRef.current.filter(function(time) { return now - time < 2500 })
    taps.push(now)
    tapTimesRef.current = taps
    if (taps.length < 2) return
    const intervals = []
    for (let i = 1; i < taps.length; i++) {
      intervals.push(taps[i] - taps[i - 1])
    }
    const average = intervals.reduce(function(sum, value) { return sum + value }, 0) / intervals.length
    const nextTempo = Math.max(20, Math.min(300, Math.round(60000 / average)))
    setTempo(nextTempo)
  }

  const totalSlots = slotsPerBar(rhythm)
  const activeBeat = activeSlot >= 0 ? slotBeatIndex(rhythm, activeSlot) : -1
  const activePulse = activeSlot >= 0 ? slotPulseIndex(rhythm, activeSlot) : -1

  return (
    <div className="metronome-panel">
      <div className="metronome-panel__card">
        <div className="metronome-panel__transport">
          <Button
            variant={isRunning ? 'danger' : 'success'}
            size="lg"
            onClick={toggleMetronome}
          >
            {isRunning ? 'Stop' : 'Start'}
          </Button>
          <Button variant="outline-secondary" onClick={handleTapTempo}>
            Tap tempo
          </Button>
        </div>

        <div className="metronome-panel__tempo">
          <Button onClick={function() { adjustTempo(-5) }}>-5</Button>
          <Button onClick={function() { adjustTempo(-1) }}>-</Button>
          <div>
            <div className="metronome-panel__tempo-label">{tempo}</div>
            <div style={{ textAlign: 'center', color: '#6c757d' }}>{nearestTempoMarking(tempo)}</div>
          </div>
          <Button onClick={function() { adjustTempo(1) }}>+</Button>
          <Button onClick={function() { adjustTempo(5) }}>+5</Button>
          <input
            type="number"
            min="20"
            max="300"
            value={tempo}
            onChange={function(e) {
              const value = parseInt(e.target.value, 10)
              if (!Number.isNaN(value)) setTempo(Math.max(20, Math.min(300, value)))
            }}
          />
        </div>

        <div className="metronome-panel__beat-display" aria-live="polite">
          {Array.from({ length: rhythm.beatsPerBar }).map(function(_, beatIndex) {
            const isBeatActive = beatIndex === activeBeat
            const accent = rhythm.accents[beatIndex]
            const indicatorClass = [
              'metronome-panel__beat-indicator',
              isBeatActive ? 'is-active' : '',
              isBeatActive && accent === METRONOME_ACCENT ? 'is-accent-active' : '',
            ].filter(Boolean).join(' ')

            return (
              <div className="metronome-panel__beat" key={'beat-display-' + beatIndex}>
                <div className="metronome-panel__beat-pulses">
                  {rhythm.pulsesPerBeat > 1 && Array.from({ length: rhythm.pulsesPerBeat }).map(function(__, pulseIndex) {
                    const isPulseActive = isBeatActive && pulseIndex === activePulse
                    return (
                      <span
                        key={'pulse-' + beatIndex + '-' + pulseIndex}
                        className={'metronome-panel__pulse-dot' + (isPulseActive ? ' is-active' : '')}
                      />
                    )
                  })}
                </div>
                <div className={indicatorClass} />
                <span className="metronome-panel__beat-cell-label">{beatIndex + 1}</span>
              </div>
            )
          })}
        </div>

        <div className="metronome-panel__section-title">Quick rhythms</div>
        <div className="metronome-panel__presets">
          {METRONOME_RHYTHM_PRESETS.map(function(preset) {
            return (
              <Button
                key={preset.id}
                size="sm"
                variant={activePresetId === preset.id ? 'primary' : 'outline-primary'}
                onClick={function() { applyPreset(preset.id) }}
              >
                {preset.label}
              </Button>
            )
          })}
        </div>

        <div className="metronome-panel__controls-row">
          <span className="metronome-panel__section-title" style={{ marginBottom: 0 }}>Beats per bar</span>
          <ButtonGroup>
            <Button
              variant="outline-secondary"
              onClick={function() { setBeatsPerBar(rhythm.beatsPerBar - 1) }}
              disabled={rhythm.beatsPerBar <= 1}
            >
              -
            </Button>
            <Button variant="light" disabled>{rhythm.beatsPerBar}</Button>
            <Button
              variant="outline-secondary"
              onClick={function() { setBeatsPerBar(rhythm.beatsPerBar + 1) }}
              disabled={rhythm.beatsPerBar >= 16}
            >
              +
            </Button>
          </ButtonGroup>
        </div>

        <div className="metronome-panel__section-title">Beat accents</div>
        <div className="metronome-panel__beat-editor">
          {rhythm.accents.map(function(level, beatIndex) {
            const variant = level === METRONOME_ACCENT ? 'primary' : (level === METRONOME_MUTE ? 'outline-secondary' : 'outline-primary')
            return (
              <div className="metronome-panel__beat-cell" key={'beat-edit-' + beatIndex}>
                <Button
                  variant={variant}
                  onClick={function() { cycleBeatAccent(beatIndex) }}
                  title={accentButtonTitle(level)}
                >
                  {accentButtonLabel(level)}
                </Button>
                <span className="metronome-panel__beat-cell-label">Beat {beatIndex + 1}</span>
              </div>
            )
          })}
        </div>

        <div className="metronome-panel__controls-row">
          <span className="metronome-panel__section-title" style={{ marginBottom: 0 }}>Pulses per beat</span>
          <ButtonGroup>
            {METRONOME_PULSE_OPTIONS.map(function(pulses) {
              return (
                <Button
                  key={'pulses-' + pulses}
                  variant={rhythm.pulsesPerBeat === pulses ? 'primary' : 'outline-primary'}
                  onClick={function() { setPulsesPerBeat(pulses) }}
                >
                  {pulses}
                </Button>
              )
            })}
          </ButtonGroup>
        </div>

        <p className="metronome-panel__hint">
          ● accented downbeat, · regular tick, ○ silent beat. Pulses add softer subdivision clicks between beats.
          {totalSlots > rhythm.beatsPerBar ? (' Currently ' + totalSlots + ' clicks per bar.') : ''}
        </p>
      </div>
    </div>
  )
}
