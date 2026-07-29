export const DEFAULT_SPEECH_THRESHOLD = 0.02
export const DEFAULT_SILENCE_MS = 1200
export const DEFAULT_MIN_RECORD_MS = 500

export function computeRmsFromTimeDomain(data) {
  if (!data || !data.length) return 0
  let sum = 0
  for (let i = 0; i < data.length; i += 1) {
    const v = (data[i] - 128) / 128
    sum += v * v
  }
  return Math.sqrt(sum / data.length)
}

/**
 * Poll analyser RMS and call onSilence after sustained silence following speech.
 * Returns { start, stop }.
 */
export function createSilenceMonitor(options) {
  const analyser = options.analyser
  const onSilence = options.onSilence
  const speechThreshold = options.speechThreshold != null
    ? options.speechThreshold
    : DEFAULT_SPEECH_THRESHOLD
  const silenceMs = options.silenceMs != null ? options.silenceMs : DEFAULT_SILENCE_MS
  const minRecordMs = options.minRecordMs != null ? options.minRecordMs : DEFAULT_MIN_RECORD_MS
  const now = typeof options.now === 'function' ? options.now : function() { return Date.now() }

  let frame = 0
  let running = false
  let startedAt = 0
  let speechDetected = false
  let silenceStartedAt = 0
  const data = analyser ? new Uint8Array(analyser.frequencyBinCount) : null

  function tick() {
    if (!running || !analyser || !data) return
    frame = requestAnimationFrame(tick)
    analyser.getByteTimeDomainData(data)
    const rms = computeRmsFromTimeDomain(data)
    const currentTime = now()

    if (rms >= speechThreshold) {
      speechDetected = true
      silenceStartedAt = 0
      return
    }

    if (!speechDetected) return
    if (currentTime - startedAt < minRecordMs) return

    if (!silenceStartedAt) {
      silenceStartedAt = currentTime
      return
    }

    if (currentTime - silenceStartedAt >= silenceMs) {
      running = false
      cancelAnimationFrame(frame)
      if (typeof onSilence === 'function') onSilence()
    }
  }

  return {
    start: function() {
      if (!analyser || !data) return
      running = true
      startedAt = now()
      speechDetected = false
      silenceStartedAt = 0
      tick()
    },
    stop: function() {
      running = false
      if (frame) cancelAnimationFrame(frame)
      frame = 0
      speechDetected = false
      silenceStartedAt = 0
    },
  }
}
