import {
  classifyAubioRuntime,
  expectedDirectWorkletOutcome,
  expectedWorkerBridgeOutcome,
  selectV2AudioArchitecture,
  SPIKE_PATH_WORKER_BRIDGE,
} from './practiceAccuracyAudioSpike'

describe('practiceAccuracyAudioSpike', function() {
  test('classifies main thread env', function() {
    expect(classifyAubioRuntime({ window: true, importScripts: false })).toBe('main-thread')
  })

  test('classifies dedicated worker env', function() {
    expect(classifyAubioRuntime({ window: false, importScripts: true })).toBe('dedicated-worker')
  })

  test('classifies AudioWorklet as unsupported for raw aubio.js', function() {
    expect(classifyAubioRuntime({ window: false, importScripts: false })).toBe('unsupported')
    const outcome = expectedDirectWorkletOutcome({ window: false, importScripts: false })
    expect(outcome.pass).toBe(false)
  })

  test('worker bridge expected to pass in dedicated worker', function() {
    const outcome = expectedWorkerBridgeOutcome({ window: false, importScripts: true })
    expect(outcome.pass).toBe(true)
  })

  test('selectV2AudioArchitecture prefers worker bridge when spike passes', function() {
    const arch = selectV2AudioArchitecture({
      [SPIKE_PATH_WORKER_BRIDGE]: { pass: true },
    })
    expect(arch.architecture).toBe('worklet-worker-aubio')
    expect(arch.pitchBackend).toBe('aubio-worker')
  })

  test('selectV2AudioArchitecture falls back to pitchfinder', function() {
    const arch = selectV2AudioArchitecture({
      [SPIKE_PATH_WORKER_BRIDGE]: { pass: false },
    })
    expect(arch.architecture).toBe('worklet-pitchfinder')
    expect(arch.pitchBackend).toBe('pitchfinder')
  })
})
