import { isDeferredMidiNotationCandidate } from './notationMidiImport';

describe('notationMidiImport', function() {
  test('isDeferredMidiNotationCandidate detects midi import format', function() {
    expect(isDeferredMidiNotationCandidate({ importFormat: 'midi', midiBytes: 'abc' })).toBe(true);
    expect(isDeferredMidiNotationCandidate({ abc: 'X:1\nK:C\nC' })).toBe(false);
  });
});
