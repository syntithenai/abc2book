import { estimateAbcAudioDurationSec } from './notationAudioExport'

describe('notationAudioExport', function() {
  test('estimateAbcAudioDurationSec returns positive duration for a simple tune', function() {
    const abc = [
      'X:1',
      'T:Estimate test',
      'M:4/4',
      'L:1/4',
      'Q:1/4=120',
      'K:C',
      'CDEF | GABc | c2 z2 |',
    ].join('\n')
    const durationSec = estimateAbcAudioDurationSec(abc)
    expect(durationSec).toBeGreaterThan(1)
    expect(durationSec).toBeLessThan(20)
  })

  test('estimateAbcAudioDurationSec returns 0 for empty input', function() {
    expect(estimateAbcAudioDurationSec('')).toBe(0)
    expect(estimateAbcAudioDurationSec(null)).toBe(0)
  })
})
