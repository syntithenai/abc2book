import { useCallback, useEffect, useRef, useState } from 'react'
import { Button, ButtonGroup } from 'react-bootstrap'
import FormFieldHelp from './FormFieldHelp'
import { icons } from '../Icons'
import Metronome from '../Metronome'
import {
  METRONOME_ACCENT,
  METRONOME_MUTE,
  getMetronomeVolumes,
  setMetronomeVolumes,
} from '../metronomeTickSounds'
import {
  ENGINE_MODE_CLICK,
  ENGINE_MODE_DRUMS,
  createEmptyDrumPattern,
  createRhythmConfig,
  normalizeRhythmConfig,
  rhythmConfigKey,
  rhythmsDifferOnlyInDrumPattern,
  rhythmsEqual,
} from '../rhythmEngineTypes'
import { primeDrumKit } from '../drumSampleKit'
import {
  applyRhythmPreset,
  defaultDrumPresetIdForRhythm,
  getCompatibleDrumPresets,
  getRhythmPresetById,
  presetMatchesRhythm,
} from '../drumPatternPresets'
import { remapDrumPatternGranularity } from '../rhythmGranularity'
import DrumPatternEditor from './DrumPatternEditor'
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
    title: 'Sound mode',
    body: 'Click mode uses the classic metronome tick. Drums mode plays a groove from bundled drum samples. Choose a preset to get started quickly, or expand Edit pattern to customise the grid.',
  },
  {
    title: 'Drum presets',
    body: 'When Drums is selected, open the preset picker to browse grooves by category — rock, funk, jazz, Latin, folk, practice patterns, and more.',
  },
  {
    title: 'Pattern editor',
    body: 'Expand Edit pattern to toggle individual hits on the step grid. Each column is one subdivision click; beat boundaries are marked with a stronger line.',
  },
  {
    title: 'Swing',
    body: 'Adds a laid-back feel to off-beat subdivisions. Straight is even; Light and Medium add progressively more swing.',
  },
  {
    title: 'Drum volume',
    body: 'Controls the loudness of drum samples. Separate from click volume so you can balance the two modes independently.',
  },
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
    title: 'Volume',
    body: 'Volume controls the loudness of regular ticks and subdivisions. Accent volume controls accented beats (usually the downbeat). Both apply to every metronome in the app, including playback count-in and chord recording.',
  },
  {
    title: 'Reset',
    body: 'Restore the default rhythm from the tune time signature (or 4/4 when no meter is set).',
  },
  {
    title: 'Settings',
    body: 'Tempo, rhythm, and volume choices are saved in this browser so they return the next time you open the metronome.',
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

function initialRhythmConfig(saved, tune, tunebook) {
  if (saved && saved.rhythm) {
    return normalizeRhythmConfig(saved.rhythm)
  }
  if (tune) return normalizeRhythmConfig(rhythmFromTune(tune, tunebook))
  return normalizeRhythmConfig(defaultMetronomeRhythm())
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
  const hideTransport = !!props.hideTransport
  const disabled = !!props.disabled
  const embedPreview = settingsOnly && showPreview
  const saved = settingsOnly ? null : loadSavedSettings()
  const fromTune = settingsOnly
    ? null
    : settingsFromCurrentTune(props.tunes, props.currentTune, props.tunebook)
  const tuneForDefaults = props.tune || (fromTune && props.tunes && props.currentTune != null ? props.tunes[props.currentTune] : null)
  const externalRhythm = props.rhythm
  const externalRhythmKey = rhythmConfigKey(externalRhythm)
  const startingRhythm = normalizeRhythmConfig(
    externalRhythm
    || (fromTune && fromTune.rhythm)
    || initialRhythmConfig(saved, tuneForDefaults, props.tunebook)
  )
  const [tempo, setTempo] = useState(
    (fromTune && fromTune.tempo) || (saved && saved.tempo) || DEFAULT_TEMPO
  )
  const [rhythm, setRhythm] = useState(startingRhythm)
  const [activePresetId, setActivePresetId] = useState(function() {
    if (startingRhythm.presetId) return startingRhythm.presetId
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
  const initialVolumes = getMetronomeVolumes()
  const [tickVolume, setTickVolume] = useState(initialVolumes.volume)
  const [accentVolume, setAccentVolume] = useState(initialVolumes.accentVolume)
  const [drumVolume, setDrumVolume] = useState(initialVolumes.drumVolume)
  const isDrumMode = rhythm.engineMode === ENGINE_MODE_DRUMS
  const [panelAudioContext, setPanelAudioContext] = useState(null)

  const metronomeRef = useRef(null)
  const audioContextRef = useRef(null)
  const rhythmRef = useRef(rhythm)
  const tapTimesRef = useRef([])
  const quickRhythmRef = useRef(null)
  const recordingTransportRef = useRef(null)
  const startedForRecordingRef = useRef(false)

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
    const next = normalizeRhythmConfig(externalRhythm)
    if (rhythmConfigKey(rhythmRef.current) === rhythmConfigKey(next)) return
    const recordingActive = !!recordingTransportRef.current
    const patternOnly = recordingActive
      && metronomeRef.current
      && metronomeRef.current.isRunning
      && rhythmsDifferOnlyInDrumPattern(rhythmRef.current, next)
    if (patternOnly) {
      metronomeRef.current.updateDrumPattern(next.drumPattern)
      setRhythm(next)
      return
    }
    if (metronomeRef.current && metronomeRef.current.isRunning) {
      metronomeRef.current.stop()
      setIsRunning(false)
      setActiveSlot(-1)
    }
    if (metronomeRef.current) metronomeRef.current.setRhythm(next)
    setRhythm(next)
    setQuickRhythmText(formatRhythmText(next))
    setActivePresetId(next.presetId || presetIdForRhythm(next))
  }, [externalRhythmKey])

  useEffect(function() {
    if (metronomeRef.current) {
      metronomeRef.current.setTempo(tempo)
    }
  }, [tempo])

  function commitTempo(nextTempo) {
    const value = Math.max(20, Math.min(300, Math.round(nextTempo)))
    setTempo(value)
    if (typeof props.onTempoChange === 'function') {
      props.onTempoChange(value)
    }
  }

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
    const opts = options || {}
    const notifyParent = opts.notifyParent !== false
    const normalized = normalizeRhythmConfig(nextRhythm)
    const preserveTransport = !!opts.preserveTransport
      || (!!recordingTransportRef.current
        && metronomeRef.current
        && metronomeRef.current.isRunning
        && rhythmsDifferOnlyInDrumPattern(rhythmRef.current, normalized))
    setRhythm(normalized)
    setQuickRhythmText(rhythmText)
    setActivePresetId(presetId || normalized.presetId || '')
    if (metronomeRef.current) {
      if (preserveTransport && normalized.drumPattern) {
        metronomeRef.current.updateDrumPattern(normalized.drumPattern)
      } else {
        metronomeRef.current.setRhythm(normalized)
      }
    }
    if (notifyParent && props.onRhythmChange) {
      props.onRhythmChange({ rhythm: normalized })
    }
  }

  function resolveDrumRhythmAfterMeterChange(nextRhythm, previousRhythm) {
    if (nextRhythm.engineMode !== ENGINE_MODE_DRUMS) return nextRhythm

    const prevPresetId = previousRhythm.presetId
    const pattern = nextRhythm.drumPattern || previousRhythm.drumPattern
    if (pattern) {
      const remapped = remapDrumPatternGranularity(pattern, previousRhythm, nextRhythm)
      const presetStillMatches = prevPresetId
        && presetMatchesRhythm(getRhythmPresetById(prevPresetId), nextRhythm)
      return normalizeRhythmConfig(Object.assign({}, nextRhythm, {
        drumPattern: remapped,
        presetId: presetStillMatches ? prevPresetId : '',
      }))
    }

    if (prevPresetId) {
      const prevPreset = getRhythmPresetById(prevPresetId)
      if (prevPreset && presetMatchesRhythm(prevPreset, nextRhythm)) {
        return applyRhythmPreset(prevPresetId)
      }
    }
    return normalizeRhythmConfig(Object.assign({}, nextRhythm, {
      drumPattern: createEmptyDrumPattern(slotsPerBar(nextRhythm)),
      presetId: '',
    }))
  }

  function handleEngineModeChange(mode) {
    if (disabled) return
    const stores = props.rhythmStores
    let next
    if (mode === ENGINE_MODE_DRUMS) {
      if (stores && stores.drumRhythm) {
        next = normalizeRhythmConfig(Object.assign({}, stores.drumRhythm, {
          engineMode: ENGINE_MODE_DRUMS,
        }))
      } else if (rhythm.drumPattern) {
        next = normalizeRhythmConfig(Object.assign({}, rhythm, {
          engineMode: ENGINE_MODE_DRUMS,
        }))
      } else {
        next = applyRhythmPreset(defaultDrumPresetIdForRhythm(rhythm))
      }
      if (getCompatibleDrumPresets(next).length === 0 && !next.drumPattern) {
        next = applyRhythmPreset(defaultDrumPresetIdForRhythm(next))
      }
    } else if (stores && stores.clickRhythm) {
      next = normalizeRhythmConfig(Object.assign({}, stores.clickRhythm, {
        engineMode: ENGINE_MODE_CLICK,
        drumPattern: null,
      }))
    } else {
      next = normalizeRhythmConfig(Object.assign({}, rhythm, {
        engineMode: ENGINE_MODE_CLICK,
        drumPattern: null,
      }))
    }
    applyRhythm(next, formatRhythmText(next), next.presetId)
    if (mode === ENGINE_MODE_DRUMS && audioContextRef.current) {
      primeDrumKit(audioContextRef.current).catch(function() {})
    }
  }

  function handleDrumRhythmChange(nextRhythm, options) {
    applyRhythm(nextRhythm, formatRhythmText(nextRhythm), nextRhythm.presetId || '', options)
  }

  function ensureMetronome() {
    if (!audioContextRef.current) {
      audioContextRef.current = new (window.AudioContext || window.webkitAudioContext)()
      setPanelAudioContext(audioContextRef.current)
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
    const metro = metronomeRef.current
    metro.setTempo(tempo)
    if (!metro.isRunning) {
      metro.setRhythm(rhythm)
    } else if (rhythmsDifferOnlyInDrumPattern(metro.rhythm, rhythm)) {
      metro.updateDrumPattern(rhythm.drumPattern)
    } else if (rhythmConfigKey(metro.rhythm) !== rhythmConfigKey(rhythm)) {
      const slot = metro.currentSlotInBar
      const nextTime = metro.nextNoteTime
      metro.setRhythm(rhythm)
      metro.alignToSlot(slot, nextTime)
    }
    return metro
  }

  function startMetronome() {
    const metro = ensureMetronome()
    const startPlayback = function() {
      metro.start()
      setIsRunning(true)
    }
    if (rhythm.engineMode === ENGINE_MODE_DRUMS) {
      primeDrumKit(audioContextRef.current).then(startPlayback).catch(startPlayback)
    } else {
      startPlayback()
    }
  }

  function stopMetronome() {
    if (metronomeRef.current) {
      metronomeRef.current.setLoopMode(false)
      metronomeRef.current.onBarDownbeat = null
      metronomeRef.current.stop()
    }
    setIsRunning(false)
    setActiveSlot(-1)
    startedForRecordingRef.current = false
  }

  function handleRecordingStart(transport) {
    const metro = ensureMetronome()
    recordingTransportRef.current = transport
    if (!metro.isRunning) {
      startedForRecordingRef.current = true
      const startPlayback = function() {
        metro.setLoopMode(true)
        metro.onBarDownbeat = function(time) {
          if (recordingTransportRef.current && recordingTransportRef.current.onBarDownbeat) {
            recordingTransportRef.current.onBarDownbeat(time)
          }
        }
        metro.start()
        setIsRunning(true)
      }
      if (rhythm.engineMode === ENGINE_MODE_DRUMS) {
        primeDrumKit(audioContextRef.current).then(startPlayback).catch(startPlayback)
      } else {
        startPlayback()
      }
    } else {
      metro.setLoopMode(true)
      metro.onBarDownbeat = function(time) {
        if (recordingTransportRef.current && recordingTransportRef.current.onBarDownbeat) {
          recordingTransportRef.current.onBarDownbeat(time)
        }
      }
    }
  }

  function handleRecordingStop() {
    if (metronomeRef.current) {
      metronomeRef.current.setLoopMode(false)
      metronomeRef.current.onBarDownbeat = null
    }
    recordingTransportRef.current = null
    if (startedForRecordingRef.current) {
      stopMetronome()
    }
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
    let nextRhythm = createRhythmConfig(parsed.beatsPerBar, parsed.accents, parsed.pulsesPerBeat, {
      engineMode: rhythm.engineMode,
      presetId: rhythm.engineMode === ENGINE_MODE_DRUMS ? '' : presetIdForRhythm(parsed),
      drumPattern: rhythm.drumPattern,
    })
    if (nextRhythm.engineMode === ENGINE_MODE_DRUMS && rhythm.drumPattern) {
      nextRhythm = normalizeRhythmConfig(Object.assign({}, nextRhythm, {
        drumPattern: remapDrumPatternGranularity(rhythm.drumPattern, rhythm, nextRhythm),
      }))
    } else if (nextRhythm.engineMode !== ENGINE_MODE_DRUMS) {
      nextRhythm.presetId = presetIdForRhythm(parsed)
    }
    applyRhythm(nextRhythm, formatRhythmText(parsed), nextRhythm.presetId || '')
  }

  function setBeatsPerBar(count) {
    const nextCount = Math.max(1, Math.min(16, count))
    let nextRhythm = createRhythmConfig(nextCount, rhythm.accents, rhythm.pulsesPerBeat, {
      engineMode: rhythm.engineMode,
      drumPattern: rhythm.drumPattern,
      presetId: rhythm.engineMode === ENGINE_MODE_DRUMS ? '' : (rhythm.presetId || ''),
    })
    if (nextRhythm.engineMode === ENGINE_MODE_DRUMS) {
      nextRhythm = resolveDrumRhythmAfterMeterChange(nextRhythm, rhythm)
    }
    applyRhythm(nextRhythm, formatRhythmText(nextRhythm), nextRhythm.presetId || '')
  }

  function setPulsesForBeat(beatIndex, pulses) {
    const nextPulses = rhythm.pulsesPerBeat.slice()
    nextPulses[beatIndex] = pulses
    let nextRhythm = createRhythmConfig(rhythm.beatsPerBar, rhythm.accents, nextPulses, {
      engineMode: rhythm.engineMode,
      drumPattern: rhythm.drumPattern,
      presetId: '',
    })
    if (nextRhythm.engineMode === ENGINE_MODE_DRUMS) {
      nextRhythm = resolveDrumRhythmAfterMeterChange(nextRhythm, rhythm)
    }
    applyRhythm(nextRhythm, formatRhythmText(nextRhythm), nextRhythm.presetId || '')
  }

  function selectQuickRhythmPreset(preset) {
    const nextRhythm = createRhythmConfig(preset.beatsPerBar, preset.accents, preset.pulsesPerBeat, {
      engineMode: ENGINE_MODE_CLICK,
      presetId: preset.id,
    })
    applyRhythm(nextRhythm, preset.label, preset.id)
    setQuickRhythmOpen(false)
  }

  function cycleBeatAccent(beatIndex) {
    const accents = rhythm.accents.slice()
    accents[beatIndex] = cycleAccentLevel(accents[beatIndex])
    const nextRhythm = createRhythmConfig(rhythm.beatsPerBar, accents, rhythm.pulsesPerBeat, {
      engineMode: rhythm.engineMode,
      drumPattern: rhythm.drumPattern,
      presetId: rhythm.presetId,
    })
    applyRhythm(nextRhythm, formatRhythmText(nextRhythm), presetIdForRhythm(nextRhythm))
  }

  function commitDrumVolume(next) {
    if (disabled) return
    const value = Math.max(0, Math.min(1, parseFloat(next)))
    if (!Number.isFinite(value)) return
    setDrumVolume(value)
    setMetronomeVolumes({ drumVolume: value })
  }

  function resetMetronomeForm() {
    const nextRhythm = normalizeRhythmConfig(rhythmFromTune(tuneForDefaults, props.tunebook))
    const nextRhythmText = formatRhythmText(nextRhythm)
    if (settingsOnly) {
      applyRhythm(nextRhythm, nextRhythmText, presetIdForRhythm(nextRhythm))
      return
    }
    setTempo(DEFAULT_TEMPO)
    applyRhythm(nextRhythm, nextRhythmText, presetIdForRhythm(nextRhythm))
    tapTimesRef.current = []
  }

  function commitTickVolume(next) {
    if (disabled) return
    const value = Math.max(0, Math.min(1, parseFloat(next)))
    if (!Number.isFinite(value)) return
    setTickVolume(value)
    setMetronomeVolumes({ volume: value })
  }

  function commitAccentVolume(next) {
    if (disabled) return
    const value = Math.max(0, Math.min(1, parseFloat(next)))
    if (!Number.isFinite(value)) return
    setAccentVolume(value)
    setMetronomeVolumes({ accentVolume: value })
  }

  function adjustTempo(delta) {
    commitTempo((parseInt(tempo, 10) || DEFAULT_TEMPO) + delta)
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
    commitTempo(Math.round(60000 / average))
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
      + (embedPreview ? ' metronome-panel--embed-preview' : '')
      + (hideTransport ? ' metronome-panel--hide-transport' : '')
      + (disabled ? ' metronome-panel--disabled' : '')}>
      <div className="metronome-panel__card">
        {(!settingsOnly || embedPreview) ? (
        <div className="metronome-panel__toolbar">
          {!hideTransport ? (
          <Button
            variant={isRunning ? 'danger' : 'success'}
            size="lg"
            className="metronome-panel__start-stop"
            disabled={disabled}
            onClick={toggleMetronome}
          >
            {isRunning ? 'Stop' : 'Start'}
          </Button>
          ) : null}

          {!settingsOnly ? (
          <FormFieldHelp
            title="Metronome"
            fields={helpFields}
            className="metronome-panel__help-btn"
            buttonTitle="Metronome help"
          />
          ) : null}

          {!hideTempo && (!settingsOnly || embedPreview) ? (
          <ButtonGroup className="metronome-panel__tempo-group" aria-label="Tempo">
            <Button variant="primary" className="metronome-panel__tempo-step" disabled={disabled} onClick={function() { adjustTempo(-5) }}>-5</Button>
            <Button variant="primary" className="metronome-panel__tempo-nudge" disabled={disabled} onClick={function() { adjustTempo(-1) }}>-</Button>
            <div className="metronome-panel__tempo-value">
              <input
                className="metronome-panel__tempo-input"
                type="number"
                min="20"
                max="300"
                value={tempo}
                disabled={disabled}
                aria-label="Tempo in beats per minute"
                onChange={function(e) {
                  const value = parseInt(e.target.value, 10)
                  if (!Number.isNaN(value)) commitTempo(value)
                }}
              />
              <span className="metronome-panel__tempo-marking">{nearestTempoMarking(tempo)}</span>
            </div>
            <Button variant="primary" className="metronome-panel__tempo-nudge" disabled={disabled} onClick={function() { adjustTempo(1) }}>+</Button>
            <Button variant="primary" className="metronome-panel__tempo-step" disabled={disabled} onClick={function() { adjustTempo(5) }}>+5</Button>
            <Button variant="secondary" className="metronome-panel__tap-tempo" disabled={disabled} onClick={handleTapTempo}>
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
            disabled={disabled}
            onClick={resetMetronomeForm}
          >
            Reset
          </Button>
        </div>
        ) : null}

        {!isDrumMode ? (
        <div className={'metronome-panel__volume-row' + (disabled ? ' metronome-panel__volume-row--disabled' : '')}>
          <label className="metronome-panel__volume-control">
            <span className="metronome-panel__volume-label">Volume</span>
            <input
              type="range"
              className="metronome-panel__volume-slider"
              min="0"
              max="100"
              step="1"
              value={Math.round(tickVolume * 100)}
              disabled={disabled}
              aria-label="Metronome volume"
              onChange={function(e) {
                commitTickVolume(parseInt(e.target.value, 10) / 100)
              }}
            />
            <span className="metronome-panel__volume-value">{Math.round(tickVolume * 100)}</span>
          </label>
          <label className="metronome-panel__volume-control">
            <span className="metronome-panel__volume-label">Accent volume</span>
            <input
              type="range"
              className="metronome-panel__volume-slider"
              min="0"
              max="100"
              step="1"
              value={Math.round(accentVolume * 100)}
              disabled={disabled}
              aria-label="Metronome accent volume"
              onChange={function(e) {
                commitAccentVolume(parseInt(e.target.value, 10) / 100)
              }}
            />
            <span className="metronome-panel__volume-value">{Math.round(accentVolume * 100)}</span>
          </label>
        </div>
        ) : null}

        {!isDrumMode ? (
        <div className={'metronome-panel__rhythm-row' + (disabled ? ' metronome-panel__rhythm-row--disabled' : '')}>
          {!isDrumMode ? (
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
                disabled={disabled}
                aria-label="Quick rhythm time signature"
                aria-expanded={quickRhythmOpen}
                aria-controls="metronome-quick-rhythm-menu"
                autoComplete="off"
                onChange={function(e) { setQuickRhythmText(e.target.value) }}
                onFocus={function() { if (!disabled) setQuickRhythmOpen(true) }}
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
          ) : null}

          {!isDrumMode ? (
          <ButtonGroup className="metronome-panel__control-group" aria-label="Beats per bar">
            <Button variant="light" className="metronome-panel__group-label" disabled>
              Beats per bar
            </Button>
            <Button
              variant="outline-secondary"
              onClick={function() { setBeatsPerBar(rhythm.beatsPerBar - 1) }}
              disabled={disabled || rhythm.beatsPerBar <= 1}
            >
              -
            </Button>
            <Button variant="light" className="metronome-panel__group-value" disabled>
              {rhythm.beatsPerBar}
            </Button>
            <Button
              variant="outline-secondary"
              onClick={function() { setBeatsPerBar(rhythm.beatsPerBar + 1) }}
              disabled={disabled || rhythm.beatsPerBar >= 16}
            >
              +
            </Button>
          </ButtonGroup>
          ) : null}

          {!isDrumMode ? (
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
                  disabled={disabled}
                  onClick={function() { cycleBeatAccent(beatIndex) }}
                  title={accentButtonTitle(level)}
                  aria-label={'Beat ' + (beatIndex + 1) + ': ' + accentButtonTitle(level)}
                >
                  {accentButtonLabel(level)}
                </Button>
              )
            })}
          </ButtonGroup>
          ) : null}

          {!isDrumMode ? (
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
                  disabled={disabled}
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
          ) : null}
        </div>
        ) : null}

        <DrumPatternEditor
          rhythm={rhythm}
          disabled={disabled}
          compact={settingsOnly && !embedPreview}
          activeSlot={activeSlot}
          tempo={tempo}
          audioContext={panelAudioContext}
          recordingEnabled={!settingsOnly || embedPreview}
          drumVolume={drumVolume}
          onDrumVolumeChange={commitDrumVolume}
          onBeatsPerBarChange={setBeatsPerBar}
          onPulsesForBeatChange={setPulsesForBeat}
          onRecordingStart={handleRecordingStart}
          onRecordingStop={handleRecordingStop}
          onEngineModeChange={handleEngineModeChange}
          onRhythmChange={handleDrumRhythmChange}
        />
      </div>
    </div>
  )
}
