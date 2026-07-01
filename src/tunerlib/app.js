import Tuner from './tuner.js'
import Notes from './notes.js'
import Meter from './meter.js'
import FrequencyBars from './frequency-bars.js'

const Application = function(meter, notes, frequencyBars, options) {
  const opts = options || {}
  this.a4 = opts.a4 != null ? opts.a4 : 440
  this.onNoteDetectedCallback = opts.onNoteDetected || null
  this.tuner = new Tuner(this.a4)
  this.notes = new Notes(notes, this.tuner)
  this.meter = new Meter(meter)
  this.isRunning = true
  this.frequencyBars = new FrequencyBars(frequencyBars)
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
  if (this.tuner) this.tuner.stop()
  this.isRunning = false
}

Application.prototype.start = function() {
  const self = this
  self.isRunning = true
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

  this.updateFrequencyBars()
}

Application.prototype.updateFrequencyBars = function() {
  if (this.tuner.analyser) {
    if (!this.frequencyData) {
      this.frequencyData = new Uint8Array(this.tuner.analyser.frequencyBinCount)
    }
    this.tuner.analyser.getByteFrequencyData(this.frequencyData)
    this.frequencyBars.update(this.frequencyData)
  }
  if (this.isRunning) requestAnimationFrame(this.updateFrequencyBars.bind(this))
}

Application.prototype.update = function(note) {
  this.notes.update(note)
  this.meter.update((note.cents / 50) * 45)
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

export default Application
