import { playalongMidiStartOptions } from './usePlayalongRecordSession'

describe('playalongMidiStartOptions', function() {
  test('asks MIDI to restart from the beginning of the tune', function() {
    const tune = { id: 't1' }
    const opts = playalongMidiStartOptions(tune, 100)
    expect(opts.tune).toBe(tune)
    expect(opts.startBeat).toBe(0)
    expect(opts.fromStart).toBe(true)
    expect(opts.restart).toBe(true)
    expect(opts.fresh).toBe(true)
    expect(opts.preservePosition).toBe(false)
    expect(opts.midiOnly).toBe(true)
    expect(opts.tempo).toBe(100)
  })
})
