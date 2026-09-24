import abcjs from 'abcjs'
import {
  programOffsetsForPlaybackPlan,
  abcjsPlaybackSynthOptions,
} from './abcSynthProgramOffsets'
import { getPlaybackSoundFontPlan, getSoundFontVolumeMultiplier } from './soundFontConfig'
import { remapFlattenedMidiPrograms } from './localSoundfontInstrumentMap'
import { resolveFillPlaybackOptions } from './playbackFillSettings'
import { buildPlaybackSequence } from './playbackFillPattern'
import { resolveSequencePathMeasureTiming } from './playbackStateLogic'
import { clearAbcjsSoundsCache } from './abcjsSoundsCache'
import { buildPlaybackTimingMap } from './playbackTimingMap'
import { buildSoundingWrittenMap } from './voltaRepeatExpand'
import { barWholeNotesFromMeter } from './playbackFillPattern'

const ORIGINAL_SOUNDFONT_CDN = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/'

function renderAbcVisual(abc) {
  if (typeof document === 'undefined') return null
  const host = document.createElement('div')
  host.setAttribute('aria-hidden', 'true')
  host.style.cssText = 'position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0);white-space:nowrap;border:0;padding:0;margin:-1px;'
  document.body.appendChild(host)
  try {
    const visualObjs = abcjs.renderAbc(host, abc, {
      add_classes: false,
      responsive: undefined,
    })
    return visualObjs && visualObjs[0] ? visualObjs[0] : null
  } finally {
    if (host.parentNode) host.parentNode.removeChild(host)
  }
}

async function primeAbcToAudioBuffer(abc, audioContext, soundFontPlan, synthOptions) {
  const opts = synthOptions || {}
  const visualObj = renderAbcVisual(abc)
  if (!visualObj) {
    throw new Error('Could not render notation for audio export')
  }

  const msPerMeasure = visualObj.millisecondsPerMeasure()
  if (!(msPerMeasure > 0)) {
    throw new Error('Invalid notation timing for audio export')
  }

  const fillPlayback = resolveFillPlaybackOptions(opts.tune, opts.tunebook)
  const synth = new abcjs.synth.CreateSynth()
  const chordsOff = opts.chordsOff === true ? true : fillPlayback.chordsOff
  // Match live useAbcSynth: remapped MusyngKite must not use original-bank
  // programOffsets (per-instrument shifts desync boom-chick fills from melody).
  const programOffsets = programOffsetsForPlaybackPlan(soundFontPlan.url, soundFontPlan)
  const initOptions = {
    audioContext: audioContext,
    millisecondsPerMeasure: msPerMeasure,
    options: abcjsPlaybackSynthOptions({
      soundFontUrl: soundFontPlan.url,
      soundFontVolumeMultiplier: getSoundFontVolumeMultiplier(),
      chordsOff: chordsOff,
      programOffsets: programOffsets,
    }),
  }
  // Always use the sequence path like web playback so fills/chords match.
  const useSequencePath = true
  let audibleMsPerMeasure = msPerMeasure
  const soundingWrittenMap = buildSoundingWrittenMap(visualObj)
  if (useSequencePath) {
    const flattened = buildPlaybackSequence(visualObj, {
      fillOptions: fillPlayback,
      tune: opts.tune,
      tunebook: opts.tunebook,
      millisecondsPerMeasure: msPerMeasure,
      transpose: visualObj.visualTranspose,
    })
    if (soundFontPlan.remap) {
      remapFlattenedMidiPrograms(flattened)
    }
    initOptions.sequence = flattened
    const measureTiming = resolveSequencePathMeasureTiming(
      initOptions.millisecondsPerMeasure,
      typeof visualObj.getMeterFraction === 'function' ? visualObj.getMeterFraction() : null
    )
    audibleMsPerMeasure = measureTiming.audibleMsPerMeasure || msPerMeasure
    initOptions.millisecondsPerMeasure = measureTiming.createSynthMsPerMeasure
    if (soundingWrittenMap && audibleMsPerMeasure > 0) {
      const barW = barWholeNotesFromMeter(
        typeof visualObj.getMeterFraction === 'function'
          ? visualObj.getMeterFraction()
          : null
      )
      if (barW > 0 && soundingWrittenMap.soundingWhole > 0) {
        soundingWrittenMap.expectedDurationSec =
          soundingWrittenMap.soundingWhole
          * (audibleMsPerMeasure / 1000) / barW
      }
    }
  } else {
    initOptions.visualObj = visualObj
  }
  if (visualObj.visualTranspose > 0 || visualObj.visualTranspose < 0) {
    initOptions.options.midiTranspose = parseInt(visualObj.visualTranspose, 10)
  }

  await synth.init(initOptions)
  const primeResult = await synth.prime()
  const buffer = typeof synth.getAudioBuffer === 'function'
    ? synth.getAudioBuffer()
    : (synth.audioBuffers && synth.audioBuffers[0] ? synth.audioBuffers[0] : null)

  try {
    synth.stop()
  } catch (err) { /* ignore */ }

  if (!buffer || !(buffer.duration > 0)) {
    const status = primeResult && primeResult.status ? String(primeResult.status) : 'unknown'
    throw new Error('Could not render notation audio (status=' + status + ')')
  }
  if (soundingWrittenMap && buffer.duration > 0) {
    soundingWrittenMap.expectedDurationSec = buffer.duration
  }
  const expectedDurationSec = estimateVisualAudioDurationSec(visualObj)
  if (expectedDurationSec > 3 && buffer.duration < expectedDurationSec * 0.85) {
    throw new Error(
      'Rendered notation audio is too short ('
      + buffer.duration.toFixed(2) + 's vs expected '
      + expectedDurationSec.toFixed(2) + 's)'
    )
  }
  return {
    buffer: buffer,
    soundingWrittenMap: soundingWrittenMap,
    audibleMsPerMeasure: audibleMsPerMeasure,
  }
}

