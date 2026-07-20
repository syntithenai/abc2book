import {
  parseChordSheetText,
  exportTuneToChordPro,
  exportTuneToOnSong,
  normalizeOnSongText,
  tuneHasChordSheetContent,
  isChordSheetFilename,
  extractChordSheetPreambleMeta,
} from './chordProFormatUtils';
import { getBarModel, fullBarRestAbc } from './barModel';

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
    expect(parsed.lyricLines.join('\n')).toContain('[G]Amazing grace how [C]sweet the [G]sound');
    expect(parsed.chordText).toContain('G|');
    expect(parsed.chordProSource).toBe(sampleChordPro);
    expect(Array.isArray(parsed.chordSheetAlignment)).toBe(true);
    expect(parsed.chordSheetAlignment.length).toBeGreaterThan(0);
    expect(parsed.chordSheetAlignment[0].linePairs[0].anchors[0]).toMatchObject({
      chord: 'G',
      wordIndex: 0,
    });
    const stripped = parseChordSheetText(sampleChordPro, { preservePlacement: false });
    expect(stripped.lyricLines.join('\n')).not.toContain('[G]');
    expect(stripped.lyricLines.join('\n')).toContain('Amazing grace');
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
    expect(parsed.preservePlacement).toBe(true);
    // Preserve mode keeps chords-over-words rows in lyricLines.
    expect(parsed.lyricLines).toContain('Am    Dm    Dm    Am9');
    expect(parsed.lyricLines).toContain('The language of love');
    expect(parsed.lyricLines).toContain("Who's that girl");
    expect(parsed.lyricLines[0]).toBe('[Intro]');
    const stripped = parseChordSheetText(sample, {
      fallbackTitle: "Who's That Girl",
      preservePlacement: false,
    });
    expect(stripped.lyricLines).toEqual([
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
    const intro = parsed.chordSheetAlignment.find(function(block) {
      return block.header === '[Intro]';
    });
    expect(intro).toBeTruthy();
    expect(intro.linePairs[0].chordLines[0]).toContain('Am    Dm    Dm    Am9');
    const instrumental = parsed.chordSheetAlignment.find(function(block) {
      return block.header === '[Instrumental]';
    });
    expect(instrumental).toBeTruthy();
    expect(instrumental.linePairs[0].chordLines[0]).toContain('Am    G    Em    F  G');
  });

  test('skeleton rest length follows meter unit slots', function() {
    expect(fullBarRestAbc(getBarModel('6/8', null).unitSlotsPerBar)).toBe('|: z6 |]');
    expect(fullBarRestAbc(getBarModel('3/4', null).unitSlotsPerBar)).toBe('|: z6 |]');
    expect(fullBarRestAbc(getBarModel('4/4', null).unitSlotsPerBar)).toBe('|: z8 |]');
    expect(getBarModel('6/8', null).noteLength).toBe('1/8');
  });

  test('extractChordSheetPreambleMeta captures UG-style labeled preamble', function() {
    const lines = [
      "Title: Who's That Girl",
      'Artist: Eurythmics',
      'Key: Am',
      'Capo: 2',
      'Tempo: 120',
      'Time: 4/4',
      'Tuning: EADGBE',
      '',
      '[Intro]',
      'Am    Dm    Dm    Am9',
    ];
    const meta = extractChordSheetPreambleMeta(lines);
    expect(meta.title).toBe("Who's That Girl");
    expect(meta.composer).toBe('Eurythmics');
    expect(meta.key).toBe('Am');
    expect(meta.capo).toBe('2');
    expect(meta.tempo).toBe('120');
    expect(meta.meter).toBe('4/4');
    expect(meta.tuning).toBe('EADGBE');
    expect(meta.consumedLineIndexes).toEqual([0, 1, 2, 3, 4, 5, 6]);
    expect(meta.strippedLines[0]).toBe('');
    expect(meta.strippedLines).toContain('[Intro]');
    expect(meta.strippedLines.join('\n')).not.toContain('Title:');
  });

  test('parses chords-over-words preamble into draft meta and strips body lines', function() {
    const sample = `Song: Who's That Girl
By: Eurythmics
Tonality: Am
Capo 2
BPM: 118
Meter: 4/4
Tuning: Standard

[Intro]
Am    Dm    Dm    Am9

[Verse 1]
    Am
The language of love`;

    const parsed = parseChordSheetText(sample);
    expect(parsed.title).toBe("Who's That Girl");
    expect(parsed.composer).toBe('Eurythmics');
    expect(parsed.key).toBe('Am');
    expect(parsed.capo).toBe(2);
    expect(parsed.tempo).toBe(118);
    expect(parsed.meter).toBe('4/4');
    expect(parsed.tuning).toBe('Standard');
    expect(parsed.lyricLines).toContain('[Intro]');
    expect(parsed.lyricLines).toContain('Am    Dm    Dm    Am9');
    expect(parsed.lyricLines.join('\n')).not.toMatch(/Song:|By:|Tonality:|Capo|BPM:|Meter:|Tuning:/);
    expect(parsed.chordText).toContain('Am    Dm    Dm    Am9|');
  });

  test('maps ChordPro composer directive when present', function() {
    const sample = `{title: Test Song}
{composer: Jane Composer}
{artist: Band Name}
{key: C}
[C]Hello
`;
    const parsed = parseChordSheetText(sample);
    expect(parsed.title).toBe('Test Song');
    expect(parsed.composer).toBe('Jane Composer');
    expect(parsed.artists).toEqual(['Band Name']);
    expect(parsed.key).toBe('C');
  });

  test('maps duration copyright capo album from ChordPro directives', function() {
    const sample = `{title: Dreams}
{artist: Fleetwood Mac}
{composer: Fleetwood Mac}
{album: Rumours}
{year: 1977}
{time: 4:14}
{copyright: Warner}
{ci: Capo at 2nd fret}
{key: F}
[F]Hello
`;
    const parsed = parseChordSheetText(sample);
    expect(parsed.composer).toBe('Fleetwood Mac');
    expect(parsed.discography).toBe('Rumours (1977)');
    expect(parsed.lyricsScrollDurationSec).toBe(254);
    expect(parsed.tags).toEqual(['©']);
    expect(parsed.backgroundInfo).toContain('Copyright: Warner');
    expect(parsed.capo).toBe(2);
    expect(parsed.meter).toBe('4/4');
  });

  test('drops digit-led tempo braces like {164bpm} from lyrics and maps tempo', function() {
    const sample = `{title: Fast}
{164bpm}
[G]Run run run
`;
    const parsed = parseChordSheetText(sample);
    expect(parsed.lyricLines.join('\n')).not.toContain('164bpm');
    expect(parsed.lyricLines.join('\n')).toContain('[G]Run run run');
    expect(parsed.tempo).toBe(164);
  });

  test('drops hyphenated layout directives like zoom-ipad from lyrics', function() {
    const sample = `{title: Daisy}
{zoom-ipad: 3.008202}
{zoom-ipad 3.2}
{zoom-ipad:
{key: C}
[C]Daisy daisy
`;
    const parsed = parseChordSheetText(sample);
    expect(parsed.lyricLines.join('\n')).not.toContain('zoom-ipad');
    expect(parsed.lyricLines.join('\n')).toContain('[C]Daisy daisy');
  });

  test('does not treat lone chord tokens as preamble key meta', function() {
    const meta = extractChordSheetPreambleMeta(['G', 'Am', '[Verse]', 'hello']);
    expect(meta.key).toBe('');
    expect(meta.consumedLineIndexes).toEqual([]);
    expect(meta.strippedLines[0]).toBe('G');
  });
});
