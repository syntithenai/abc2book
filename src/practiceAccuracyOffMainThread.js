/**
 * Path B: AudioWorklet capture + Dedicated Worker aubio pitch (v2).
 */

function publicUrl(path) {
  const base = process.env.PUBLIC_URL || ''
  const prefix = base.endsWith('/') ? base.slice(0, -1) : base
  const p = path.startsWith('/') ? path : '/' + path
  return prefix + p
}

export function createOffMainThreadPitchDetector(options) {
  const opts = options || {}
  const bufferSize = opts.bufferSize || 4096
  let audioContext = null
  let workletNode = null
  let worker = null
  let mediaStream = null
  let sourceNode = null
  let ready = false
  let onPitch = opts.onPitch || null
  let onOnset = opts.onOnset || null
  let lastEnergy = 0
  const onsetThreshold = opts.onsetThreshold || 0.02

  function handleWorkerMessage(event) {
    const data = event.data || {}
    if (data.type === 'ready') {
      ready = true
      return
    }
    if (data.type === 'pitch' && onPitch) {
      onPitch({
        frequency: data.frequency,
        time: data.time,
      })
      return
    }
    if (data.type === 'onset' && data.energy > lastEnergy + onsetThreshold && onOnset) {
      onOnset({ time: data.time, energy: data.energy })
    }
    if (data.type === 'onset') {
      lastEnergy = data.energy
    }
  }

  return {
    isReady: function() { return ready },

    start: function(ctx, stream) {
      audioContext = ctx
      mediaStream = stream
      worker = new Worker(publicUrl('/practiceAubioPitchWorker.js'))
      worker.onmessage = handleWorkerMessage
      worker.postMessage({
        type: 'init',
        sampleRate: audioContext.sampleRate,
        bufferSize: bufferSize,
      })
      return audioContext.audioWorklet.addModule(publicUrl('/practice-capture-processor.js'))
        .then(function() {
          sourceNode = audioContext.createMediaStreamSource(mediaStream)
          workletNode = new AudioWorkletNode(audioContext, 'practice-capture-processor')
          workletNode.port.onmessage = function(event) {
            const data = event.data || {}
            if (data.type !== 'buffer' || !worker) return
            worker.postMessage({
              type: 'process',
              samples: data.samples,
              time: data.time,
            })
            worker.postMessage({
              type: 'onset',
              samples: data.samples,
              time: data.time,
            })
          }
          sourceNode.connect(workletNode)
          return true
        })
    },

    stop: function() {
      if (workletNode) {
        workletNode.disconnect()
        workletNode = null
      }
      if (sourceNode) {
        sourceNode.disconnect()
        sourceNode = null
      }
      if (worker) {
        worker.terminate()
        worker = null
      }
      if (mediaStream) {
        mediaStream.getTracks().forEach(function(t) { t.stop() })
        mediaStream = null
      }
      ready = false
    },

    setOnPitch: function(cb) { onPitch = cb },
    setOnOnset: function(cb) { onOnset = cb },
  }
}
