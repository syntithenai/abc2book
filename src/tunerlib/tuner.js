//import aubio from './aubio'


import { rmsFromChannelData } from './tunerDisplayUtils.js'

var aubio = window.aubio

const Tuner = function(a4) {
  this.middleA = a4 || 440
  this.semitone = 69
  this.bufferSize = 4096
  this.noteStrings = [
    'C',
    'C♯',
    'D',
    'D♯',
    'E',
    'F',
    'F♯',
    'G',
    'G♯',
    'A',
    'A♯',
    'B'
  ]

  this.initGetUserMedia()
}

Tuner.prototype.initGetUserMedia = function() {
  window.AudioContext = window.AudioContext || window.webkitAudioContext
  if (!window.AudioContext) {
    return alert('AudioContext not supported')
  }

  // Older browsers might not implement mediaDevices at all, so we set an empty object first
  if (navigator.mediaDevices === undefined) {
    navigator.mediaDevices = {}
  }

  // Some browsers partially implement mediaDevices. We can't just assign an object
  // with getUserMedia as it would overwrite existing properties.
  // Here, we will just add the getUserMedia property if it's missing.
  if (navigator.mediaDevices.getUserMedia === undefined) {
    navigator.mediaDevices.getUserMedia = function(constraints) {
      // First get ahold of the legacy getUserMedia, if present
      const getUserMedia =
        navigator.webkitGetUserMedia || navigator.mozGetUserMedia

      // Some browsers just don't implement it - return a rejected promise with an error
      // to keep a consistent interface
      if (!getUserMedia) {
        alert('getUserMedia is not implemented in this browser')
      }

      // Otherwise, wrap the call to the old navigator.getUserMedia with a Promise
      return new Promise(function(resolve, reject) {
        getUserMedia.call(navigator, constraints, resolve, reject)
      })
    }
  }
}

Tuner.prototype.startRecord = function () {
  const self = this
  if (!self.pitchDetector || !self.audioContext) return
  self.stopInput()
  navigator.mediaDevices
    .getUserMedia(self.getAudioConstraints())
    .then(function(stream) {
      self.mediaStream = stream
      self.audioContext.createMediaStreamSource(stream).connect(self.analyser)
      self.analyser.connect(self.scriptProcessor)
      self.scriptProcessor.connect(self.audioContext.destination)
      self.scriptProcessor.onaudioprocess = function(event) {
        const channelData = event.inputBuffer.getChannelData(0)
        const frequency = self.pitchDetector.do(channelData)
        if (!frequency) return
        const note = self.getNote(frequency)
        const payload = {
          name: self.noteStrings[note % 12],
          value: note,
          cents: self.getCents(frequency, note),
          octave: parseInt(note / 12) - 1,
          frequency: frequency,
          inputLevel: rmsFromChannelData(channelData)
        }
        if (self.onPitchSample) self.onPitchSample(payload)
        if (self.onNoteDetected) self.onNoteDetected(payload)
      }
    })
    .catch(function(error) {
      alert(error.name + ': ' + error.message)
    })
}

Tuner.prototype.init = function() {
  if (this.audioContext && this.audioContext.state !== 'closed') {
    if (this.pitchDetector) {
      this.startRecord()
      if (this.audioContext.state === 'suspended') {
        this.audioContext.resume().catch(function() {})
      }
      return
    }
    this.stopInput()
  }

  this.audioContext = new window.AudioContext()
  this.analyser = this.audioContext.createAnalyser()
  this.scriptProcessor = this.audioContext.createScriptProcessor(
    this.bufferSize,
    1,
    1
  )

  const self = this
  aubio().then(function(aubio) {
    self.pitchDetector = new aubio.Pitch(
      'default',
      self.bufferSize,
      1,
      self.audioContext.sampleRate
    )
    self.startRecord()
    if (self.audioContext.state === 'suspended') {
      self.audioContext.resume().catch(function() {})
    }
  }).catch(function(e) {
    console.log('=aubio err',e)
  })
}

/**
 * get musical note from frequency
 *
 * @param {number} frequency
 * @returns {number}
 */
Tuner.prototype.getNote = function(frequency) {
  const note = 12 * (Math.log(frequency / this.middleA) / Math.log(2))
  return Math.round(note) + this.semitone
}

/**
 * get the musical note's standard frequency
 *
 * @param note
 * @returns {number}
 */
Tuner.prototype.getStandardFrequency = function(note) {
  return this.middleA * Math.pow(2, (note - this.semitone) / 12)
}

/**
 * get cents difference between given frequency and musical note's standard frequency
 *
 * @param {number} frequency
 * @param {number} note
 * @returns {number}
 */
Tuner.prototype.getCents = function(frequency, note) {
  return (1200 * Math.log(frequency / this.getStandardFrequency(note))) / Math.log(2)
}

Tuner.prototype.setInputDevice = function(deviceId) {
  this.inputDeviceId = deviceId || null
  if (this.pitchDetector && this.audioContext) {
    this.startRecord()
  }
}

Tuner.prototype.stopInput = function() {
  if (this.scriptProcessor) {
    this.scriptProcessor.disconnect()
    this.scriptProcessor.onaudioprocess = null
  }
  if (this.mediaStream) {
    this.mediaStream.getTracks().forEach(function(track) { track.stop() })
    this.mediaStream = null
  }
}

Tuner.prototype.getAudioConstraints = function() {
  if (this.inputDeviceId) {
    return { audio: { deviceId: { exact: this.inputDeviceId } } }
  }
  return { audio: true }
}

/**
 * play the musical note
 *
 * @param {number} frequency
 */
Tuner.prototype.play = function(frequency) {
  if (!this.oscillator) {
    this.oscillator = this.audioContext.createOscillator()
    this.oscillator.connect(this.audioContext.destination)
    this.oscillator.start()
  }
  this.oscillator.frequency.value = frequency
}

Tuner.prototype.stop = function() {
  if (this.oscillator) this.oscillator.stop()
  this.oscillator = null
}
export default Tuner
