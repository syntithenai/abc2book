import {
  computeRmsFromTimeDomain,
  createSilenceMonitor,
  DEFAULT_MIN_RECORD_MS,
  DEFAULT_SILENCE_MS,
  DEFAULT_SPEECH_THRESHOLD,
} from './voiceSilenceDetection'

describe('voiceSilenceDetection', function() {
  describe('computeRmsFromTimeDomain', function() {
    it('returns 0 for silence (flat 128)', function() {
      const data = new Uint8Array(128)
      data.fill(128)
      expect(computeRmsFromTimeDomain(data)).toBe(0)
    })

    it('returns higher RMS for louder signal', function() {
      const quiet = new Uint8Array(128)
      quiet.fill(128)
      quiet[0] = 140
      const loud = new Uint8Array(128)
      loud.fill(128)
      for (let i = 0; i < loud.length; i += 1) {
        loud[i] = 128 + (i % 2 === 0 ? 40 : -40)
      }
      expect(computeRmsFromTimeDomain(loud)).toBeGreaterThan(computeRmsFromTimeDomain(quiet))
    })
  })

  describe('createSilenceMonitor', function() {
    let rafCallbacks

    beforeEach(function() {
      rafCallbacks = []
      jest.spyOn(global, 'requestAnimationFrame').mockImplementation(function(cb) {
        rafCallbacks.push(cb)
        return rafCallbacks.length
      })
      jest.spyOn(global, 'cancelAnimationFrame').mockImplementation(function() {})
    })

    afterEach(function() {
      jest.restoreAllMocks()
    })

    function flushRaf(count) {
      for (let i = 0; i < count; i += 1) {
        const cb = rafCallbacks.shift()
        if (cb) cb()
      }
    }

    function createMockAnalyser(rmsSequence) {
      let index = 0
      return {
        frequencyBinCount: 128,
        getByteTimeDomainData: function(data) {
          const rms = rmsSequence[Math.min(index, rmsSequence.length - 1)]
          index += 1
          const amplitude = Math.min(127, Math.round(rms * 128))
          for (let i = 0; i < data.length; i += 1) {
            data[i] = 128 + (i % 2 === 0 ? amplitude : -amplitude)
          }
        },
      }
    }

    it('does not fire onSilence when no speech is detected', function() {
      let time = 0
      const onSilence = jest.fn()
      const monitor = createSilenceMonitor({
        analyser: createMockAnalyser([0, 0, 0, 0, 0]),
        onSilence: onSilence,
        speechThreshold: 0.02,
        silenceMs: 100,
        minRecordMs: 0,
        now: function() { return time },
      })
      monitor.start()
      time = 500
      flushRaf(5)
      monitor.stop()
      expect(onSilence).not.toHaveBeenCalled()
    })

    it('fires onSilence after speech then sustained silence', function() {
      let time = 0
      const onSilence = jest.fn()
      const monitor = createSilenceMonitor({
        analyser: createMockAnalyser([0.05, 0.05, 0, 0, 0, 0, 0, 0]),
        onSilence: onSilence,
        speechThreshold: 0.02,
        silenceMs: 100,
        minRecordMs: 0,
        now: function() { return time },
      })
      monitor.start()
      time = 50
      monitor.stop()
      expect(onSilence).not.toHaveBeenCalled()

      time = 200
      const monitor2 = createSilenceMonitor({
        analyser: createMockAnalyser([0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        onSilence: onSilence,
        speechThreshold: 0.02,
        silenceMs: 100,
        minRecordMs: 0,
        now: function() { return time },
      })
      monitor2.start()
      for (let i = 0; i < 20; i += 1) {
        time += 20
        flushRaf(1)
      }
      monitor2.stop()
      expect(onSilence).toHaveBeenCalledTimes(1)
    })

    it('ignores silence before minRecordMs', function() {
      let time = 0
      const onSilence = jest.fn()
      const monitor = createSilenceMonitor({
        analyser: createMockAnalyser([0.05, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
        onSilence: onSilence,
        speechThreshold: 0.02,
        silenceMs: 50,
        minRecordMs: DEFAULT_MIN_RECORD_MS,
        now: function() { return time },
      })
      monitor.start()
      time = 100
      flushRaf(5)
      monitor.stop()
      expect(onSilence).not.toHaveBeenCalled()
    })
  })

  it('exports default constants', function() {
    expect(DEFAULT_SPEECH_THRESHOLD).toBe(0.02)
    expect(DEFAULT_SILENCE_MS).toBe(1200)
    expect(DEFAULT_MIN_RECORD_MS).toBe(500)
  })
})
