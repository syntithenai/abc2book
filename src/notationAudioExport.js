import abcjs from 'abcjs'
import { getSoundFontUrl, getSoundFontVolumeMultiplier, isResolverMusyngKiteReady } from './soundFontConfig'
import { remapFlattenedMidiPrograms } from './localSoundfontInstrumentMap'

const ORIGINAL_SOUNDFONT_CDN = 'https://paulrosen.github.io/midi-js-soundfonts/abcjs/'

function clearAbcjsSoundsCache() {
  try {
    // eslint-disable-next-line global-require, import/no-extraneous-dependencies
    const cache = require('abcjs/src/synth/sounds-cache')
    if (!cache || typeof cache !== 'object') return
    Object.keys(cache).forEach(function(instrument) {
      delete cache[instrument]
    })
  } catch (err) { /* ignore */ }
}

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

async function primeAbcToAudioBuffer(abc, audioContext, soundFontUrl, remapLocal, synthOptions) {
  const opts = synthOptions || {}
  const visualObj = renderAbcVisual(abc)
  if (!visualObj) {
    throw new Error('Could not render notation for audio export')
  }

  const msPerMeasure = visualObj.millisecondsPerMeasure()
  if (!(msPerMeasure > 0)) {
    throw new Error('Invalid notation timing for audio export')
  }

  const synth = new abcjs.synth.CreateSynth()
  const initOptions = {
    audioContext: audioContext,
    millisecondsPerMeasure: msPerMeasure,
    options: {
      soundFontUrl: soundFontUrl,
      soundFontVolumeMultiplier: getSoundFontVolumeMultiplier(),
      chordsOff: opts.chordsOff === true,
    },
  }
  if (remapLocal) {
    const flattened = visualObj.setUpAudio({})
    remapFlattenedMidiPrograms(flattened)
    initOptions.sequence = flattened
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
  return buffer
}

function soundFontCandidates() {
  const musyngReady = isResolverMusyngKiteReady()
  const configured = getSoundFontUrl({ musyngKiteReady: musyngReady })
  const list = []
  if (configured) {
    list.push({ url: configured, remapLocal: !musyngReady })
  }
  list.push({ url: ORIGINAL_SOUNDFONT_CDN, remapLocal: true })
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
  const candidates = soundFontCandidates()
  let lastError = null
  try {
    for (let i = 0; i < candidates.length; i += 1) {
      try {
        if (i > 0) clearAbcjsSoundsCache()
        return await primeAbcToAudioBuffer(
          abc,
          audioContext,
          candidates[i].url,
          candidates[i].remapLocal,
          opts
        )
      } catch (err) {
        lastError = err
      }
    }
    throw lastError || new Error('Could not render notation audio')
  } finally {
    if (audioContext.state !== 'closed' && typeof audioContext.close === 'function') {
      audioContext.close().catch(function() {})
    }
  }
}
