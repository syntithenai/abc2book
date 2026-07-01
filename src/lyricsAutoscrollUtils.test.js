import {
  LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC,
  LYRICS_SECONDS_PER_LINE,
  computePixelsPerSecond,
  computeScrollProgress,
  countLyricLinesForScroll,
  getEffectiveMediaDurationSeconds,
  interpolateScrollY,
  resolveLyricsScrollMediaDuration,
  stepSpeedMultiplier,
  clampSpeedMultiplier,
  getTuneLyricsScrollSpeed,
} from './lyricsAutoscrollUtils';

function mediaControllerWithElementDuration(duration) {
  return {
    duration: duration,
    playerRef: {
      current: {
        duration: duration,
      },
    },
    getPlaybackProgress: function() {
      return { duration: duration };
    },
    isMediaPlaybackRoute: function() { return true; },
    isMidiPlaybackRoute: function() { return false; },
  };
}

function mediaControllerWithMidiState(duration) {
  return {
    duration: duration,
    playerRef: { current: null },
    filteredPlayerRef: { current: null },
    ytPlayerRef: { current: null },
    getPlaybackProgress: function() { return { duration: duration }; },
    isMediaPlaybackRoute: function() { return true; },
    isMidiPlaybackRoute: function() { return false; },
  };
}

describe('lyricsAutoscrollUtils', function() {
  test('uses default duration when no media link or loaded media', function() {
    expect(getEffectiveMediaDurationSeconds({ links: [{}] }, {}, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);
    expect(getEffectiveMediaDurationSeconds(null, null, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);
    expect(resolveLyricsScrollMediaDuration({ links: [{}] }, mediaControllerWithMidiState(22), 0)).toBe(0);
  });

  test('uses loaded media element duration only', function() {
    const controller = mediaControllerWithElementDuration(240);
    expect(resolveLyricsScrollMediaDuration({ links: [{ url: 'x' }] }, controller, 0)).toBe(240);
    expect(getEffectiveMediaDurationSeconds({ links: [{ url: 'x' }] }, controller, 0)).toBe(240);
  });

  test('ignores shared playback progress when media is not loaded', function() {
    const controller = mediaControllerWithMidiState(22);
    const tune = {
      links: [{ url: 'x' }],
      wLines: ['one', 'two', 'three'],
    };
    expect(getEffectiveMediaDurationSeconds(tune, controller, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);
  });

  test('uses lyric line count to set a slower minimum duration', function() {
    const shortTune = {
      wLines: ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h', 'i', 'j'],
    };
    expect(countLyricLinesForScroll(shortTune)).toBe(10);
    expect(getEffectiveMediaDurationSeconds(shortTune, null, 0)).toBe(LYRICS_AUTOSCROLL_DEFAULT_DURATION_SEC);

    const longTune = {
      wLines: Array.from({ length: 50 }, function(_, i) { return 'line ' + i; }),
    };
    expect(getEffectiveMediaDurationSeconds(longTune, null, 0)).toBe(50 * LYRICS_SECONDS_PER_LINE);
  });

  test('uses region end minus start when both are set', function() {
    const tune = {
      links: [{
        playbackLoops: [{
          active: true,
          startAt: '1:00',
          endAt: '4:30',
        }],
      }],
    };
    const controller = mediaControllerWithElementDuration(600);
    expect(getEffectiveMediaDurationSeconds(tune, controller, 0)).toBe(210);
  });

  test('uses media duration minus start when only start is set', function() {
    const tune = {
      links: [{ startAt: '0:30' }],
    };
    const controller = mediaControllerWithElementDuration(180);
    expect(getEffectiveMediaDurationSeconds(tune, controller, 0)).toBe(150);
  });

  test('computes pixels per second with multiplier', function() {
    expect(computePixelsPerSecond(600, 120, 1)).toBe(5);
    expect(computePixelsPerSecond(600, 120, 2)).toBe(10);
    expect(computePixelsPerSecond(0, 120, 1)).toBe(0);
  });

  test('interpolates scroll position over time', function() {
    const state = { startTime: 1000, startY: 100, endY: 500, totalMs: 4000, speedMultiplier: 1 };
    expect(computeScrollProgress(1000, state)).toBe(0);
    expect(computeScrollProgress(3000, state)).toBe(0.5);
    expect(interpolateScrollY(state, 0.5)).toBe(300);
    expect(computeScrollProgress(5000, state)).toBe(1);
  });

  test('clamps and steps speed multiplier', function() {
    expect(clampSpeedMultiplier(10)).toBe(3);
    expect(clampSpeedMultiplier(0.05)).toBe(0.1);
    expect(stepSpeedMultiplier(1, 1)).toBeCloseTo(1.2);
    expect(stepSpeedMultiplier(1.2, -1)).toBeCloseTo(1);
  });

  test('reads saved lyrics scroll speed from tune', function() {
    expect(getTuneLyricsScrollSpeed(null)).toBe(1);
    expect(getTuneLyricsScrollSpeed({ lyricsScrollSpeed: 0.5 })).toBe(0.5);
    expect(getTuneLyricsScrollSpeed({ lyricsScrollSpeed: 9 })).toBe(3);
  });
});
