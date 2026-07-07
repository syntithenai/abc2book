import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import FormFieldHelp from './FormFieldHelp'
import { icons } from '../Icons'
import Metronome from '../Metronome'
import {
  METRONOME_ACCENT,
  METRONOME_MUTE,
} from '../metronomeTickSounds'
import {
  METRONOME_PULSE_OPTIONS,
  METRONOME_RHYTHM_PRESETS,
  createRhythm,
  cycleAccentLevel,
  defaultMetronomeRhythm,
  formatRhythmText,
  parseRhythmText,
  presetIdForRhythm,
  rhythmFromTimeSignature,
  rhythmsEqual,
  rhythmKey,
  slotBeatIndex,
  slotPulseIndex,
  slotsPerBar,
} from '../metronomeRhythmPresets'
import {
  resolveTuneTimeSignature,
} from '../playbackMetronomeSettings'
import './MetronomePanel.css'

const STORAGE_KEY = 'bookstorage_metronome'
const DEFAULT_TEMPO = 100
const DEFAULT_RHYTHM_TEXT = '4/4'

const TEMPO_MARKINGS = {
  40: 'Largo',
  60: 'Larghetto',
  72: 'Andante',
  96: 'Moderato',
  120: 'Allegro',
  144: 'Vivace',
  168: 'Presto',
}

const METRONOME_HELP_FIELDS = [
  {
    title: 'Start and stop',
    body: 'Use Start to begin the click track and Stop to silence it. Settings stay in place while it runs, so you can change tempo or rhythm without restarting.',
  },
  {
    title: 'Tempo',
    body: 'Set beats per minute with the −5 / − / + / +5 buttons, type a value in the centre field, or use Tap tempo and tap a steady pulse a few times. The label under the BPM (for example Allegro) is the nearest common tempo marking.',
  },
  {
    title: 'Beat display',
    body: 'The circles show each beat in the bar. The active beat lights up as the metronome plays. When pulses per beat is greater than one, small dots above each beat show the subdivision clicks.',
  },
  {
    title: 'Quick rhythms',
    body: 'Focus the field to see common time signatures, or type one such as 4/4, 3/4, 6/8, or an additive pattern like 3+2. The text is parsed into beats per bar and per-beat pulses, with an accent on the first beat.',
  },
  {
    title: 'Beats per bar',
    body: 'How many main beats make up one bar. Increase or decrease to match the meter you are practising.',
  },
  {
    title: 'Beat accents',
    body: 'Each beat can be accented (●), a regular tick (·), or silent (○). Click a beat to cycle through those levels. Accents are useful for downbeats and other strong beats in the bar.',
  },
  {
    title: 'Pulses per beat',
    body: 'Each beat has its own pulse count (1–5). Use 1 for a simple meter such as 5/4, or different values per beat for additive feels such as 3+2.',
  },
  {
    title: 'Reset',
    body: 'Restore the default rhythm from the tune time signature (or 4/4 when no meter is set).',
  },
  {
    title: 'Settings',
    body: 'Tempo and rhythm choices are saved in this browser so they return the next time you open the metronome page.',
  },
]

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

function rhythmFromTune(tune, tunebook) {
  const meter = resolveTuneTimeSignature(tune, tunebook)
  return meter ? rhythmFromTimeSignature(meter) : defaultMetronomeRhythm()
}

function initialRhythm(saved, tune, tunebook) {
  if (saved && saved.rhythm) {
    return createRhythm(saved.rhythm.beatsPerBar, saved.rhythm.accents, saved.rhythm.pulsesPerBeat)
  }
  if (tune) return rhythmFromTune(tune, tunebook)
  return defaultMetronomeRhythm()
}

function initialQuickRhythmText(saved, rhythm) {
  if (saved && typeof saved.quickRhythmText === 'string' && saved.quickRhythmText.trim()) {
    return saved.quickRhythmText
  }
  return formatRhythmText(rhythm)
}

