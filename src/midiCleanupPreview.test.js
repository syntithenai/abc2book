import { applyMidiCleanup, cleanupIsActive, normalizeCleanupOptions } from './midiCleanupPreview';

describe('midiCleanupPreview', function() {
  test('normalizeCleanupOptions clamps values', function() {
    const opts = normalizeCleanupOptions({
      velocityGate: 200,
      minDurationMs: -5,
      swingAmount: 0.9,
    });
    expect(opts.velocityGate).toBe(127);
    expect(opts.minDurationMs).toBe(0);
    expect(opts.swingAmount).toBe(0.5);
  });

  test('velocity gate removes quiet notes', function() {
    const notes = [
      { midi: 60, start: 0, end: 0.5, velocity: 10 },
      { midi: 62, start: 0.5, end: 1, velocity: 100 },
    ];
    const result = applyMidiCleanup(notes, { velocityGate: 50 });
    expect(result.notes.length).toBe(1);
    expect(result.notes[0].midi).toBe(62);
    expect(result.stats.removedCount).toBe(1);
  });

  test('retrigger merge joins adjacent same pitch', function() {
    const notes = [
      { midi: 60, start: 0, end: 0.2, velocity: 90 },
      { midi: 60, start: 0.21, end: 0.5, velocity: 90 },
    ];
    const result = applyMidiCleanup(notes, { retriggerMergeMs: 50 });
    expect(result.notes.length).toBe(1);
    expect(result.notes[0].end).toBeCloseTo(0.5);
  });

  test('cleanupIsActive detects options', function() {
    expect(cleanupIsActive({})).toBe(false);
    expect(cleanupIsActive({ velocityGate: 1 })).toBe(true);
  });
});
