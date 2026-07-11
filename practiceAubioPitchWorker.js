/* Dedicated Worker: aubio pitch (path B). Loads aubio via importScripts. */
/* global aubio */

var pitchDetector = null
var sampleRate = 44100
var bufferSize = 4096

function getAubioBaseUrl() {
  var href = self.location && self.location.href ? self.location.href : ''
  if (!href) return './'
  return href.replace(/[^/]+$/, '')
}

function initPitchDetector() {
  if (typeof aubio !== 'function') {
  importScripts(getAubioBaseUrl() + 'aubio.js')
  }
  return aubio().then(function(lib) {
    pitchDetector = new lib.Pitch('default', bufferSize, 1, sampleRate)
    return true
  })
}

self.onmessage = function(event) {
  var data = event.data || {}
  if (data.type === 'init') {
    sampleRate = data.sampleRate || 44100
    bufferSize = data.bufferSize || 4096
    initPitchDetector()
      .then(function() {
        self.postMessage({ type: 'ready' })
      })
      .catch(function(err) {
        self.postMessage({ type: 'error', message: String(err && err.message ? err.message : err) })
      })
    return
  }
  if (data.type === 'process' && pitchDetector && data.samples) {
    try {
      var freq = pitchDetector.do(data.samples)
      self.postMessage({
        type: 'pitch',
        frequency: freq || 0,
        time: data.time,
      })
    } catch (e) {
      self.postMessage({ type: 'error', message: String(e) })
    }
  }
  if (data.type === 'onset' && pitchDetector && data.samples) {
    self.postMessage({
      type: 'onset',
      energy: computeEnergy(data.samples),
      time: data.time,
    })
  }
}

function computeEnergy(samples) {
  var sum = 0
  for (var i = 0; i < samples.length; i += 1) {
    sum += samples[i] * samples[i]
  }
  return Math.sqrt(sum / samples.length)
}