function settingsFromCurrentTune(tunes, currentTuneId, tunebook) {
  if (!tunes || currentTuneId == null || currentTuneId === '' || currentTuneId === 0 || currentTuneId === '0') {
    return null
  }
  const tune = tunes[currentTuneId]
  if (!tune) return null

  let tempo = null
  if (tune.tempo != null && String(tune.tempo).trim() !== '') {
    const cleaned = tunebook && tunebook.abcTools && tunebook.abcTools.cleanTempo
      ? tunebook.abcTools.cleanTempo(tune.tempo)
      : parseInt(String(tune.tempo).split('=').pop(), 10)
    if (cleaned > 0) tempo = Math.max(20, Math.min(300, cleaned))
  }

  let rhythm = null
  let rhythmText = null
  const meter = resolveTuneTimeSignature(tune, tunebook)
  if (meter) {
    rhythm = rhythmFromTimeSignature(meter)
    rhythmText = formatRhythmText(rhythm)
  }

  if (tempo == null && !rhythm) return null
  return { tempo: tempo, rhythm: rhythm, rhythmText: rhythmText }
}

export default function MetronomePanel(props) {
  const settingsOnly = !!props.settingsOnly
  const showPreview = !!props.showPreview
  const hideTempo = !!props.hideTempo
  const disabled = !!props.disabled
  const embedPreview = settingsOnly && showPreview
  const saved = settingsOnly ? null : loadSavedSettings()
  const fromTune = settingsOnly
    ? null
    : settingsFromCurrentTune(props.tunes, props.currentTune, props.tunebook)
  const tuneForDefaults = props.tune || (fromTune && props.tunes && props.currentTune != null ? props.tunes[props.currentTune] : null)
  const externalRhythm = props.rhythm
  const externalRhythmKey = rhythmKey(externalRhythm)
  const startingRhythm = externalRhythm
    || (fromTune && fromTune.rhythm)
    || initialRhythm(saved, tuneForDefaults, props.tunebook)
  const [tempo, setTempo] = useState(
    (fromTune && fromTune.tempo) || (saved && saved.tempo) || DEFAULT_TEMPO
  )
  const [rhythm, setRhythm] = useState(startingRhythm)
  const [activePresetId, setActivePresetId] = useState(function() {
    if (fromTune && fromTune.rhythm) return presetIdForRhythm(fromTune.rhythm)
    if (saved && saved.presetId) return saved.presetId
    return presetIdForRhythm(startingRhythm)
  })
  const [quickRhythmText, setQuickRhythmText] = useState(
    (fromTune && fromTune.rhythmText) || initialQuickRhythmText(saved, startingRhythm)
  )
  const [quickRhythmOpen, setQuickRhythmOpen] = useState(false)
  const [isRunning, setIsRunning] = useState(false)
  const [activeSlot, setActiveSlot] = useState(-1)

  const metronomeRef = useRef(null)
  const audioContextRef = useRef(null)
  const rhythmRef = useRef(rhythm)
  const tapTimesRef = useRef([])
  const quickRhythmRef = useRef(null)

  rhythmRef.current = rhythm

  const persistSettings = useCallback(function(nextTempo, nextRhythm, presetId, rhythmText) {
    saveSettings({
      tempo: nextTempo,
      rhythm: nextRhythm,
      presetId: presetId,
      quickRhythmText: rhythmText,
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
    if (props.previewTempo > 0) {
      setTempo(Math.max(20, Math.min(300, Math.round(props.previewTempo))))
    }
  }, [props.previewTempo])

  useEffect(function() {
    if (!settingsOnly) {
      persistSettings(tempo, rhythm, activePresetId, quickRhythmText)
    }
  }, [tempo, rhythm, activePresetId, quickRhythmText, persistSettings, settingsOnly])

  useEffect(function() {
    if (!externalRhythm) return
    const next = createRhythm(
      externalRhythm.beatsPerBar,
      externalRhythm.accents,
      externalRhythm.pulsesPerBeat
    )
    if (rhythmsEqual(rhythmRef.current, next)) return
    if (metronomeRef.current && metronomeRef.current.isRunning) {
      metronomeRef.current.stop()
      setIsRunning(false)
      setActiveSlot(-1)
    }
    if (metronomeRef.current) metronomeRef.current.setRhythm(next)
    setRhythm(next)
    setQuickRhythmText(formatRhythmText(next))
    setActivePresetId(presetIdForRhythm(next))
  }, [externalRhythmKey])

  useEffect(function() {
    if (metronomeRef.current) {
      metronomeRef.current.setTempo(tempo)
    }
  }, [tempo])

  useEffect(function() {
    if (!quickRhythmOpen) return undefined
    function handlePointerDown(event) {
      if (quickRhythmRef.current && !quickRhythmRef.current.contains(event.target)) {
        setQuickRhythmOpen(false)
      }
    }
    document.addEventListener('mousedown', handlePointerDown)
    return function cleanup() {
      document.removeEventListener('mousedown', handlePointerDown)
    }
  }, [quickRhythmOpen])

  function applyRhythm(nextRhythm, rhythmText, presetId, options) {
    if (disabled) return
    const notifyParent = !options || options.notifyParent !== false
    setRhythm(nextRhythm)
    setQuickRhythmText(rhythmText)
    setActivePresetId(presetId)
    if (metronomeRef.current) metronomeRef.current.setRhythm(nextRhythm)
    if (notifyParent && props.onRhythmChange) {
      props.onRhythmChange({ rhythm: nextRhythm })
    }
  }

  function ensureMetronome() {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
    }
    if (!metronomeRef.current) {
      metronomeRef.current = new Metronome(
        audioContextRef.current,
        tempo,
        rhythm.beatsPerBar,
        0,
        null,
        null,
        rhythm
      )
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

  useEffect(function() {
    if (props.stopOnPlayback && isRunning) {
      stopMetronome()
    }
  }, [props.stopOnPlayback, isRunning])

  function toggleMetronome() {
    if (isRunning) stopMetronome()
    else startMetronome()
  }

  function commitQuickRhythmText(text) {
    const parsed = parseRhythmText(text)
    if (!parsed) {
      setQuickRhythmText(formatRhythmText(rhythm))
      return
    }
    applyRhythm(parsed, formatRhythmText(parsed), presetIdForRhythm(parsed))
  }

  function setBeatsPerBar(count) {
    const nextCount = Math.max(1, Math.min(16, count))
    const nextRhythm = createRhythm(nextCount, rhythm.accents, rhythm.pulsesPerBeat)
    applyRhythm(nextRhythm, formatRhythmText(nextRhythm), '')
  }

  function setPulsesForBeat(beatIndex, pulses) {
    const nextPulses = rhythm.pulsesPerBeat.slice()
    nextPulses[beatIndex] = pulses
    const nextRhythm = createRhythm(rhythm.beatsPerBar, rhythm.accents, nextPulses)
    applyRhythm(nextRhythm, formatRhythmText(nextRhythm), '')
  }

  function selectQuickRhythmPreset(preset) {
    const nextRhythm = createRhythm(preset.beatsPerBar, preset.accents, preset.pulsesPerBeat)
    applyRhythm(nextRhythm, preset.label, preset.id)
    setQuickRhythmOpen(false)
  }

  function cycleBeatAccent(beatIndex) {
    const accents = rhythm.accents.slice()
    accents[beatIndex] = cycleAccentLevel(accents[beatIndex])
    const nextRhythm = createRhythm(rhythm.beatsPerBar, accents, rhythm.pulsesPerBeat)
    applyRhythm(nextRhythm, formatRhythmText(nextRhythm), presetIdForRhythm(nextRhythm))
  }

  function resetMetronomeForm() {
    const nextRhythm = rhythmFromTune(tuneForDefaults, props.tunebook)
    const nextRhythmText = formatRhythmText(nextRhythm)
    if (settingsOnly) {
      applyRhythm(nextRhythm, nextRhythmText, presetIdForRhythm(nextRhythm))
      return
    }
    setTempo(DEFAULT_TEMPO)
    applyRhythm(nextRhythm, nextRhythmText, presetIdForRhythm(nextRhythm))
    tapTimesRef.current = []
  }

  function adjustTempo(delta) {
    setTempo(function(current) {
      return Math.max(20, Math.min(300, (parseInt(current, 10) || DEFAULT_TEMPO) + delta))
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

  const activeBeat = activeSlot >= 0 ? slotBeatIndex(rhythm, activeSlot) : -1
  const activePulse = activeSlot >= 0 ? slotPulseIndex(rhythm, activeSlot) : -1
  const totalSlots = slotsPerBar(rhythm)
  const helpFields = METRONOME_HELP_FIELDS.concat(
    totalSlots > rhythm.beatsPerBar
      ? [{
          title: 'Current pattern',
          body: 'With the current settings there are ' + totalSlots + ' clicks per bar (' + rhythm.pulsesPerBeat.join(' + ') + ' pulses).',
        }]
      : []
  )

  return (
    <div className={'metronome-panel'
      + (settingsOnly ? ' metronome-panel--settings-only' : '')
      + (embedPreview ? ' metronome-panel--embed-preview' : '')}>
      <div className="metronome-panel__card">
        {(!settingsOnly || embedPreview) ? (
        <div className="metronome-panel__toolbar">
          <Button
            variant={isRunning ? 'danger' : 'success'}
            size="lg"
            className="metronome-panel__start-stop"
            onClick={toggleMetronome}
          >
            {isRunning ? 'Stop' : 'Start'}
          </Button>

          {!settingsOnly ? (
          <FormFieldHelp
            title="Metronome"
            fields={helpFields}
            className="metronome-panel__help-btn"
            buttonTitle="Metronome help"
          />
          ) : null}

          {!hideTempo && !settingsOnly ? (
          <ButtonGroup className="metronome-panel__tempo-group" aria-label="Tempo">
            <Button variant="primary" className="metronome-panel__tempo-step" onClick={function() { adjustTempo(-5) }}>-5</Button>
            <Button variant="primary" className="metronome-panel__tempo-nudge" onClick={function() { adjustTempo(-1) }}>-</Button>
            <div className="metronome-panel__tempo-value">
              <input
                className="metronome-panel__tempo-input"
                type="number"
                min="20"
                max="300"
                value={tempo}
                aria-label="Tempo in beats per minute"
                onChange={function(e) {
                  const value = parseInt(e.target.value, 10)
                  if (!Number.isNaN(value)) setTempo(Math.max(20, Math.min(300, value)))
                }}
              />
              <span className="metronome-panel__tempo-marking">{nearestTempoMarking(tempo)}</span>
            </div>
            <Button variant="primary" className="metronome-panel__tempo-nudge" onClick={function() { adjustTempo(1) }}>+</Button>
            <Button variant="primary" className="metronome-panel__tempo-step" onClick={function() { adjustTempo(5) }}>+5</Button>
            <Button variant="secondary" className="metronome-panel__tap-tempo" onClick={handleTapTempo}>
              Tap tempo
            </Button>
          </ButtonGroup>
          ) : null}
        </div>
        ) : null}

        {(!settingsOnly || embedPreview) ? (
        <div className="metronome-panel__activity-row">
          <div className="metronome-panel__beat-display" aria-live="polite">
            {Array.from({ length: rhythm.beatsPerBar }).map(function(_, beatIndex) {
              const isBeatActive = beatIndex === activeBeat
              const accent = rhythm.accents[beatIndex]
              const indicatorClass = [
                'metronome-panel__beat-indicator',
                isBeatActive ? 'is-active' : '',
                isBeatActive && accent === METRONOME_ACCENT ? 'is-accent-active' : '',
              ].filter(Boolean).join(' ')

              const beatPulses = rhythm.pulsesPerBeat[beatIndex] || 1
              return (
                <div className="metronome-panel__beat" key={'beat-display-' + beatIndex}>
                  <div className="metronome-panel__beat-pulses">
                    {beatPulses > 1 && Array.from({ length: beatPulses }).map(function(__, pulseIndex) {
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

          <Button
            variant="danger"
            className="metronome-panel__reset"
            onClick={resetMetronomeForm}
          >
            Reset
          </Button>
        </div>
        ) : null}

        <div className={'metronome-panel__rhythm-row' + (disabled ? ' metronome-panel__rhythm-row--disabled' : '')}>
          <div className="metronome-panel__preset-wrap" ref={quickRhythmRef}>
            <ButtonGroup className="metronome-panel__control-group metronome-panel__preset-group" aria-label="Quick rhythms">
              <Button
                variant="light"
                className="metronome-panel__group-label metronome-panel__group-label-icon"
                disabled
                title="Quick rhythms"
              >
                {icons.wizard}
              </Button>
              <input
                className="metronome-panel__preset-input"
                type="text"
                value={quickRhythmText}
                placeholder="4/4"
                aria-label="Quick rhythm time signature"
                aria-expanded={quickRhythmOpen}
                aria-controls="metronome-quick-rhythm-menu"
                autoComplete="off"
                onChange={function(e) { setQuickRhythmText(e.target.value) }}
                onFocus={function() { setQuickRhythmOpen(true) }}
                onBlur={function(e) { commitQuickRhythmText(e.target.value) }}
                onKeyDown={function(e) {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    commitQuickRhythmText(e.target.value)
                    setQuickRhythmOpen(false)
                    e.target.blur()
                  } else if (e.key === 'Escape') {
                    setQuickRhythmOpen(false)
                  } else if (e.key === 'ArrowDown') {
                    setQuickRhythmOpen(true)
                  }
                }}
              />
            </ButtonGroup>
            {quickRhythmOpen ? (
              <ul
                id="metronome-quick-rhythm-menu"
                className="metronome-panel__preset-menu"
                role="listbox"
              >
                {METRONOME_RHYTHM_PRESETS.map(function(preset) {
                  const isActive = quickRhythmText === preset.label
                  return (
                    <li key={preset.id} role="option" aria-selected={isActive}>
                      <button
                        type="button"
                        className={'metronome-panel__preset-option' + (isActive ? ' is-active' : '')}
                        onMouseDown={function(e) {
                          e.preventDefault()
                          selectQuickRhythmPreset(preset)
                        }}
                      >
                        {preset.label}
                      </button>
                    </li>
                  )
                })}
              </ul>
            ) : null}
          </div>

          <ButtonGroup className="metronome-panel__control-group" aria-label="Beats per bar">
            <Button variant="light" className="metronome-panel__group-label" disabled>
              Beats per bar
            </Button>
            <Button
              variant="outline-secondary"
              onClick={function() { setBeatsPerBar(rhythm.beatsPerBar - 1) }}
              disabled={rhythm.beatsPerBar <= 1}
            >
              -
            </Button>
            <Button variant="light" className="metronome-panel__group-value" disabled>
              {rhythm.beatsPerBar}
            </Button>
            <Button
              variant="outline-secondary"
              onClick={function() { setBeatsPerBar(rhythm.beatsPerBar + 1) }}
              disabled={rhythm.beatsPerBar >= 16}
            >
              +
            </Button>
          </ButtonGroup>

          <ButtonGroup className="metronome-panel__control-group metronome-panel__accents-group" aria-label="Beat accents">
            <Button variant="light" className="metronome-panel__group-label" disabled>
              Beat accents
            </Button>
            {rhythm.accents.map(function(level, beatIndex) {
              const variant = level === METRONOME_ACCENT ? 'primary' : (level === METRONOME_MUTE ? 'outline-secondary' : 'outline-primary')
              return (
                <Button
                  key={'beat-edit-' + beatIndex}
                  variant={variant}
                  onClick={function() { cycleBeatAccent(beatIndex) }}
                  title={accentButtonTitle(level)}
                  aria-label={'Beat ' + (beatIndex + 1) + ': ' + accentButtonTitle(level)}
                >
                  {accentButtonLabel(level)}
                </Button>
              )
            })}
          </ButtonGroup>

          <ButtonGroup className="metronome-panel__control-group metronome-panel__pulses-group" aria-label="Pulses per beat">
            <Button variant="light" className="metronome-panel__group-label" disabled>
              Pulses per beat
            </Button>
            {rhythm.pulsesPerBeat.map(function(pulses, beatIndex) {
              return (
                <select
                  key={'pulses-' + beatIndex}
                  className="metronome-panel__pulse-select"
                  value={pulses}
                  aria-label={'Pulses for beat ' + (beatIndex + 1)}
                  title={'Pulses for beat ' + (beatIndex + 1)}
                  onChange={function(e) { setPulsesForBeat(beatIndex, parseInt(e.target.value, 10)) }}
                >
                  {METRONOME_PULSE_OPTIONS.map(function(option) {
                    return (
                      <option key={option} value={option}>{option}</option>
                    )
                  })}
                </select>
              )
            })}
          </ButtonGroup>
        </div>
      </div>
    </div>
  )
}
