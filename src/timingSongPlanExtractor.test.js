import {
  buildBarBoundariesSec,
  totalDurationSecFromVisual,
  tempoBpmFromVisual,
} from './abcjsTimingExtract';
import { buildBackingPrompt } from './backingPromptBuilder';
import {
  buildTimingSongPlan,
  timingPlanNeedsAcknowledgement,
  buildPracticeTrackRequestPayload,
  refineTimingFromMelodyDuration,
} from './timingSongPlanExtractor';

function mockVisual(totalMs, beatsPerBar, bpm) {
  return {
    getTotalTime: function() { return totalMs; },
    getBeatsPerMeasure: function() { return beatsPerBar; },
    getBpm: function() { return bpm; },
    millisecondsPerMeasure: function() { return (60000 / bpm) * beatsPerBar; },
  };
}

const REEL_TUNE = {
  name: 'Test Reel',
  tempo: 120,
  meter: '4/4',
  rhythm: 'reel',
  key: 'D',
  genres: ['Irish'],
  voices: {
    '1': {
      meta: '',
      notes: [
        '|: D2 F2 A2 | d4 | F2 A2 d2 | f4 :|',
        '|: G2 B2 d2 | g4 | F2 A2 d2 | d4 :|',
      ],
    },
  },
};

describe('abcjsTimingExtract', function() {
  test('totalDurationSecFromVisual uses getTotalTime', function() {
    expect(totalDurationSecFromVisual(mockVisual(64000, 4, 120), 120, 32)).toBeCloseTo(64, 1);
  });

  test('totalDurationSecFromVisual falls back to millisecondsPerMeasure', function() {
    const visual = {
      getBeatsPerMeasure: function() { return 4; },
      millisecondsPerMeasure: function() { return 2000; },
    };
    expect(totalDurationSecFromVisual(visual, 120, 8)).toBeCloseTo(16, 1);
  });

  test('buildBarBoundariesSec for 8 bars at 120 BPM 4/4', function() {
    const visual = mockVisual(32000, 4, 120);
    const boundaries = buildBarBoundariesSec(visual, 8, 120);
    expect(boundaries.length).toBe(9);
    expect(boundaries[1] - boundaries[0]).toBeCloseTo(2, 1);
  });
});

describe('backingPromptBuilder', function() {
  test('includes tempo and no-melody hints for reels', function() {
    const prompt = buildBackingPrompt({
      musical: { rhythm: 'reel', key: 'D', meter: '4/4' },
      timing: { tempoBpm: 120 },
      bibliographic: { genres: ['Irish'] },
    });
    expect(prompt).toMatch(/120 BPM/);
    expect(prompt).toMatch(/no melody/i);
    expect(prompt).toMatch(/reel/i);
  });
});

describe('timingSongPlanExtractor', function() {
  test('builds plan with abcjs timing when visual provided', function() {
    const visual = mockVisual(64000, 4, 120);
    const plan = buildTimingSongPlan(REEL_TUNE, 'X:1\nT:Test\nM:4/4\nL:1/8\nQ:120\nK:D\n|: DEF |:\n', {
      visualObj: visual,
    });
    expect(plan.timing.source).toBe('abcjs');
    expect(plan.timing.totalDurationSec).toBeCloseTo(64, 0);
    expect(plan.structure.length).toBe(2);
    expect(plan.backingPrompt).toMatch(/120 BPM/);
    expect(plan.timing.repeatSchedule.length).toBe(4);
  });

  test('falls back to bar-estimate without visual', function() {
    const plan = buildTimingSongPlan(REEL_TUNE, '', { visualObj: null });
    expect(plan.timing.source).toBe('bar-estimate');
    expect(timingPlanNeedsAcknowledgement(plan)).toBe(true);
  });

  test('buildPracticeTrackRequestPayload includes timing contract', function() {
    const plan = buildTimingSongPlan(REEL_TUNE, '', {
      visualObj: mockVisual(32000, 4, 120),
    });
    const payload = buildPracticeTrackRequestPayload(plan);
    expect(payload.timing.totalDurationSec).toBeGreaterThan(0);
    expect(payload.backingPrompt).toBeTruthy();
  });

  test('refineTimingFromMelodyDuration uses rendered audio length', function() {
    const plan = buildTimingSongPlan(REEL_TUNE, '', { visualObj: null });
    const refined = refineTimingFromMelodyDuration(plan, 33.5);
    expect(refined.timing.source).toBe('melody-render');
    expect(refined.timing.totalDurationSec).toBeCloseTo(33.5, 1);
  });
});
