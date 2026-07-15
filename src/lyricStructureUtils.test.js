import {
  appendLyricSection,
  formatLyricSectionHeader,
  lineIndexToCharOffset,
  listLyricSections,
  normalizeLyricStructure,
  reorderLyricSections,
  serializeLyricStructure,
  sectionDisplayTitle,
} from './lyricStructureUtils';

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

  test('listLyricSections includes startLine and title', function() {
    const sections = listLyricSections([
      '[Verse 1]',
      'line one',
      '',
      '[Chorus]',
      'hook line',
      '',
      'orphan line',
    ]);
    expect(sections.map(function(s) { return { title: s.title, startLine: s.startLine }; })).toEqual([
      { title: 'Verse 1', startLine: 0 },
      { title: 'Chorus', startLine: 3 },
      { title: 'orphan line', startLine: 6 },
    ]);
  });

  test('sectionDisplayTitle cleans bracket and hash headers', function() {
    expect(sectionDisplayTitle({ header: '[Bridge]', lines: [] })).toBe('Bridge');
    expect(sectionDisplayTitle({ header: '# Verse 2', lines: [] })).toBe('Verse 2');
    expect(sectionDisplayTitle({ header: '', lines: ['hello world'] })).toBe('hello world');
  });

  test('serializeLyricStructure and reorderLyricSections rewrite lyrics text', function() {
    const text = '[Verse 1]\none\n\n[Chorus]\nhook line\n\n[Verse 2]\ntwo';
    expect(serializeLyricStructure(listLyricSections(text))).toBe(text);
    // insert-before index 2 while moving 0 → place Verse 1 before Verse 2
    expect(reorderLyricSections(text, 0, 2)).toBe('[Chorus]\nhook line\n\n[Verse 1]\none\n\n[Verse 2]\ntwo');
    // append at end (insert-before length)
    expect(reorderLyricSections(text, 0, 3)).toBe('[Chorus]\nhook line\n\n[Verse 2]\ntwo\n\n[Verse 1]\none');
    // move last before first
    expect(reorderLyricSections(text, 2, 0)).toBe('[Verse 2]\ntwo\n\n[Verse 1]\none\n\n[Chorus]\nhook line');
    // no-op when dropping onto self or immediately after self
    expect(reorderLyricSections(text, 1, 1)).toBe(text);
    expect(reorderLyricSections(text, 1, 2)).toBe(text);
  });

  test('appendLyricSection and formatLyricSectionHeader add named headers', function() {
    expect(formatLyricSectionHeader('Bridge')).toBe('[Bridge]');
    expect(formatLyricSectionHeader('[Outro]')).toBe('[Outro]');
    expect(formatLyricSectionHeader('# Chorus')).toBe('# Chorus');
    expect(appendLyricSection('[Verse]\nwords', 'Bridge')).toBe('[Verse]\nwords\n\n[Bridge]\n');
    expect(appendLyricSection('', 'Intro')).toBe('[Intro]\n');
  });

  test('lineIndexToCharOffset maps lines to character offsets', function() {
    expect(lineIndexToCharOffset('a\nbb\nccc', 0)).toBe(0);
    expect(lineIndexToCharOffset('a\nbb\nccc', 1)).toBe(2);
    expect(lineIndexToCharOffset('a\nbb\nccc', 2)).toBe(5);
  });
});
