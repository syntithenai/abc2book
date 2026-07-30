import { buildNotationCheckTune } from './notationCheckSnapshot';
import { runNotationChecks } from './useNotationCheck';

describe('useNotationCheck helpers', function() {
  test('runNotationChecks includes extended issues', function() {
    const tune = {
      id: 't1',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      tempo: 120,
      voices: {
        '1': { notes: ['C D E F |'] },
        '2': { notes: ['C D E F |'] },
      },
    };
    const report = runNotationChecks(tune, {
      skipRenderAbc: true,
      abcTools: {
        json2abc: function(t) {
          return 'X:1\nK:C\nM:4/4\nL:1/8\nQ:1/4=90\n' + t.voices['1'].notes.join('\n');
        },
        getMetaValueFromAbc: function(header) {
          if (header === 'Q') return '1/4=90';
          if (header === 'M') return '4/4';
          if (header === 'K') return 'C';
          if (header === 'L') return '1/8';
          return '';
        },
      },
    });
    expect(report.extendedResult).not.toBeNull();
    expect(report.issues.some(function(item) { return item.source === 'extended'; })).toBe(true);
  });

  test('buildNotationCheckTune merges live voice bodies', function() {
    const tune = {
      id: 't2',
      name: 'Test',
      meter: '4/4',
      key: 'C',
      noteLength: '1/8',
      voices: { '1': { notes: ['C D E F |'] } },
    };
    const snapshot = buildNotationCheckTune(tune, { '1': 'G A B c |' });
    expect(snapshot.voices['1'].notes[0]).toContain('G A B c');
  });
});
