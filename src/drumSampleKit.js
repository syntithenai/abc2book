const DRUM_SAMPLE_FILES = {
  kick: 'kick.wav',
  snare: 'snare.wav',
  'hat-closed': 'hat-closed.wav',
  'hat-open': 'hat-open.wav',
  rim: 'rim.wav',
  tom: 'tom.wav',
}

let bufferCache = null
let loadPromise = null

function drumBasePath() {
  const base = typeof process !== 'undefined' && process.env && process.env.PUBLIC_URL
    ? process.env.PUBLIC_URL
    : ''
  return (base || '') + '/drums/'
}

export function isDrumKitLoaded() {
  return !!bufferCache
}

export function loadDrumKit(audioContext) {
  if (!audioContext) return Promise.reject(new Error('AudioContext required'))
  if (bufferCache) return Promise.resolve(bufferCache)
  if (loadPromise) return loadPromise

  const entries = Object.keys(DRUM_SAMPLE_FILES)
  loadPromise = Promise.all(entries.map(function(sampleId) {
    const url = drumBasePath() + DRUM_SAMPLE_FILES[sampleId]
    return fetch(url)
      .then(function(response) {
        if (!response.ok) throw new Error('Failed to load drum sample: ' + sampleId)
        return response.arrayBuffer()
      })
      .then(function(arrayBuffer) {
        return audioContext.decodeAudioData(arrayBuffer)
      })
      .then(function(buffer) {
        return { sampleId: sampleId, buffer: buffer }
      })
  })).then(function(results) {
    const cache = {}
    results.forEach(function(item) {
      cache[item.sampleId] = item.buffer
    })
    bufferCache = cache
    return cache
  }).catch(function(error) {
    loadPromise = null
    throw error
  })

  return loadPromise
}

export function primeDrumKit(audioContext) {
  return loadDrumKit(audioContext)
}

export function playDrumHit(audioContext, time, sampleId, velocity, pan) {
  if (!audioContext || !bufferCache) return false
  const buffer = bufferCache[sampleId]
  if (!buffer) return false

  const gainValue = Math.max(0, Math.min(1, parseFloat(velocity) || 0))
  if (!(gainValue > 0.0001)) return false

  const source = audioContext.createBufferSource()
  source.buffer = buffer

  const gain = audioContext.createGain()
  gain.gain.setValueAtTime(gainValue, time)

  const panner = audioContext.createStereoPanner
    ? audioContext.createStereoPanner()
    : null
  if (panner) {
    panner.pan.setValueAtTime(Math.max(-1, Math.min(1, parseFloat(pan) || 0)), time)
    source.connect(gain)
    gain.connect(panner)
    panner.connect(audioContext.destination)
  } else {
    source.connect(gain)
    gain.connect(audioContext.destination)
  }

  source.start(time)
  return true
}

export function resetDrumKitCache() {
  bufferCache = null
  loadPromise = null
}
