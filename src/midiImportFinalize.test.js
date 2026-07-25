import { appendHarmonyVoiceAbc, assembleHarmonyVoiceAbc, finalizeMidiImportAbc, mergeMidiChordSegmentsIntoAbc } from './midiImportFinalize';

describe('midiImportFinalize', function() {
  test('assembleHarmonyVoiceAbc adds V:2 section', function() {
    const melody = 'X:1\nT:Test\nM:4/4\nL:1/8\nK:G\nV:1 nm="Melody" clef=treble\n[V:1]\nG2 A2 |';
    const merged = assembleHarmonyVoiceAbc(melody, '[CEG]2 z2 |', 'Chords');
    expect(merged).toContain('V:2');
    expect(merged).toContain('[V:1]');
    expect(merged).toContain('[V:2]');
    expect(merged).toContain('[CEG]2');
  });

  test('appendHarmonyVoiceAbc preserves existing multi-voice score', function() {
    const score = [
      'X:1',
      'M:4/4',
      'L:1/8',
      'K:C',
      'V:1 nm="Melody" clef=treble',
      'V:2 nm="Bass" clef=bass',
      '[V:1]',
      'C2 D2 |',
      '[V:2]',
      'C,2 D,2 |',
    ].join('\n');
    const merged = appendHarmonyVoiceAbc(score, 'G2 B2 |', 'Chords');
    expect(merged).toContain('V:3');
    expect(merged).toContain('[V:3]');
    expect(merged).toContain('[V:2]');
    expect(merged).toContain('C,2 D,2');
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

  test('finalizeMidiImportAbc skips chord merge for large multi-voice imports', function() {
    const abc = 'X:1\nM:4/4\nL:1/8\nK:C\nV:1 nm="Violin" clef=treble\nV:2 nm="Cello" clef=bass\n[V:1]\nC2 |\n[V:2]\nC,2 |';
    const parser = {
      mergeChords: function() { return 'should-not-run'; },
    };
    const merged = finalizeMidiImportAbc(abc, {
      mode: 'multi_voice',
      chordSegments: { segments: [{ start: 0, end: 1, label: 'C:maj' }], beatTimes: [0, 1], meter: '4/4' },
      harmonyAbc: 'G2 B2 |',
      harmonyVoiceName: 'Chords',
    }, parser, {
      includeChords: false,
      trackIds: [0, 1, 2, 3],
    });
    expect(merged).toBe(abc);
    expect(merged).not.toContain('V:3');
  });
});
