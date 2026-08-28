/* global AudioWorkletProcessor, registerProcessor */
class PracticeCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super()
    this._bufferSize = 4096
    this._accumulator = new Float32Array(this._bufferSize)
    this._accumulated = 0
    this.port.onmessage = function(event) {
      const data = event.data || {}
      if (data.type === 'configure' && data.bufferSize) {
        this._bufferSize = data.bufferSize
        this._accumulator = new Float32Array(this._bufferSize)
        this._accumulated = 0
      }
    }.bind(this)
  }

  process(inputs) {
    const input = inputs[0]
    if (!input || !input[0] || !input[0].length) return true
    const channel = input[0]
    let offset = 0
    while (offset < channel.length) {
      const remaining = this._bufferSize - this._accumulated
      const toCopy = Math.min(remaining, channel.length - offset)
      this._accumulator.set(channel.subarray(offset, offset + toCopy), this._accumulated)
      this._accumulated += toCopy
      offset += toCopy
      if (this._accumulated >= this._bufferSize) {
        this.port.postMessage({
          type: 'buffer',
          samples: this._accumulator.slice(0),
          time: currentTime,
        })
        this._accumulated = 0
      }
    }
    return true
  }
}

registerProcessor('practice-capture-processor', PracticeCaptureProcessor)
