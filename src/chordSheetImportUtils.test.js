import {
  buildChordSheetAlignmentFromLines,
  sheetLinesToEmbeddedLyricLines,
  sheetLinesToLyricLines,
} from './chordSheetImportUtils';

describe('chordSheetImportUtils', function() {
  test('sheetLinesToEmbeddedLyricLines keeps chords-over-words rows', function() {
    const embedded = sheetLinesToEmbeddedLyricLines([
      '[Verse]',
      'Am          G',
      'Today is gonna be the day',
    ])
    expect(embedded).toEqual([
      '[Verse]',
      'Am          G',
      'Today is gonna be the day',
    ])
  })

  test('sheetLinesToEmbeddedLyricLines keeps ChordPro inline markers', function() {
    expect(sheetLinesToEmbeddedLyricLines([
      '[Verse]',
      '[Am]Today is [G]gonna be the day',
    ])).toEqual([
      '[Verse]',
      '[Am]Today is [G]gonna be the day',
    ])
  })

  test('sheetLinesToEmbeddedLyricLines falls back to plain lyrics without chords', function() {
    expect(sheetLinesToEmbeddedLyricLines([
      '[Verse]',
      'Hello darkness my old friend',
    ])).toEqual([
      '[Verse]',
      'Hello darkness my old friend',
    ])
    expect(sheetLinesToLyricLines([
      'Am   G',
      'Hello',
    ])).toEqual(['Hello'])
  })

  test('buildChordSheetAlignmentFromLines maps chords onto a single lyric by offset', function() {
    const blocks = buildChordSheetAlignmentFromLines([
      '[Chorus]',
      'Am         G',
      "Who's that girl",
    ]);

    expect(blocks.length).toBe(1);
    expect(blocks[0].header).toBe('[Chorus]');
    expect(blocks[0].type).toBe('chorus');
    expect(blocks[0].linePairs.length).toBe(1);
    expect(blocks[0].linePairs[0].anchors.map(function(a) { return a.chord; })).toEqual(['Am', 'G']);
    expect(blocks[0].linePairs[0].anchors[0].wordIndex).toBe(0);
  });

  test('distributes one chord row across following lyric lines as a shared harmonic span', function() {
    const blocks = buildChordSheetAlignmentFromLines([
      'C       G       Am      F',
      'Twinkle twinkle little star',
      'How I wonder what you are',
    ]);

    expect(blocks.length).toBe(1);
    expect(blocks[0].linePairs.length).toBe(2);

    const first = blocks[0].linePairs[0];
    const second = blocks[0].linePairs[1];
    expect(first.chordLines).toEqual(['C       G       Am      F']);
    expect(second.chordLines).toEqual([]);
    expect(first.anchors.map(function(a) { return a.chord; })).toEqual(['C', 'G']);
    expect(second.anchors.map(function(a) { return a.chord; })).toEqual(['Am', 'F']);
    expect(first.anchors[0].word).toBe('Twinkle');
    expect(second.anchors[0].word).toBe('How');
    expect(first.anchors.length + second.anchors.length).toBe(4);
  });

  test('stops shared harmonic span at blank lines and new chord rows', function() {
    const blocks = buildChordSheetAlignmentFromLines([
      'C    G',
      'First line',
      'Second line',
      '',
      'Am   F',
      'After blank',
    ]);

    expect(blocks.length).toBe(2);
    expect(blocks[0].linePairs.length).toBe(2);
    expect(blocks[0].linePairs[0].anchors.map(function(a) { return a.chord; })).toEqual(['C']);
    expect(blocks[0].linePairs[1].anchors.map(function(a) { return a.chord; })).toEqual(['G']);
    expect(blocks[1].linePairs.length).toBe(1);
    expect(blocks[1].linePairs[0].anchors.map(function(a) { return a.chord; })).toEqual(['Am', 'F']);
  });

  test('keeps Intro/Outro and trailing chord-only lines across blank spacing', function() {
    const blocks = buildChordSheetAlignmentFromLines([
      '[Intro]',
      'G D G D',
      '',
      '',
      '[Verse 1]',
      '  G         G/F#    G',
      'Get you a copper kettle',
      '',
      '[Chorus]',
      '   C                     G',
      'You just lay there by the juniper',
      '   Am            G',
      'In the pale moonlight',
      '',
      'C  Em7  Am  G',
      '',
      '',
      '[Outro]',
      '',
      'C  Em7  Am  G',
    ]);

    expect(blocks.map(function(b) { return b.header; })).toEqual([
      '[Intro]',
      '[Verse 1]',
      '[Chorus]',
      '[Outro]',
    ]);
    expect(blocks[0].linePairs[0].chordLines[0]).toContain('G D G D');
    expect(blocks[0].lines).toEqual([]);
    const chorusChordLines = blocks[2].linePairs.flatMap(function(p) { return p.chordLines || []; });
    expect(chorusChordLines.some(function(line) { return /C\s+Em7\s+Am\s+G/.test(line); })).toBe(true);
    expect(blocks[3].linePairs[0].chordLines[0]).toMatch(/C\s+Em7\s+Am\s+G/);
  });

  test('Copper Kettle paste keeps all section headers and chorus turnaround', function() {
    const { parseChordSheetText } = require('./chordProFormatUtils');
    const { listPasteChordSections } = require('./chordsEditorSections');
    const sample = [
      '[Intro]',
      'G D G D',
      '',
      '',
      '[Verse 1]',
      '  G         G/F#    G',
      'Get you a copper kettle',
      '  G         D     G',
      'Get you a copper coil',
      '',
      '[Chorus]',
      '   C                     G',
      'You just lay there by the juniper',
      '   Am            G',
      'In the pale moonlight',
      '',
      'C  Em7  Am  G',
      '',
      '',
      '[Verse 2]',
      '   G         G/F#      G',
      'Build you a fire with hickory',
      '',
      '[Chorus]',
      '   C                     G',
      'You just lay there by the juniper',
      '',
      'C  Em7  Am  G',
      '',
      '[Outro]',
      '',
      'C  Em7  Am  G',
    ].join('\n');

    const parsed = parseChordSheetText(sample, { fallbackTitle: 'Copper Kettle' });
    const sections = listPasteChordSections(parsed);
    expect(sections.map(function(s) { return s.title; })).toEqual([
      'Intro',
      'Verse 1',
      'Chorus',
      'Verse 2',
      'Chorus',
      'Outro',
    ]);
    expect(sections[0].chart).toMatch(/G\s+D\s+G\s+D/);
    expect(sections[2].chart).toMatch(/C\s+Em7\s+Am\s+G/);
    expect(sections[5].chart).toMatch(/C\s+Em7\s+Am\s+G/);
  });
});
