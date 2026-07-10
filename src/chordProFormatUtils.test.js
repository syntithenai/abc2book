import {
  parseChordSheetText,
  exportTuneToChordPro,
  exportTuneToOnSong,
  normalizeOnSongText,
  tuneHasChordSheetContent,
  isChordSheetFilename,
} from './chordProFormatUtils';

describe('chordProFormatUtils', function() {
  const sampleChordPro = `{title: Amazing Grace}
{subtitle: John Newton}
{key: G}
{capo: 3}
{c: Verse 1}
[G]Amazing grace how [C]sweet the [G]sound
`;

  test('normalizes OnSong double-brace metadata', function() {
    expect(normalizeOnSongText('{{title: Foo}}')).toBe('{title: Foo}');
  });

  test('detects chord sheet filenames', function() {
    expect(isChordSheetFilename('song.cho')).toBe(true);
    expect(isChordSheetFilename('song.onsong')).toBe(true);
    expect(isChordSheetFilename('song.abc')).toBe(false);
  });

  test('parses ChordPro metadata and lines', function() {
    const parsed = parseChordSheetText(sampleChordPro);
    expect(parsed.title).toBe('Amazing Grace');
    expect(parsed.composer).toBe('John Newton');
    expect(parsed.key).toBe('G');
    expect(parsed.capo).toBe(3);
    expect(parsed.lyricLines.join('\n')).toContain('Verse 1');
    expect(parsed.chordText).toContain('G|');
    expect(parsed.chordProSource).toBe(sampleChordPro);
    expect(Array.isArray(parsed.chordSheetAlignment)).toBe(true);
    expect(parsed.chordSheetAlignment.length).toBeGreaterThan(0);
    expect(parsed.chordSheetAlignment[0].linePairs[0].anchors[0]).toMatchObject({
      chord: 'G',
      wordIndex: 0,
    });
  });

  test('exports and round-trips ChordPro', function() {
    const parsed = parseChordSheetText(sampleChordPro);
    const tune = {
      name: parsed.title,
      composer: parsed.composer,
      key: parsed.key,
      capo: parsed.capo,
      tempo: 100,
      meter: '4/4',
      wLines: parsed.lyricLines,
      meta: { chordProSource: sampleChordPro },
    };
    expect(tuneHasChordSheetContent(tune)).toBe(true);
    const exported = exportTuneToChordPro(tune);
    expect(exported).toContain('{title: Amazing Grace}');
    const reparsed = parseChordSheetText(exported);
    expect(reparsed.title).toBe('Amazing Grace');
    expect(reparsed.composer).toBe('John Newton');
  });

  test('exports OnSong with double-brace headers', function() {
    const tune = {
      name: 'Test',
      composer: 'Artist',
      wLines: ['[G]Hello world'],
      meta: {},
    };
    const onsong = exportTuneToOnSong(tune);
    expect(onsong).toContain('{{title:Test}}');
    expect(onsong).toContain('{{subtitle:Artist}}');
  });

  test('parses Ultimate Guitar style sectioned chord-over-words paste', function() {
    const sample = `[Intro]
Am    Dm    Dm    Am9

[Verse 1]
    Am
The language of love
      F               Dm
Slips from my lover's tongue

[Pre-Chorus]
            F
But there's just one thing
 Am/E
(Just one thing)

[Chorus]
Am         G
Who's that girl
Em                  F
Running around with you
G
Tell me

[Instrumental]
Am    G    Em    F  G`;

    const parsed = parseChordSheetText(sample, { fallbackTitle: "Who's That Girl" });
    expect(parsed.title).toBe("Who's That Girl");
    expect(parsed.lyricLines).toEqual([
      '[Intro]',
      '',
      '[Verse 1]',
      'The language of love',
      "Slips from my lover's tongue",
      '',
      '[Pre-Chorus]',
      "But there's just one thing",
      '(Just one thing)',
      '',
      '[Chorus]',
      "Who's that girl",
      'Running around with you',
      'Tell me',
      '',
      '[Instrumental]',
    ]);
    expect(parsed.chordText).toContain('Am    Dm    Dm    Am9|');
    expect(parsed.chordText).toContain('Am/E|');
    expect(parsed.chordText).toContain('Am    G    Em    F  G|');
    expect(parsed.sectionCount).toBeGreaterThanOrEqual(5);
    expect(parsed.chordSheetAlignment.some(function(block) {
      return block.header === '[Chorus]';
    })).toBe(true);
  });
});
