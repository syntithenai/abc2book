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

  test('normalizeLyricStructure keeps blank lines mid-verse when section labels follow', function() {
    const blocks = normalizeLyricStructure([
      '# Chorus',
      'Health and time and love',
      '',
      '# Verse I',
      'In our younger days, we are taught to save',
      'Putting it away to compound for a rainy day',
      'All the time to play but not enough to pay',
      '',
      'As we grow and take our form, find our place',
      'choices make it harder to replace the now',
      'I hope that you are living true',
      '',
      '# Chorus',
      '',
      '# Verse 2',
      'Tendons, broken teeth, the aches and pains',
      'Feeling so much less like energetic play',
      'Going out with folks seems hard',
      '',
      'The people that I love, I almost never see',
      'who generated many special treasured memories',
      'Now coffers full, I really wish I spent much more',
      '',
      '# Chorus',
    ]);

    expect(blocks.map(function(b) {
      return { type: b.type, header: b.header, lineCount: b.lines.length };
    })).toEqual([
      { type: 'chorus', header: '# Chorus', lineCount: 1 },
      { type: 'verse', header: '# Verse I', lineCount: 6 },
      { type: 'chorus', header: '# Chorus', lineCount: 0 },
      { type: 'verse', header: '# Verse 2', lineCount: 6 },
      { type: 'chorus', header: '# Chorus', lineCount: 0 },
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

  test('normalizeLyricStructure infers verse/chorus/bridge from alternating line counts', function() {
    const blocks = normalizeLyricStructure([
      'v1a', 'v1b', 'v1c', 'v1d', 'v1e', 'v1f', '',
      'c1a', 'c1b', 'c1c', 'c1d', '',
      'v2a', 'v2b', 'v2c', 'v2d', 'v2e', 'v2f', '',
      'c2a', 'c2b', 'c2c', 'c2d', '',
      'b1a', 'b1b', 'b1c', 'b1d', 'b1e',
    ]);
    expect(blocks.map(function(b) { return { type: b.type, header: b.header }; })).toEqual([
      { type: 'verse', header: '[Verse]' },
      { type: 'chorus', header: '[Chorus]' },
      { type: 'verse', header: '[Verse 2]' },
      { type: 'chorus', header: '[Chorus 2]' },
      { type: 'bridge', header: '[Bridge]' },
    ]);
  });

  test('normalizeLyricStructure splits a chorus repeated without blank lines into its own stanza', function() {
    const blocks = normalizeLyricStructure([
      '[Chorus]',
      'hook line one', 'hook line two', 'hook line three', '',
      '[Verse 1]',
      'v1a', 'v1b', 'v1c', 'v1d', '',
      'v2a', 'v2b', 'v2c', 'v2d',
      'hook line one', 'hook line two', 'hook line three',
    ]);
    expect(blocks.map(function(b) { return { type: b.type, lines: b.lines }; })).toEqual([
      { type: 'chorus', lines: ['hook line one', 'hook line two', 'hook line three'] },
      { type: 'verse', lines: ['v1a', 'v1b', 'v1c', 'v1d'] },
      { type: 'verse', lines: ['v2a', 'v2b', 'v2c', 'v2d'] },
      { type: 'chorus', lines: ['hook line one', 'hook line two', 'hook line three'] },
    ]);
  });

  test('normalizeLyricStructure fills unlabeled blocks when some headers exist', function() {
    const blocks = normalizeLyricStructure([
      'v1a', 'v1b', 'v1c', 'v1d', '',
      '[Chorus]',
      'c1a', 'c1b', 'c1c', 'c1d', 'c1e', 'c1f', '',
      'v2a', 'v2b', 'v2c', 'v2d', '',
      'c2a', 'c2b', 'c2c', 'c2d', 'c2e', 'c2f',
    ]);
    expect(blocks.map(function(b) { return b.type; })).toEqual(['verse', 'chorus', 'verse', 'chorus']);
    expect(blocks[1].header).toBe('[Chorus]');
  });

  test('normalizeLyricStructure labels verses and trailing duplicate chorus (Ripples pattern)', function() {
    const chorus = [
      'Wibble wobble wending warp',
      'Precocious paths parading',
      'Historic hints highlight the way to the',
      "here and now we're making",
    ];
    const blocks = normalizeLyricStructure([
      'Ripples - Steve Ryan 08/10/2024  (word=ripple, + earworm)',
      '',
      'Mum would sit with, me each morning, for a tinkle, on the keys',
      'From /such beginnings my teen band it used to cover ACDC',
      'To The Pogues and the tunes and a festival life that fired in me a spark',
      'Now my bestest friends are those who, I can jam it out with',
      '',
      '# CHORUS',
      ...chorus,
      '',
      'Little Elon raised in Africa, he learned survivors  ways. At',
      'nine, he lost his mummy when his folks went seperate ways',
      'Veldskool and machismo pa, he learned he had to fight',
      'Step over others on the way to psychopathic president Musk',
      '',
      '# CHORUS',
      ...chorus,
      '',
      '/Billy was a /nerdy /boy with a /boss girl /for a /mum and /sisters either /side',
      "He'd steal ideas, bend the rules of capital and on the way collect a mighty stack",
      'But not forget that made up money just exists exists to help us swap',
      'And now he gets to think upon, the smartest ways to give it back',
      '',
      '# CHORUS',
      ...chorus,
      '',
      ...chorus,
    ], { title: 'Ripples', composer: 'Steve Ryan' });

    expect(blocks.map(function(b) { return b.type; })).toEqual([
      'verse', 'chorus', 'verse', 'chorus', 'verse', 'chorus', 'chorus',
    ]);
    expect(blocks[0].header).toBe('[Verse]');
    expect(blocks[1].header).toBe('# CHORUS');
    expect(blocks[2].header).toBe('[Verse 2]');
    expect(blocks[6].header).toMatch(/\[Chorus/);
    expect(blocks[6].lines).toEqual(chorus);
  });

  test('normalizeLyricStructure drops leading title/composer preface (not a bridge)', function() {
    const blocks = normalizeLyricStructure([
      'Cold Goodbye - Steve Ryan 28/9/2025',
      '',
      '[chorus]',
      'Strange affair, while we all stared',
      "Made up face and hair but she's not there",
      "She's cold and dead",
      '',
      '[verse]',
      'The golden night, we said goodbye',
      'From afternoon of glowing color, warm and bright',
      'Down deep into the soil where you lie cold and dark',
      'To travel through the universe without a spark',
      '',
      '[chorus]',
      '',
      '[verse]',
      'The bite and spite, when we ignite',
    ]);
    expect(blocks.map(function(b) { return b.type; })).toEqual([
      'chorus', 'verse', 'chorus', 'verse',
    ]);
    expect(blocks.some(function(b) { return b.type === 'bridge'; })).toBe(false);
  });

  test('listLyricSections skips title preface and keeps startLine past it', function() {
    const lines = [
      'Cold Goodbye - Steve Ryan 28/9/2025',
      '',
      '[chorus]',
      'Strange affair, while we all stared',
      '',
      '[verse]',
      'The golden night, we said goodbye',
    ];
    const sections = listLyricSections(lines);
    expect(sections.map(function(s) { return s.type; })).toEqual(['chorus', 'verse']);
    expect(sections[0].title.toLowerCase()).toBe('chorus');
    expect(sections[0].startLine).toBe(2);
    expect(sections[1].startLine).toBe(5);
  });

  test('reorderLyricSections preserves leading bibliographic preface', function() {
    const text = [
      'Cold Goodbye - Steve Ryan 28/9/2025',
      '',
      '[Chorus]',
      'hook line one',
      'hook line two',
      '',
      '[Verse]',
      'story line one',
      'story line two',
      'story line three',
      'story line four',
    ].join('\n');
    const sections = listLyricSections(text);
    expect(sections.map(function(s) { return s.type; })).toEqual(['chorus', 'verse']);
    const reordered = reorderLyricSections(text, 0, 2);
    expect(reordered.indexOf('Cold Goodbye - Steve Ryan 28/9/2025')).toBe(0);
    expect(reordered.indexOf('[Verse]')).toBeLessThan(reordered.indexOf('[Chorus]'));
    expect(reordered).toContain('hook line one');
    expect(reordered).toContain('story line one');
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
      // Labeled chorus infers remaining same-length blocks as verses.
      { title: 'Verse 2', startLine: 6 },
    ]);
  });

  test('sectionDisplayTitle cleans bracket and hash headers', function() {
    expect(sectionDisplayTitle({ header: '[Bridge]', lines: [] })).toBe('Bridge');
    expect(sectionDisplayTitle({ header: '# Verse 2', lines: [] })).toBe('Verse 2');
    expect(sectionDisplayTitle({ header: '(Outro)', lines: [] })).toBe('Outro');
    expect(sectionDisplayTitle({ header: '# chorus @1', lines: [] })).toBe('chorus');
    expect(sectionDisplayTitle({ header: '# instrumental @1 @2', lines: [] })).toBe('instrumental');
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
