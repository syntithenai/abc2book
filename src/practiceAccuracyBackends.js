/**
 * Browser pitch backends for practice accuracy (v1 main-thread, v2+ off-main-thread).
 */

import { selectV2AudioArchitecture, SPIKE_PATH_WORKER_BRIDGE } from './practiceAccuracySpike/practiceAccuracyAudioSpike'

export const PRACTICE_PITCH_BACKENDS = {
  AUBIO_MAIN: 'aubio-main',
  AUBIO_WORKER: 'aubio-worker',
  PITCHFINDER: 'pitchfinder',
  ESSENTIA: 'essentia',
  CREPE: 'crepe',
}

export const DEFAULT_PRACTICE_ACCURACY_BACKENDS = {
  pitchBackend: 'auto',
  onsetBackend: 'auto',
}

let pitchfinderModule = null
let essentiaModule = null
let crepeModule = null

export function resolvePracticeAccuracyBackend(settings, resolverFeatures) {
  const s = Object.assign({}, DEFAULT_PRACTICE_ACCURACY_BACKENDS, settings || {})
  const hasResolver = resolverFeatures && resolverFeatures.practiceAnalysis === true
  const v2 = selectV2AudioArchitecture({
    [SPIKE_PATH_WORKER_BRIDGE]: { pass: true },
  })

  let pitchBackend = s.pitchBackend
  if (pitchBackend === 'auto') {
    pitchBackend = s.useOffMainThread === true && v2.pitchBackend === 'aubio-worker'
      ? PRACTICE_PITCH_BACKENDS.AUBIO_WORKER
      : PRACTICE_PITCH_BACKENDS.AUBIO_MAIN
  }

  let onsetBackend = s.onsetBackend
  if (onsetBackend === 'auto') {
    onsetBackend = v2.onsetBackend || 'energy-gate'
  }

  return {
    pitchBackend: pitchBackend,
    onsetBackend: onsetBackend,
    resolverAvailable: hasResolver,
    architecture: v2.architecture,
  }
}

export async function loadPitchfinder() {
  if (pitchfinderModule) return pitchfinderModule
  const mod = await import('pitchfinder')
  pitchfinderModule = mod
  return mod
}

export async function createPitchfinderDetector(sampleRate) {
  const mod = await loadPitchfinder()
  const detect = mod.YIN ? mod.YIN({ sampleRate: sampleRate }) : null
  return detect
}

export async function loadEssentiaOptional() {
  if (essentiaModule) return essentiaModule
  // Optional v3 backend — not bundled until essentia.js is added to package.json.
  return null
}

export async function loadCrepeOptional() {
  if (crepeModule) return crepeModule
  // Optional v3 backend — not bundled until @tensorflow/tfjs is added to package.json.
  return null
}

export function getAdvancedBackendLoaders() {
  return {
    essentia: loadEssentiaOptional,
    crepe: loadCrepeOptional,
    pitchfinder: loadPitchfinder,
  }
}
