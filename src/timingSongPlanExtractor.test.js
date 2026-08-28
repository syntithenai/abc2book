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

  test('refineTimingFromMelodyDuration preserves tempo when scaling duration', function() {
    const plan = buildTimingSongPlan({
      name: 'Grace',
      tempo: 180,
      meter: '3/4',
      rhythm: 'waltz',
      key: 'G',
      voices: {
        '1': {
          meta: '',
          notes: [
            'D | G2A/2G/2 | B2A | G2E | D2D | G2B/2G/2 | B2A/2B/2 | d3 | d z B |',
          ],
        },
      },
    }, '', { visualObj: null });
    expect(plan.timing.tempoBpm).toBe(180);
    const refined = refineTimingFromMelodyDuration(plan, 28.8);
    expect(refined.timing.tempoBpm).toBe(180);
    expect(refined.timing.totalDurationSec).toBeCloseTo(28.8, 1);
    expect(refined.backingPrompt).toMatch(/180 BPM/);
  });

  test('buildTimingSongPlan prefers Q: header tempo over stale tune.tempo', function() {
    const plan = buildTimingSongPlan({
      name: 'Grace',
      tempo: 180,
      meter: '3/4',
      rhythm: 'waltz',
      key: 'G',
      voices: {
        '1': {
          meta: '',
          notes: ['| G2 A | B2 A |'],
        },
      },
    }, 'X:1\nT:Grace\nM:3/4\nL:1/8\nQ:1/4=100\nK:G\n|: G2 A |:\n', {
      visualObj: mockVisual(30000, 3, 100),
    });
    expect(plan.timing.tempoBpm).toBe(100);
    expect(plan.backingPrompt).toMatch(/100 BPM/);
  });

  test('guide conditioning uses orchestration prompt language', function() {
    const plan = buildTimingSongPlan(REEL_TUNE, '', {
      visualObj: mockVisual(32000, 4, 120),
    });
    expect(plan.backingPrompt).toMatch(/clear fiddle melody|audible guitar|continuous accompaniment/i);
    expect(plan.backingPrompt).toMatch(/keep every melody note audible/i);
    expect(plan.guideEngine).toBe('stable_audio');
    expect(plan.backingNegativePrompt).toMatch(/church organ|thin arrangement|no accompaniment/i);
    expect(plan.backingNegativePrompt).not.toMatch(/lead melody/i);
  });

  test('classical style prompt bans guitar fills', function() {
    const plan = buildTimingSongPlan(REEL_TUNE, '', {
      visualObj: mockVisual(32000, 4, 120),
    });
    plan.chordsPerBar = ['D', 'A', 'D', 'A', 'G', 'Em', 'D', 'A'];
    plan.guideHarmonySource = 'chord_chart';
    const payload = buildPracticeTrackRequestPayload(plan, { renderStyle: 'classical' });
    expect(payload.backingPrompt).toMatch(/classical chamber|solo violin|string/i);
    expect(payload.backingPrompt).toMatch(/sustained|harmony under every bar|continuous accompaniment|no dropout/i);
    expect(payload.backingPrompt).not.toMatch(/session backing only|rhythm section under/i);
    expect(payload.backingNegativePrompt).toMatch(/acoustic guitar|guitar fill|strumming|oom.?pah|organ|dropout|ambient wash/i);
    expect(payload.accompanimentMidiProgram).toBe(48);
    expect(payload.initNoiseLevel).toBeCloseTo(0.22, 2);
    expect(payload.chordsPerBar.length).toBeGreaterThan(0);
    expect(payload.guideHarmonySource).toBe('chord_chart');
  });

  test('single-strain repeats expand playCount from tune.repeats', function() {
    const plan = buildTimingSongPlan({
      name: 'Waltz',
      tempo: 100,
      meter: '3/4',
      rhythm: 'waltz',
      key: 'G',
      repeats: 3,
      voices: { '1': { meta: '', notes: ['| G2 A | B2 A |'] } },
    }, '', { visualObj: null });
    expect(plan.timing.repeatSchedule[0].playCount).toBe(3);
  });

  test('buildPracticeTrackRequestPayload defaults to guide conditioning without MIDI mix', function() {
    const plan = buildTimingSongPlan(REEL_TUNE, '', {
      visualObj: mockVisual(32000, 4, 120),
    });
    const payload = buildPracticeTrackRequestPayload(plan);
    expect(payload.guideAudioConditioning).toBe(true);
    expect(payload.includeStyleMelodyStem).toBe(false);
    expect(payload.mixDrumGuide).toBe(false);
  });

  test('waltzes disable MIDI drum guides', function() {
    const plan = buildTimingSongPlan({
      name: 'Waltz',
      tempo: 100,
      meter: '3/4',
      rhythm: 'waltz',
      key: 'G',
      voices: { '1': { meta: '', notes: ['| G2 A | B2 A |'] } },
    }, '', { visualObj: null });
    const payload = buildPracticeTrackRequestPayload(plan, { includeDrumGuide: true });
    expect(payload.includeDrumGuide).toBe(false);
  });
});
