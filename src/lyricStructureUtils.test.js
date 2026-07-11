import { normalizeLyricStructure } from './lyricStructureUtils';

describe('lyricStructureUtils', function() {
  test('normalizeLyricStructure groups sections on blank lines and headers', function() {
    const blocks = normalizeLyricStructure([
      '[Verse 1]',
      'line one',
      'line two',
      '',
      '[Chorus]',
      'hook line',
      '',
      'orphan line',
    ]);

    expect(blocks).toEqual([
      {
        type: 'verse',
        header: '[Verse 1]',
        lines: ['line one', 'line two'],
      },
      {
        type: 'chorus',
        header: '[Chorus]',
        lines: ['hook line'],
      },
      {
        type: null,
        header: '',
        lines: ['orphan line'],
      },
    ]);
  });

  test('normalizeLyricStructure splits interior headers without blank lines', function() {
    const blocks = normalizeLyricStructure([
      '# Verse',
      'words',
      '# Chorus',
      'more words',
    ]);

    expect(blocks.length).toBe(2);
    expect(blocks[0]).toMatchObject({ type: 'verse', header: '# Verse', lines: ['words'] });
    expect(blocks[1]).toMatchObject({ type: 'chorus', header: '# Chorus', lines: ['more words'] });
  });

  test('normalizeLyricStructure returns empty array for blank input', function() {
    expect(normalizeLyricStructure([])).toEqual([]);
    expect(normalizeLyricStructure(['', '  ', ''])).toEqual([]);
  });
});
