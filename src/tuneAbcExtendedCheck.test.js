import { checkTuneAbcExtended } from './tuneAbcExtendedCheck';

describe('tuneAbcExtendedCheck', function() {
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
