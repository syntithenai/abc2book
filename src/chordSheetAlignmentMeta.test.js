import useAbcTools from './useAbcTools';

describe('chordSheetAlignment meta', function() {
  test('json2abc does not emit chordSheetAlignment as [object Object] headers', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'csa-test-1',
      name: 'Aligned Tune',
      meter: '4/4',
      noteLength: '1/8',
      key: 'G',
      meta: {
        N: ['A note'],
        chordSheetAlignment: [
          { header: 'Verse', type: 'verse', lines: ['hello'], linePairs: [] },
          { header: 'Chorus', type: 'chorus', lines: ['world'], linePairs: [] },
        ],
        chordProSource: '{title: Aligned Tune}',
      },
      voices: { 1: { meta: '', notes: ['G A B c |'] } },
    };

    const abc = abcTools.json2abc(tune);
    expect(abc).not.toMatch(/chordSheetAlignment:/);
    expect(abc).not.toContain('[object Object]');
    expect(abc).not.toMatch(/chordProSource:/);
    expect(abc).toContain('N: A note');
  });

  test('abc2json drops legacy chordSheetAlignment [object Object] note lines', function() {
    const abcTools = useAbcTools();
    const abc = [
      '',
      'X:1',
      'T:Legacy Leak',
      'M:4/4',
      'L:1/8',
      'K:C',
      'chordSheetAlignment: [object Object]',
      'chordSheetAlignment: [object Object]',
      'C D E F |',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    const notes = parsed.voices && parsed.voices['1'] ? parsed.voices['1'].notes : [];
    expect(notes.join('\n')).not.toMatch(/chordSheetAlignment/);
    expect(notes.join('\n')).toContain('C D E F |');
  });
});
