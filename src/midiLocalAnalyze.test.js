import { buildLocalMidiImportProfile } from './midiLocalAnalyze';

describe('buildLocalMidiImportProfile', function() {
  test('builds a wizard profile from MIDI bytes', function() {
    const profile = buildLocalMidiImportProfile(new Uint8Array([77, 84, 104, 100]), 'tune.mid');
    expect(profile.recommended_mode).toBe('melody');
    expect(profile.tempo_bpm).toBeGreaterThan(0);
    expect(Array.isArray(profile.tracks)).toBe(true);
    expect(profile.title).toBe('tune');
  });
});
