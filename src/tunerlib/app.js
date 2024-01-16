import Tuner from './tuner.js'
import Notes from './notes.js'
import Meter from './meter.js'
import FrequencyBars from './frequency-bars.js'

const Application = function(meter,notes, frequencyBars) {
  this.a4 =  440
  this.tuner = new Tuner(this.a4)
  this.notes = new Notes(notes, this.tuner)
  this.meter = new Meter(meter)
  this.isRunning = true
  this.frequencyBars = new FrequencyBars(frequencyBars)
  this.update({ name: 'A', frequency: this.a4, octave: 4, value: 69, cents: 0 })
}

Application.prototype.init = function(meter,notes) {
  this.tuner.init()
}

Application.prototype.stop = function(meter,notes) {
  if (this.tuner) this.tuner.stop()
  this.isRunning = false
}


Application.prototype.start = function(meter,notes) {
  const self = this
  self.isRunning = true
  //console.log('app start')
  //this.tuner.start()
  this.tuner.onNoteDetected = function(note) {
    if (self.notes.isAutoMode) {
      if (self.lastNote === note.name) {
        self.update(note)
      } else {
        self.lastNote = note.name
      }
    }
  }

  this.updateFrequencyBars()
}

Application.prototype.updateFrequencyBars = function() {
  //console.log('app update freq')
  if (this.tuner.analyser) {
    //console.log('app update freq analysier', this.frequencyData)
    if (this.frequencyData)  {
		this.tuner.analyser.getByteFrequencyData(this.frequencyData)
		this.frequencyBars.update(this.frequencyData)
	}
  }
  if (this.isRunning) requestAnimationFrame(this.updateFrequencyBars.bind(this))
}

Application.prototype.update = function(note) {
  //console.log('app update')
  this.notes.update(note)
  this.meter.update((note.cents / 50) * 45)
}

// noinspection JSUnusedGlobalSymbols
Application.prototype.toggleAutoMode = function() {
  this.notes.toggleAutoMode()
}

export default Application
