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

  test('formatNotesToAbcBody keeps near-simultaneous chord tones on one slot', function() {
    const body = formatNotesToAbcBody([
      { start: 0, end: 0.5, startTick: 0, endTick: 240, midi: 60 },
      { start: 0.01, end: 0.5, startTick: 4, endTick: 240, midi: 64 },
      { start: 0.02, end: 0.5, startTick: 8, endTick: 240, midi: 67 },
    ], {
      beatTimes: buildBeatTimes(2, 120),
      beatsPerBar: 4,
      slotsPerBeat: 2,
      ticksPerBeat: 480,
      key: 'C',
      quantStrength: 1,
      allowChords: true,
    });
    expect(body).toMatch(/\[/);
    expect(body).toMatch(/C/);
    expect(body).toMatch(/E/);
    expect(body).toMatch(/G/);
  });

  test('buildCleanupScorePreviewAbc preserves melody pitches with tick grid', function() {
    const notes = [
      { start: 0, end: 0.5, startTick: 0, endTick: 240, midi: 62 },
      { start: 0.5, end: 1, startTick: 240, endTick: 480, midi: 64 },
      { start: 1, end: 1.5, startTick: 480, endTick: 720, midi: 65 },
      { start: 1.5, end: 2, startTick: 720, endTick: 960, midi: 67 },
    ];
    const abc = buildCleanupScorePreviewAbc([
      { id: 1, notes: notes, isDrum: false, program: 0, key: 'C', allowChords: false },
    ], {
      tempoBpm: 120,
      meter: '4/4',
      key: 'C',
      slotsPerBeat: 2,
      ticksPerBeat: 480,
      quantStrength: 1,
      noteLength: '1/8',
    });
    expect(abc).toMatch(/D/);
    expect(abc).toMatch(/E/);
    expect(abc).toMatch(/F/);
    expect(abc).toMatch(/G/);
  });

  test('buildCleanupScorePreviewAbc omits key-signature accidentals', function() {
    const abc = buildCleanupScorePreviewAbc([
      {
        id: 1,
        notes: [
          { start: 0, end: 0.5, midi: 66 },
          { start: 0.5, end: 1, midi: 67 },
        ],
        isDrum: false,
        program: 0,
        key: 'G',
      },
    ], { tempoBpm: 120, meter: '4/4', key: 'G', slotsPerBeat: 2, noteLength: '1/8' });
    expect(abc).toContain('K:G');
    expect(abc).toMatch(/F2 G2/);
    expect(abc).not.toMatch(/\^F/);
  });
});
