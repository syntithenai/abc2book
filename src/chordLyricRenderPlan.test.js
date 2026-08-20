import { resolveChordRenderPlan } from './chordLyricRenderPlan';

describe('resolveChordRenderPlan', function() {
  test('hideChords forces strip mode', function() {
    const plan = resolveChordRenderPlan({ words: ['C G', 'hello'], voices: {} }, { hideChords: true });
    expect(plan.mode).toBe('strip');
  });

  test('COW lyrics use passthrough', function() {
    const plan = resolveChordRenderPlan({
      words: ['C G Am', 'My line of lyrics'],
      voices: { '1': { notes: ['"C"C |'] } },
    }, {});
    expect(plan.mode).toBe('passthrough_cow');
  });

  test('plain lyrics default to plain mode without notation merge', function() {
    const plan = resolveChordRenderPlan({
      words: ['My line of lyrics', 'Another line'],
      voices: { '1': { notes: ['"C"C | "G"G |'] } },
    }, {});
    expect(plan.mode).toBe('plain');
  });

  test('plain lyrics use per_line_abc when notation merge allowed', function() {
    const plan = resolveChordRenderPlan({
      words: ['My line of lyrics', 'Another line'],
      voices: { '1': { notes: ['"C"C | "G"G |'] } },
    }, { allowNotationMerge: true });
    expect(plan.mode).toBe('per_line_abc');
  });
});
