import {
  buildBeatTimes,
  buildCleanupScorePreviewAbc,
  formatNotesToAbcBody,
} from './midiCleanupNotationPreview';

describe('midiCleanupNotationPreview', function() {
  test('formatNotesToAbcBody quantizes simple melody', function() {
    const beatTimes = buildBeatTimes(2, 120);
    const body = formatNotesToAbcBody([
      { start: 0, end: 0.5, midi: 60 },
      { start: 0.5, end: 1, midi: 62 },
    ], { beatTimes: beatTimes, beatsPerBar: 4, slotsPerBeat: 2, key: 'C' });
    expect(body).toMatch(/C/);
    expect(body).toMatch(/D/);
  });

  test('buildCleanupScorePreviewAbc emits multi-voice score', function() {
    const abc = buildCleanupScorePreviewAbc([
      { id: 1, notes: [{ start: 0, end: 0.5, midi: 60 }], isDrum: false, roleHint: 'melody', program: 0 },
      { id: 2, notes: [{ start: 0, end: 0.5, midi: 48 }], isDrum: false, roleHint: 'bass', program: 32 },
    ], { tempoBpm: 120, meter: '4/4', key: 'C', slotsPerBeat: 2 });
    expect(abc).toContain('V:1');
    expect(abc).toContain('V:2');
    expect(abc).toContain('[V:1]');
    expect(abc).toContain('[V:2]');
    expect(abc).toContain('clef=bass');
    expect(abc).toContain('nm="acoustic bass"');
    expect(abc.indexOf('%%MIDI program 0')).toBeLessThan(abc.indexOf('[V:1]'));
    expect(abc.indexOf('%%MIDI program 32')).toBeLessThan(abc.indexOf('[V:2]'));
    expect(abc).not.toContain('nm="Bass"');
  });

  test('formatNotesToAbcBody includes barlines for multi-bar melody', function() {
    const beatTimes = buildBeatTimes(8, 120);
    const notes = [];
    for (let bar = 0; bar < 4; bar += 1) {
      for (let beat = 0; beat < 4; beat += 1) {
        notes.push({
          start: bar * 2 + beat * 0.5,
          end: bar * 2 + beat * 0.5 + 0.45,
          midi: 60 + beat,
        });
      }
    }
    const body = formatNotesToAbcBody(notes, {
      beatTimes: beatTimes,
      beatsPerBar: 4,
      slotsPerBeat: 2,
      key: 'C',
    });
    expect(body.split('|').length).toBeGreaterThanOrEqual(4);
    expect(body).toMatch(/\|/);
  });

  test('buildCleanupScorePreviewAbc includes barlines for multi-bar melody', function() {
    const notes = [];
    for (let bar = 0; bar < 4; bar += 1) {
      for (let beat = 0; beat < 4; beat += 1) {
        notes.push({
          start: bar * 2 + beat * 0.5,
          end: bar * 2 + beat * 0.5 + 0.45,
          midi: 60 + beat,
        });
      }
    }
    const abc = buildCleanupScorePreviewAbc([
      { id: 1, notes: notes, isDrum: false, program: 0 },
    ], { tempoBpm: 120, meter: '4/4', key: 'C', slotsPerBeat: 2 });
    expect(abc).toMatch(/\|/);
  });

  test('buildCleanupScorePreviewAbc uses instrument when track name is generic', function() {
    const abc = buildCleanupScorePreviewAbc([
      {
        id: 1,
        name: 'Track 3',
        notes: [{ start: 0, end: 0.5, midi: 67 }],
        isDrum: false,
        program: 40,
      },
    ], { tempoBpm: 120, meter: '4/4', key: 'C', slotsPerBeat: 2 });
    expect(abc).toContain('nm="violin"');
    expect(abc).not.toContain('nm="Track 3"');
    expect(abc.indexOf('%%MIDI program 40')).toBeLessThan(abc.indexOf('[V:1]'));
  });

  test('buildCleanupScorePreviewAbc spans full length for sparse and dense voices', function() {
    const sparse = [];
    for (let i = 0; i < 4; i += 1) {
      sparse.push({ start: i * 2, end: i * 2 + 0.4, midi: 60 + i });
    }
    const dense = [];
    for (let bar = 0; bar < 8; bar += 1) {
      for (let beat = 0; beat < 4; beat += 1) {
        dense.push({
          start: bar * 2 + beat * 0.5,
          end: bar * 2 + beat * 0.5 + 0.4,
          midi: 48 + beat,
        });
      }
    }
    const abc = buildCleanupScorePreviewAbc([
      { id: 1, notes: sparse, isDrum: false, program: 40 },
      { id: 2, notes: dense, isDrum: false, program: 32, roleHint: 'bass' },
    ], { tempoBpm: 120, meter: '4/4', key: 'C', slotsPerBeat: 2 });
    expect(abc.split('|').length).toBeGreaterThanOrEqual(8);
  });
});
