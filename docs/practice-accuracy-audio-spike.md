# Practice accuracy audio spike — decision record

Date: 2026-07-10

## Question

Can the existing `aubio.js` bundle run off the main thread for practice warmup pitch/timing (v2)?

## Bundle analysis

- Source: [qiuxiang/aubiojs](https://github.com/qiuxiang/aubiojs), Emscripten `-sMODULARIZE=1 -sSINGLE_FILE=1`
- Emscripten env detection: `window` → main thread; `importScripts` → Dedicated Worker; neither → shell (broken in AudioWorklet)

## Spike results

| Path | Result | Notes |
|------|--------|-------|
| **A — Direct AudioWorklet + aubio.js** | **FAIL** | `AudioWorkletGlobalScope` has no `window` or `importScripts`; module init throws or hangs |
| **B — AudioWorklet capture → Dedicated Worker + importScripts(aubio.js)** | **PASS** | Worker loads aubio via Emscripten worker path; pitch detection off main thread |
| **C — Emscripten AUDIO_WORKLET rebuild** | **Not pursued** | Path B sufficient; rebuild only if latency unacceptable |

## v2 architecture decision

**Use Path B:** `public/practice-capture-processor.js` (AudioWorklet) accumulates samples → `practiceAubioPitchWorker.js` (Dedicated Worker) runs `aubio.Pitch`.

Fallback if Worker init fails in a browser: main-thread aubio (v1 path) or lazy-loaded pitchfinder in AudioWorklet.

## Implementation

- [`src/practiceAccuracyOffMainThread.js`](../src/practiceAccuracyOffMainThread.js) — production Path B client
- [`public/practice-capture-processor.js`](../public/practice-capture-processor.js) — capture worklet
- [`public/practiceAubioPitchWorker.js`](../public/practiceAubioPitchWorker.js) — aubio pitch worker
- [`src/practiceAccuracySpike/practiceAccuracyAudioSpike.test.js`](../src/practiceAccuracySpike/practiceAccuracyAudioSpike.test.js) — env detection unit tests
