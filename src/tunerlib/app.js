import Tuner from './tuner.js'
import Notes from './notes.js'
import { rmsFromTimeDomain } from './tunerDisplayUtils.js'

const Application = function(notes, options) {
  const opts = options || {}
  this.a4 = opts.a4 != null ? opts.a4 : 440
  this.onNoteDetectedCallback = opts.onNoteDetected || null
  this.onPitchSampleCallback = opts.onPitchSample || null
  this.onAudioLevelCallback = opts.onAudioLevel || null
  this.tuner = new Tuner(this.a4)
  this.notes = new Notes(notes, this.tuner)
  this.isRunning = true
  this.lastNote = null
  this.update({ name: 'A', frequency: this.a4, octave: 4, value: 69, cents: 0 })
}

Application.prototype.setA4 = function(a4) {
  this.a4 = a4
  this.tuner.middleA = a4
}

Application.prototype.init = function() {
  this.tuner.init()
}

Application.prototype.stop = function() {
  if (this.tuner) {
    this.tuner.stopInput()
    this.tuner.stop()
  }
  this.isRunning = false
}

Application.prototype.start = function() {
  const self = this
  self.isRunning = true

  this.tuner.onPitchSample = function(note) {
    if (self.onPitchSampleCallback) {
      self.onPitchSampleCallback(note)
    }
  }

  this.tuner.onNoteDetected = function(note) {
    if (self.notes.isAutoMode) {
      if (self.lastNote === note.name) {
        self.update(note)
        if (self.onNoteDetectedCallback) {
          self.onNoteDetectedCallback(note)
        }
      } else {
        self.lastNote = note.name
      }
    }
  }

  this.updateAudioFrame()
}

Application.prototype.updateAudioFrame = function() {
  if (this.tuner.analyser) {
    if (!this.timeDomainData) {
      this.timeDomainData = new Uint8Array(this.tuner.analyser.fftSize)
    }
    this.tuner.analyser.getByteTimeDomainData(this.timeDomainData)
    if (this.onAudioLevelCallback) {
      this.onAudioLevelCallback(rmsFromTimeDomain(this.timeDomainData))
    }
  }
  if (this.isRunning) requestAnimationFrame(this.updateAudioFrame.bind(this))
}

Application.prototype.update = function(note) {
  this.notes.update(note)
}

Application.prototype.playFrequency = function(frequency) {
  if (this.tuner && this.tuner.audioContext) {
    this.tuner.play(frequency)
  }
}

Application.prototype.stopReference = function() {
  if (this.tuner) this.tuner.stop()
}

Application.prototype.toggleAutoMode = function() {
  this.notes.toggleAutoMode()
}

Application.prototype.setInputDevice = function(deviceId) {
  if (this.tuner) this.tuner.setInputDevice(deviceId)
}

Application.prototype.setInputDeviceId = function(deviceId) {
  if (this.tuner) this.tuner.inputDeviceId = deviceId || null
}

Application.prototype.getAudioContext = function() {
  return this.tuner && this.tuner.audioContext
}

export async function listAudioInputDevices() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return []
  const devices = await navigator.mediaDevices.enumerateDevices()
  return devices.filter(function(d) { return d.kind === 'audioinput' })
}

export default Application
