import {
  DEFAULT_METRONOME_ACCENT_VOLUME,
  DEFAULT_METRONOME_VOLUME,
  DEFAULT_DRUM_VOLUME,
  getMetronomeVolumes,
  setMetronomeVolumes,
  METRONOME_ACCENT,
  METRONOME_MUTE,
  METRONOME_TICK,
} from './metronomeTickSounds'

describe('metronomeTickSounds volumes', function() {
  afterEach(function() {
    setMetronomeVolumes({
      volume: DEFAULT_METRONOME_VOLUME,
      accentVolume: DEFAULT_METRONOME_ACCENT_VOLUME,
      drumVolume: DEFAULT_DRUM_VOLUME,
    })
  })

  test('setMetronomeVolumes clamps and persists round-trip via getters', function() {
    setMetronomeVolumes({ volume: 0.4, accentVolume: 0.9, drumVolume: 0.5 })
    expect(getMetronomeVolumes()).toEqual({ volume: 0.4, accentVolume: 0.9, drumVolume: 0.5 })

    setMetronomeVolumes({ volume: 2, accentVolume: -1, drumVolume: 3 })
    expect(getMetronomeVolumes()).toEqual({ volume: 1, accentVolume: 0, drumVolume: 1 })
  })

  test('exports accent level constants', function() {
    expect(METRONOME_ACCENT).toBe('accent')
    expect(METRONOME_TICK).toBe('tick')
    expect(METRONOME_MUTE).toBe('mute')
  })
})
