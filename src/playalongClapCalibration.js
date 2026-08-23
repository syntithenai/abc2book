/**
 * Interactive playalong latency calibration.
 *
 * Plays short clicks and measures when the mic hears an onset (speaker loopback
 * or a human clap). Median click→onset delay estimates output-path lag for
 * aligning playalong pitch graphs.
 */

export const PLAYALONG_CALIBRATION_CLICK_COUNT = 5
export const PLAYALONG_CALIBRATION_GAP_MS = 700
export const PLAYALONG_CALIBRATION_LISTEN_MS = 450
export const PLAYALONG_CALIBRATION_MIN_MS = 20
export const PLAYALONG_CALIBRATION_MAX_MS = 450

function nowMs() {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function medianOf(values) {
  const list = (values || []).slice().sort(function(a, b) { return a - b })
  if (!list.length) return null
  const mid = Math.floor(list.length / 2)
  if (list.length % 2) return list[mid]
  return (list[mid - 1] + list[mid]) / 2
}

export function estimatePlayalongCalibrationLatencySeconds(sampleDelaysMs) {
  const usable = (sampleDelaysMs || []).filter(function(ms) {
    return Number.isFinite(ms)
      && ms >= PLAYALONG_CALIBRATION_MIN_MS
      && ms <= PLAYALONG_CALIBRATION_MAX_MS
  })
  const medianMs = medianOf(usable)
  if (medianMs == null) return null
  return medianMs / 1000
}

function playClick(ctx, when, gainValue) {
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.type = 'square'
  osc.frequency.value = 1000
  const g = Number.isFinite(gainValue) ? gainValue : 0.35
  gain.gain.setValueAtTime(0.0001, when)
  gain.gain.exponentialRampToValueAtTime(g, when + 0.002)
  gain.gain.exponentialRampToValueAtTime(0.0001, when + 0.04)
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.start(when)
  osc.stop(when + 0.05)
}

function detectOnsetDelayMs(analyser, clickAtMs, listenMs, rmsFloor) {
  const buf = new Float32Array(analyser.fftSize)
  const endAt = clickAtMs + listenMs
  let peak = 0
  let peakAt = null
  return new Promise(function(resolve) {
    function poll() {
      const t = nowMs()
      if (t > endAt) {
        resolve(peakAt != null && peak >= rmsFloor ? peakAt - clickAtMs : null)
        return
      }
      try {
        analyser.getFloatTimeDomainData(buf)
      } catch (e) {
        resolve(null)
        return
      }
      let sum = 0
      for (let i = 0; i < buf.length; i += 1) sum += buf[i] * buf[i]
      const rms = Math.sqrt(sum / buf.length)
      if (rms >= rmsFloor && rms > peak && t >= clickAtMs + PLAYALONG_CALIBRATION_MIN_MS) {
        peak = rms
        if (peakAt == null) peakAt = t
      }
      if (typeof requestAnimationFrame === 'function') requestAnimationFrame(poll)
      else setTimeout(poll, 8)
    }
    poll()
  })
}

/**
 * @param {object} options
 * @param {MediaStream} [options.stream] - optional existing mic stream
 * @param {function} [options.onProgress] - ({ index, total, delayMs })
 * @param {AbortSignal} [options.signal]
 * @returns {Promise<{ latencySeconds: number|null, samplesMs: number[], method: string }>}
 */
export async function runPlayalongLatencyCalibration(options) {
  const opts = options || {}
  const total = opts.clickCount > 0 ? opts.clickCount : PLAYALONG_CALIBRATION_CLICK_COUNT
  const gapMs = opts.gapMs > 0 ? opts.gapMs : PLAYALONG_CALIBRATION_GAP_MS
  const listenMs = opts.listenMs > 0 ? opts.listenMs : PLAYALONG_CALIBRATION_LISTEN_MS
  const rmsFloor = opts.rmsFloor > 0 ? opts.rmsFloor : 0.02

  const AudioCtx = typeof window !== 'undefined'
    ? (window.AudioContext || window.webkitAudioContext)
    : null
  if (!AudioCtx) {
    return { latencySeconds: null, samplesMs: [], method: 'unavailable', error: 'No AudioContext' }
  }

  let ownStream = false
  let stream = opts.stream || null
  if (!stream) {
    if (!navigator.mediaDevices || typeof navigator.mediaDevices.getUserMedia !== 'function') {
      return { latencySeconds: null, samplesMs: [], method: 'unavailable', error: 'No microphone access' }
    }
    stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: false,
        noiseSuppression: false,
        autoGainControl: false,
      },
    })
    ownStream = true
  }

  const ctx = new AudioCtx()
  if (ctx.state === 'suspended' && typeof ctx.resume === 'function') {
    try { await ctx.resume() } catch (e) {}
  }

  let source = null
  let analyser = null
  const samplesMs = []
  try {
    source = ctx.createMediaStreamSource(stream)
    analyser = ctx.createAnalyser()
    analyser.fftSize = 1024
    source.connect(analyser)

    // Warm-up silence so the first click is not swallowed by device settle.
    await new Promise(function(r) { setTimeout(r, 200) })

    for (let i = 0; i < total; i += 1) {
      if (opts.signal && opts.signal.aborted) break
      const when = ctx.currentTime + 0.05
      const clickAtMs = nowMs() + 50
      playClick(ctx, when, opts.clickGain)
      const delayMs = await detectOnsetDelayMs(analyser, clickAtMs, listenMs, rmsFloor)
      if (Number.isFinite(delayMs)) samplesMs.push(delayMs)
      if (typeof opts.onProgress === 'function') {
        opts.onProgress({ index: i + 1, total: total, delayMs: delayMs })
      }
      if (i < total - 1) {
        await new Promise(function(r) { setTimeout(r, gapMs) })
      }
    }
  } finally {
    try { if (source) source.disconnect() } catch (e) {}
    try { if (analyser) analyser.disconnect() } catch (e) {}
    try { await ctx.close() } catch (e) {}
    if (ownStream && stream && stream.getTracks) {
      stream.getTracks().forEach(function(track) {
        try { track.stop() } catch (e) {}
      })
    }
  }

  const latencySeconds = estimatePlayalongCalibrationLatencySeconds(samplesMs)
  return {
    latencySeconds: latencySeconds,
    samplesMs: samplesMs,
    method: samplesMs.length ? 'mic-onset' : 'no-onset',
    error: latencySeconds == null
      ? 'Could not hear clicks or claps clearly. Use speakers near the mic, or clap right after each click.'
      : null,
  }
}
