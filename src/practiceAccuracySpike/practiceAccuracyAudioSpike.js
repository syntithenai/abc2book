/**
 * Spike helpers: document AudioWorklet vs Worker aubio paths.
 */

export const SPIKE_PATH_DIRECT_WORKLET = 'direct-worklet'
export const SPIKE_PATH_WORKER_BRIDGE = 'worker-bridge'

/** Emscripten aubio.js env: needs window (main) or importScripts (worker). */
export function classifyAubioRuntime(env) {
  const hasWindow = env && env.window === true
  const hasImportScripts = env && env.importScripts === true
  if (hasWindow) return 'main-thread'
  if (hasImportScripts) return 'dedicated-worker'
  return 'unsupported'
}

export function expectedDirectWorkletOutcome(env) {
  return classifyAubioRuntime(env) === 'unsupported'
    ? { path: SPIKE_PATH_DIRECT_WORKLET, pass: false, reason: 'AudioWorkletGlobalScope lacks window and importScripts' }
    : { path: SPIKE_PATH_DIRECT_WORKLET, pass: true, reason: 'unexpected compatible env' }
}

export function expectedWorkerBridgeOutcome(env) {
  return classifyAubioRuntime(env) === 'dedicated-worker'
    ? { path: SPIKE_PATH_WORKER_BRIDGE, pass: true, reason: 'Emscripten worker path via importScripts' }
    : { path: SPIKE_PATH_WORKER_BRIDGE, pass: false, reason: 'importScripts not available' }
}

export function selectV2AudioArchitecture(spikeResults) {
  const worker = spikeResults && spikeResults[SPIKE_PATH_WORKER_BRIDGE]
  if (worker && worker.pass) {
    return {
      architecture: 'worklet-worker-aubio',
      pitchBackend: 'aubio-worker',
      onsetBackend: 'energy-gate',
    }
  }
  return {
    architecture: 'worklet-pitchfinder',
    pitchBackend: 'pitchfinder',
    onsetBackend: 'spectral-flux',
  }
}
