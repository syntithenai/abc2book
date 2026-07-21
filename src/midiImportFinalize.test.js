import { assembleHarmonyVoiceAbc, mergeMidiChordSegmentsIntoAbc } from './midiImportFinalize';

describe('midiImportFinalize', function() {
  test('assembleHarmonyVoiceAbc adds V:2 section', function() {
    const melody = 'X:1\nT:Test\nM:4/4\nL:1/8\nK:G\nG2 A2 |';
    const merged = assembleHarmonyVoiceAbc(melody, '[CEG]2 z2 |', 'Chords');
    expect(merged).toContain('V:2');
    expect(merged).toContain('[V:1]');
    expect(merged).toContain('[V:2]');
    expect(merged).toContain('[CEG]2');
  });

  test('mergeMidiChordSegmentsIntoAbc merges chord grid', function() {
    const abc = 'X:1\nT:Test\nM:4/4\nL:1/8\nK:G\nG2 A2 B2 c2 |';
    const parser = {
      mergeChords: function(grid, base) {
        return base + '\n% chords:' + grid;
      },
    };
    const merged = mergeMidiChordSegmentsIntoAbc(abc, {
      segments: [{ start: 0, end: 1, label: 'G:maj' }],
      beatTimes: [0, 0.5, 1, 1.5, 2],
      meter: '4/4',
      tempo: 120,
    }, parser, { meter: '4/4' });
    expect(merged).toContain('% chords:');
    expect(merged).toContain('G');
  });
});
