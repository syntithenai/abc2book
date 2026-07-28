import {
  buildBackingPrompt,
  buildBackingNegativePrompt,
  loopBarCountForPlan,
  loopDurationSecFromPlan,
} from './backingPromptBuilder';

describe('backingPromptBuilder', function() {
  test('uses percussion-only language for reels', function() {
    const prompt = buildBackingPrompt({
      musical: { rhythm: 'reel', key: 'D', meter: '4/4' },
      timing: { tempoBpm: 120 },
      bibliographic: { genres: ['Irish'] },
    });
    expect(prompt).toMatch(/120 BPM/);
    expect(prompt).toMatch(/percussion only/i);
    expect(prompt).toMatch(/no pitched instruments/i);
  });

  test('negative prompt blocks harmonic content', function() {
    const negative = buildBackingNegativePrompt();
    expect(negative).toMatch(/harmony/i);
    expect(negative).toMatch(/ambient wash/i);
  });

  test('loop duration caps at sixteen bars', function() {
    const boundaries = [];
    for (let i = 0; i <= 32; i += 1) boundaries.push(i * 2);
    const duration = loopDurationSecFromPlan({
      timing: {
        totalDurationSec: 64,
        barBoundariesSec: boundaries,
      },
    });
    expect(duration).toBeCloseTo(32, 0);
    expect(loopBarCountForPlan({
      timing: { barBoundariesSec: boundaries },
    })).toBe(16);
  });
});
