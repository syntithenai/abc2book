import { checkTuneAbcExtended } from './tuneAbcExtendedCheck';
import useAbcTools from './useAbcTools';
import { applyTuneTempoOnlyInTune } from './tuneAbcStructureFix';

describe('tuneAbcExtendedCheck', function() {
  const abcTools = useAbcTools();

  test('detects tempo mismatch between ABC and tune fields', function() {
    const tune = {
      id: 't1',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      tempo: 120,
      voices: { '1': { notes: ['C D E F |'] } },
    };
    const abcTools = {
      json2abc: function() { return 'X:1\nQ:1/4=90\nM:4/4\nK:C\nL:1/8\nC D E F |'; },
      getMetaValueFromAbc: function(header) {
        if (header === 'Q') return '1/4=90';
        return '';
      },
    };
    const result = checkTuneAbcExtended(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(item) { return item.code === 'tempo_mismatch'; })).toBe(true);
  });

  test('does not duplicate tempo warnings when BPM differs', function() {
    const tune = {
      id: 't1b',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      tempo: 120,
      voices: { '1': { notes: ['C D E F |'] } },
    };
    const abcToolsMock = {
      json2abc: function() { return 'X:1\nQ:1/8=90\nM:4/4\nK:C\nL:1/8\nC D E F |'; },
      getMetaValueFromAbc: function(header) {
        if (header === 'Q') return '1/8=90';
        return '';
      },
      getBeatLength: function() { return '1/4'; },
    };
    const result = checkTuneAbcExtended(tune, { abcTools: abcToolsMock });
    const codes = result.issues.map(function(item) { return item.code; });
    expect(codes).toContain('tempo_mismatch');
    expect(codes).not.toContain('tempo_beat_unit_mismatch');
  });

  test('detects tempo beat unit mismatch when BPM matches', function() {
    const tune = {
      id: 't1c',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      tempo: 120,
      voices: { '1': { notes: ['C D E F |'] } },
    };
    const abcToolsMock = {
      json2abc: function() { return 'X:1\nQ:1/8=120\nM:4/4\nK:C\nL:1/8\nC D E F |'; },
      getMetaValueFromAbc: function(header) {
        if (header === 'Q') return '1/8=120';
        return '';
      },
      getBeatLength: function() { return '1/4'; },
    };
    const result = checkTuneAbcExtended(tune, {
      abcTools: abcToolsMock,
      abcText: 'X:1\nQ:1/8=120\nM:4/4\nK:C\nL:1/8\nC D E F |',
    });
    expect(result.issues.some(function(item) { return item.code === 'tempo_beat_unit_mismatch'; })).toBe(true);
    expect(result.issues.some(function(item) { return item.code === 'tempo_mismatch'; })).toBe(false);
  });

  test('applyTuneTempoOnlyInTune normalizes tempo field to numeric BPM', function() {
    const tune = {
      id: 't1d',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      tempo: '1/8=120',
      voices: { '1': { notes: ['C D E F |'] } },
    };
    const fixed = applyTuneTempoOnlyInTune(tune, abcTools);
    expect(fixed).not.toBeNull();
    expect(Number(fixed.tempo)).toBe(120);
    const abc = abcTools.json2abc(fixed);
    expect(abc).toMatch(/Q:\s*1\/4=120/);
  });

  test('detects duplicate voice content', function() {
    const tune = {
      id: 't2',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      voices: {
        '1': { notes: ['C D E F |'] },
        '2': { notes: ['C D E F |'] },
      },
    };
    const result = checkTuneAbcExtended(tune, { abcTools: { json2abc: function() { return ''; } } });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(item) { return item.code === 'duplicate_voice_content'; })).toBe(true);
  });
});
