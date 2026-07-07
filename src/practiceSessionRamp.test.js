import { getPracticePlaybackRampRatio, interpolatePracticeTempo } from './practiceSessionRamp'

describe('getPracticePlaybackRampRatio', function() {
  test('uses link region when endAt is set', function() {
    const ratio = getPracticePlaybackRampRatio({
      getLinkStartAt: function() { return 30 },
      getLinkEndAt: function() { return 90 },
      getPlaybackProgress: function() {
        return { currentTime: 60, duration: 200, ratio: 0.3 }
      },
    })
    expect(ratio).toBeCloseTo(0.5, 5)
  })

  test('uses full duration when no region end', function() {
    const ratio = getPracticePlaybackRampRatio({
      getLinkStartAt: function() { return 0 },
      getLinkEndAt: function() { return 0 },
      getPlaybackProgress: function() {
        return { currentTime: 45, duration: 180, ratio: 0.25 }
      },
    })
    expect(ratio).toBeCloseTo(0.25, 5)
  })

  test('returns null until duration is known', function() {
    expect(getPracticePlaybackRampRatio({
      getLinkStartAt: function() { return 0 },
      getLinkEndAt: function() { return 0 },
      getPlaybackProgress: function() {
        return { currentTime: 0, duration: 0, ratio: 0 }
      },
    })).toBeNull()
  })
})

describe('interpolatePracticeTempo', function() {
  test('interpolates between start and end', function() {
    expect(interpolatePracticeTempo(0.5, 1, 0)).toBe(0.5)
    expect(interpolatePracticeTempo(0.5, 1, 1)).toBe(1)
    expect(interpolatePracticeTempo(0.5, 1, 0.5)).toBe(0.75)
  })
})