function estimateVisualAudioDurationSec(visualObj) {
  if (!visualObj) return 0
  const map = buildPlaybackTimingMap(visualObj)
  if (map && map.totalMusicSeconds > 0) {
    return map.totalMusicSeconds
  }
  if (typeof visualObj.getTotalTime === 'function') {
    const ms = parseFloat(visualObj.getTotalTime())
    if (ms > 0) return ms / 1000
  }
  return 0
}

/**
 * Expected audible duration (seconds) for ABC notation at written tempo.
 * Used to reject truncated native prerenders and stale cache files.
 */
export function estimateAbcAudioDurationSec(abc, options) {
  const opts = options || {}
  if (!abc || !String(abc).trim()) return 0
  const visualObj = renderAbcVisual(abc)
  if (!visualObj) return 0
  return estimateVisualAudioDurationSec(visualObj)
}

function soundFontCandidates(tune) {
  const plan = getPlaybackSoundFontPlan({ tune: tune })
  const list = [{ url: plan.url, plan: plan }]
  if (plan.bank !== 'online') {
    list.push({
      url: 'https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/',
      plan: { url: 'https://paulrosen.github.io/midi-js-soundfonts/MusyngKite/', remap: false, bank: 'online' },
    })
  }
  list.push({
    url: ORIGINAL_SOUNDFONT_CDN,
    plan: { url: ORIGINAL_SOUNDFONT_CDN, remap: true, bank: 'selection' },
  })
  return list
}

export async function renderAbcToAudioBuffer(abc, options) {
  const opts = options || {}
  if (!abc || !String(abc).trim()) {
    throw new Error('No notation available for audio export')
  }
  if (!abcjs.synth.supportsAudio()) {
    throw new Error('This browser cannot render notation audio')
  }

  const AudioContextClass = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null
  if (!AudioContextClass) {
    throw new Error('AudioContext is not available')
  }

  const audioContext = new AudioContextClass()
  const candidates = soundFontCandidates(opts.tune)
  let lastError = null
  const renderStartedAt = Date.now()
  try {
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        if (i > 0) clearAbcjsSoundsCache()
        const primed = await primeAbcToAudioBuffer(
          abc,
          audioContext,
          candidates[i].plan,
          opts
        )
        const buffer = primed && primed.buffer ? primed.buffer : primed
        if (opts.includeMeta) {
          return {
            buffer: buffer,
            soundingWrittenMap: primed.soundingWrittenMap || null,
            audibleMsPerMeasure: primed.audibleMsPerMeasure || 0,
          }
        }
        return buffer
      } catch (err) {
        lastError = err
      }
    }
    throw lastError || new Error('Could not render notation audio')
  } finally {
    if (audioContext.state !== 'closed' && typeof audioContext.close === 'function') {
      try {
        await audioContext.close()
      } catch (err) { /* ignore */ }
    }
  }
}
