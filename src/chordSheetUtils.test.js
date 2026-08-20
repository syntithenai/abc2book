import { tokenIsChord, isChordLine, isMostlyChordLine, isSectionHeader, isLyricVersionSeparator, truncateLyricLinesAtVersionSeparator, classifyLyricChordLines, hasChordLines, hasLyricEmbeddedChords, linesHaveChordProInlineChords, parseChordProInlineLyricLine, stripChordsFromLyricLines, stripLyricBeatMarkersPreservingChordPro, lyricLinesHaveBeatMarkers, splitIntoBlocks, coalesceSectionHeaderBlocks, splitBlocksOnInteriorHeaders, normalizeLyricBlocks, shouldSoftJoinSingleBlanks, normalizeSectionType, inferSectionTypesFromLineCounts, inferSectionTypesFromChartFingerprints, chordChartFingerprint, isLeadingTitleComposerLine, stripLeadingBibliographicLyricPreface, splitChordChartIntoBlocks, alignChordBlocksToLyrics, mergeAlignedLyricBlockChords, extractChordSequence, extractChordBars, buildUniqueChordsMap, mergeChordsIntoLyricLines, expandRepeatedSectionLyrics, lyricRepeatLookupKey, applyChordProPatternToLine, applyRepeatedSectionChordPro, chartBlockHasChords, fillEmptyBarsWithSlash, formatChordChartForDisplay, expandHeldChordsForDisplay, formatBeatSoundingForDisplay, collapseSoundingToBeats, charOffsetToWordIndex, normalizeChordChartRepeatMarks, wrapChordGridBars, stripChartStructureMarkers, parseChartStructureMarkers, decorateChartWithRepeatMarks, formatSectionChartForEditor, parseSectionChartFromEditor, splitChordChartLineIntoBars, ensureLeadingMeterMarker, parseChordChartDisplayLine } from './chordSheetUtils';
import { normalizeLyricStructure } from './lyricStructureUtils';

describe('chordSheetUtils', function() {
  test('recognises chord tokens', function() {
    ['C', 'Bb', 'C7', 'Dm/C', 'Gm7', 'A7', 'F#m', 'Am/E', 'Am9'].forEach(function(c) {
      expect(tokenIsChord(c)).toBe(true);
    });
    ['I', 'really', 'like', 'Christmas', 'Oh'].forEach(function(w) {
      expect(tokenIsChord(w)).toBe(false);
    });
  });

  test('ensureLeadingMeterMarker prepends header metre when missing', function() {
    expect(ensureLeadingMeterMarker('Dm / / Cm / |', '5/4')).toBe('[M:5/4] Dm / / Cm / |');
    expect(ensureLeadingMeterMarker('[M:4/4] F |', '5/4')).toBe('[M:4/4] F |');
    expect(ensureLeadingMeterMarker('', '5/4')).toBe('');
  });

  test('parseChordChartDisplayLine extracts stacked metre parts', function() {
    const parts = parseChordChartDisplayLine('[M:5/4] Dm / / Cm / |');
    expect(parts[0]).toEqual({
      type: 'meter',
      label: '5/4',
      num: '5',
      den: '4',
      text: '[M:5/4]',
    });
    expect(parts.some(function(p) { return p.type === 'text' && /Dm/.test(p.text); })).toBe(true);
  });

  test('identifies chord-only lines', function() {
    expect(isChordLine('F')).toBe(true);
    expect(isChordLine('Bb                               F')).toBe(true);
    expect(isChordLine('C7                    A7           Dm')).toBe(true);
    expect(isChordLine('Bflat7 C7')).toBe(true);
    expect(isChordLine('(Am E Am Am) x 4')).toBe(true);
    expect(isChordLine('D G x 4')).toBe(true);
    expect(isChordLine('A7 X 3')).toBe(true);
    expect(isChordLine('I really like Christmas')).toBe(false);
    expect(isChordLine('')).toBe(false);
  });

  test('isMostlyChordLine accepts majority-chord lines with stray words', function() {
    expect(isMostlyChordLine('C  yeah  G  Am')).toBe(true);
    expect(isMostlyChordLine('C G Am F')).toBe(true);
    expect(isMostlyChordLine('I really like Christmas')).toBe(false);
    expect(isMostlyChordLine('C yeah')).toBe(false); // only one chord
    expect(isChordLine('C  yeah  G  Am')).toBe(false); // strict still rejects
  });

  test('classifyLyricChordLines uses soft majority for mixed chord lines', function() {
    const classified = classifyLyricChordLines(['C  yeah  G  Am', 'sing these words']);
    expect(classified[0].type).toBe('chord');
    expect(classified[1].type).toBe('lyric');
  });

  test('identifies section headers', function() {
    expect(isSectionHeader('[Verse 1]')).toBe(true);
    expect(isSectionHeader('[Chorus]')).toBe(true);
    expect(isSectionHeader('Bridge')).toBe(true);
    expect(isSectionHeader('intro')).toBe(true);
    expect(isSectionHeader('v1')).toBe(true);
    expect(isSectionHeader('V2')).toBe(true);
    expect(isSectionHeader('I really like Christmas')).toBe(false);
    expect(isSectionHeader('[Am]')).toBe(false);
    expect(isSectionHeader('[F#m7]')).toBe(false);
    expect(isSectionHeader('[C/G]')).toBe(false);
  });

  test('does not treat ChordPro lyric lines as section headers', function() {
    expect(isSectionHeader('[G]Amazing grace [C]')).toBe(false);
    expect(isSectionHeader('[C] [G]')).toBe(false);
    expect(isSectionHeader('[G]hello [Am] [C]')).toBe(false);
    expect(isSectionHeader('[G]Amazing grace how [C]sweet')).toBe(false);
    expect(isSectionHeader('[Verse 1]')).toBe(true);
    expect(isSectionHeader('[Chorus]')).toBe(true);
    expect(isSectionHeader('[Am]')).toBe(false);
    const classified = classifyLyricChordLines([
      '[Verse]',
      '[G]Amazing grace [C]',
      '[C] [G]',
    ]);
    expect(classified.map(function(item) { return item.type; })).toEqual([
      'header',
      'lyric',
      'lyric',
    ]);
  });

  test('identifies bar-dot chord grids', function() {
    expect(isChordLine('||C . . | F . . |')).toBe(true);
    expect(isChordLine('C . . . | G . . . |')).toBe(true);
    expect(classifyLyricChordLines(['||C . . | F . . |', 'sing here'])[0].type).toBe('chord');
  });

  test('normalizeSectionType maps v1 to verse', function() {
    expect(normalizeSectionType('v1')).toBe('verse');
    expect(normalizeSectionType('[V2]')).toBe('verse');
    expect(normalizeSectionType('Verse2')).toBe('verse');
    expect(normalizeSectionType('[Verse2]')).toBe('verse');
    expect(normalizeSectionType('verse-2')).toBe('verse');
  });

  test('normalizeSectionType treats minichorus as its own stanza type', function() {
    expect(normalizeSectionType('# minichorus')).toBe('minichorus');
    expect(normalizeSectionType('# Mini-Chorus')).toBe('minichorus');
    expect(normalizeSectionType('# mini chorus')).toBe('minichorus');
    expect(isSectionHeader('# minichorus')).toBe(true);
    expect(isSectionHeader('Minichorus')).toBe(true);
    const { stanzaNameSimilarity } = require('./chordSheetUtils');
    expect(stanzaNameSimilarity('minichorus', 'chorus')).toBeLessThan(0.85);
    expect(stanzaNameSimilarity('mini chorus', 'chorus')).toBeLessThan(0.85);
    expect(stanzaNameSimilarity('Verse 1', 'Verse')).toBeGreaterThanOrEqual(0.85);
  });

  test('wrapChordGridBars wraps every 8 bars and keeps section blanks', function() {
    const twelve = 'C | G | Am | F | C | G | Am | F | C | G | Am | F |';
    const wrapped = wrapChordGridBars(twelve, 8);
    expect(wrapped.split('\n')).toHaveLength(2);
    expect(wrapChordGridBars('C | G |\n\nAm | F |', 8).split('\n\n')).toHaveLength(2);
  });

  test('splitIntoBlocks soft-joins single blanks when double blanks separate stanzas', function() {
    const lines = [
      'line one',
      '',
      'line two',
      '',
      '',
      'stanza two',
    ];
    expect(splitIntoBlocks(lines)).toEqual([
      ['line one', 'line two'],
      ['stanza two'],
    ]);
  });

  test('identifies markdown-style "#" section headers', function() {
    expect(isSectionHeader('# Verse')).toBe(true);
    expect(isSectionHeader('# Verse 2')).toBe(true);
    expect(isSectionHeader('#Chorus')).toBe(true);
    expect(isSectionHeader('## Bridge')).toBe(true);
    expect(isSectionHeader('# Intro (x 2)')).toBe(true);
    expect(isSectionHeader('# Interlude (x 1)')).toBe(true);
    expect(isSectionHeader('# Verse 3 (x 2)')).toBe(true);
    expect(isSectionHeader('# Guitar Verse')).toBe(true);
    expect(isSectionHeader('– solo')).toBe(true);
    expect(isSectionHeader('- Instrumental')).toBe(true);
    expect(isSectionHeader('— Solo (x 2)')).toBe(true);
    expect(isSectionHeader('# I really like Christmas')).toBe(true);
    expect(isSectionHeader('[]')).toBe(true);
    expect(isSectionHeader('#')).toBe(true);
    expect(isSectionHeader('# @1')).toBe(true);
    expect(isSectionHeader('# @2')).toBe(true);
    expect(isSectionHeader('first verse words here')).toBe(false);
  });

  test('recognises hash section headers with optional meter and without a space after #', function() {
    expect(isSectionHeader('# bridge  3/4')).toBe(true);
    expect(isSectionHeader('#bridge  3/4')).toBe(true);
    expect(isSectionHeader('#bridge 3/4')).toBe(true);
    expect(isSectionHeader('#verse 4/4')).toBe(true);
    expect(isSectionHeader('#chorus 6/8')).toBe(true);
    expect(normalizeSectionType('#bridge  3/4')).toBe('bridge');
    expect(normalizeSectionType('# bridge  3/4')).toBe('bridge');
    expect(normalizeSectionType('#verse 4/4')).toBe('verse');
  });

  test('splitBlocksOnInteriorHeaders separates consecutive section markers', function() {
    const blocks = splitIntoBlocks(['# Verse 3', '– solo', '', '# Chorus 3', 'sing']);
    expect(splitBlocksOnInteriorHeaders(blocks)).toEqual([
      ['# Verse 3'],
      ['– solo'],
      ['# Chorus 3', 'sing'],
    ]);
  });

  test('normalizeLyricBlocks merges mid-verse blanks before a later section header', function() {
    const lyrics = [
      '# Verse I',
      'first half one',
      'first half two',
      '',
      'second half one',
      'second half two',
      '',
      '# Chorus',
      'hook line one',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['# Verse I', 'first half one', 'first half two', '', 'second half one', 'second half two'],
      ['# Chorus', 'hook line one'],
    ]);
  });

  test('normalizeLyricBlocks keeps a blank before a mid-verse tag line (Howdy Howdy)', function() {
    const lyrics = [
      '# verse @1',
      'Tell me what did the riddle say to the song?',
      "The Devil he's blowing reveille and we ain't got long",
      "Let's play the Spider Bit The Baby-O",
      'Last time, last rhyme, one more for the road',
      '',
      'One more for the road',
      '# chorus @3',
      'You and me are always gonna be howdy howdy',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      [
        '# verse @1',
        'Tell me what did the riddle say to the song?',
        "The Devil he's blowing reveille and we ain't got long",
        "Let's play the Spider Bit The Baby-O",
        'Last time, last rhyme, one more for the road',
        '',
        'One more for the road',
      ],
      [
        '# chorus @3',
        'You and me are always gonna be howdy howdy',
      ],
    ]);
  });

  test('normalizeLyricBlocks does not absorb unlabeled verses into a labeled chorus', function() {
    const lyrics = [
      'verse one a',
      'verse one b',
      'verse one c',
      'verse one d',
      '',
      '# CHORUS',
      'hook a',
      'hook b',
      'hook c',
      'hook d',
      '',
      'verse two a',
      'verse two b',
      'verse two c',
      'verse two d',
      '',
      '# CHORUS',
      'hook a',
      'hook b',
      'hook c',
      'hook d',
      '',
      'hook a',
      'hook b',
      'hook c',
      'hook d',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['verse one a', 'verse one b', 'verse one c', 'verse one d'],
      ['# CHORUS', 'hook a', 'hook b', 'hook c', 'hook d'],
      ['verse two a', 'verse two b', 'verse two c', 'verse two d'],
      ['# CHORUS', 'hook a', 'hook b', 'hook c', 'hook d'],
      ['hook a', 'hook b', 'hook c', 'hook d'],
    ]);
  });

  test('normalizeLyricBlocks keeps verses separate when a double blank follows the title (Ripples)', function() {
    const chorus = [
      'Wibble wobble wending warp',
      'Precocious paths parading',
      'Historic hints highlight the way to the',
      "here and now we're making",
    ];
    const lyrics = [
      'Ripples - Steve Ryan 08/10/2024  (word=ripple, + earworm)',
      '',
      '',
      'Mum would sit with, me each morning, for a tinkle, on the keys',
      'From /such beginnings my teen band it used to cover ACDC',
      'To The Pogues and the tunes and a festival life that fired in me a spark',
      'Now my bestest friends are those who, I can jam it out with',
      '',
      '# CHORUS',
    ].concat(chorus).concat([
      '',
      'Little Elon raised in Africa, he learned survivors  ways. At',
      'nine, he lost his mummy when his folks went seperate ways',
      'Veldskool and machismo pa, he learned he had to fight',
      'Step over others on the way to psychopathic president Musk',
      '',
      '# CHORUS',
    ]).concat(chorus).concat(['']).concat(chorus);

    expect(normalizeLyricBlocks(lyrics).map(function(b) {
      return { header: isSectionHeader(b[0]) ? b[0] : null, n: b.length };
    })).toEqual([
      { header: null, n: 1 },
      { header: null, n: 4 },
      { header: '# CHORUS', n: 5 },
      { header: null, n: 4 },
      { header: '# CHORUS', n: 5 },
      { header: null, n: 4 },
    ]);

    const aligned = alignChordBlocksToLyrics(lyrics, [
      '"Dm"zzzzzzzz|"C"zzzzzzzz||',
      '"Dm"zzzz"F"zzzz||',
    ], { title: 'Ripples', composer: 'Steve Ryan' });
    expect(aligned.map(function(b) { return { type: b.type, n: b.lyricLines.length }; })).toEqual([
      { type: 'verse', n: 4 },
      { type: 'chorus', n: 4 },
      { type: 'verse', n: 4 },
      { type: 'chorus', n: 4 },
      { type: 'chorus', n: 4 },
    ]);
  });

  test('normalizeLyricBlocks leaves trailing unlabeled blocks after the last header', function() {
    const lyrics = [
      '[Verse 1]',
      'verse words',
      '',
      'outro words with no section header',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['[Verse 1]', 'verse words'],
      ['outro words with no section header'],
    ]);
  });

  test('normalizeLyricBlocks does not absorb verses into bare chorus markers', function() {
    const lyrics = [
      'With a hundred pipers, and all, and all',
      'With a hundred pipers, and all, and all',
      '',
      'Oh it is over the border away, away',
      'We will march to Carlisle Hall',
      '',
      '(chorus)',
      '',
      'Oh our soldier lads looked stout, looked stout',
      'With their tartan kilts and all, and all',
      '',
      '(chorus)',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['With a hundred pipers, and all, and all', 'With a hundred pipers, and all, and all'],
      ['Oh it is over the border away, away', 'We will march to Carlisle Hall'],
      ['(chorus)'],
      ['Oh our soldier lads looked stout, looked stout', 'With their tartan kilts and all, and all'],
      ['(chorus)'],
    ]);
  });

  test('normalizeLyricBlocks handles dash-prefixed solo after another header', function() {
    const lyrics = ['# Verse 3', '– solo', '', '# Chorus 3', 'chorus line'];
    const aligned = alignChordBlocksToLyrics(lyrics, ['V3', 'SOLO', 'C3']);
    expect(aligned[0].header).toBe('# Verse 3');
    expect(aligned[1].header).toBe('– solo');
    expect(aligned[2].header).toBe('# Chorus 3');
    expect(aligned[2].lyricLines).toEqual(['chorus line']);
  });

  test('normalizeLyricBlocks does not peel a shorter stanza out of a longer unlabeled block', function() {
    const lyrics = [
      'hook line one', 'hook line two', 'hook line three', '',
      'verse two line a', 'verse two line b',
      'hook line one', 'hook line two', 'hook line three',
      'verse three line a', 'verse three line b',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['hook line one', 'hook line two', 'hook line three'],
      [
        'verse two line a', 'verse two line b',
        'hook line one', 'hook line two', 'hook line three',
        'verse three line a', 'verse three line b',
      ],
    ]);
  });

  test('normalizeLyricBlocks peels a full chorus suffix off a labeled verse', function() {
    const lyrics = [
      '[Chorus]',
      'hook line one', 'hook line two', '',
      '[Verse 2]',
      'verse two line a', 'verse two line b',
      'hook line one', 'hook line two',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['[Chorus]', 'hook line one', 'hook line two'],
      ['[Verse 2]', 'verse two line a', 'verse two line b'],
      ['hook line one', 'hook line two'],
    ]);
  });

  test('normalizeLyricBlocks does not carve a minichorus hook out of a labeled full chorus', function() {
    const lyrics = [
      '# minichorus',
      "And a rovin' a rovin' a rovin' I'll go",
      'For a pair of brown eyes',
      '',
      '# chorus',
      "And a rovin' a rovin' a rovin' I'll go",
      "And a rovin' a rovin' a rovin' I'll go",
      "And a rovin' a rovin' a rovin' I'll go",
      'For a pair of brown eyes',
      'For a pair of brown eyes',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['# minichorus', "And a rovin' a rovin' a rovin' I'll go", 'For a pair of brown eyes'],
      [
        '# chorus',
        "And a rovin' a rovin' a rovin' I'll go",
        "And a rovin' a rovin' a rovin' I'll go",
        "And a rovin' a rovin' a rovin' I'll go",
        'For a pair of brown eyes',
        'For a pair of brown eyes',
      ],
    ]);
  });

  test('normalizeLyricBlocks leaves a block alone when it merely equals an earlier stanza', function() {
    const lyrics = [
      'hook line one', 'hook line two', '',
      'hook line one', 'hook line two',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['hook line one', 'hook line two'],
      ['hook line one', 'hook line two'],
    ]);
  });

  test('coalesceSectionHeaderBlocks attaches headers separated by blank lines', function() {
    const blocks = splitIntoBlocks(['# Verse 1', '', 'first line', 'second line']);
    expect(coalesceSectionHeaderBlocks(blocks)).toEqual([
      ['# Verse 1', 'first line', 'second line'],
    ]);
    const introThenVerse = splitIntoBlocks(['# Intro (x 2)', '', '# Verse 1', '', 'sing this']);
    expect(coalesceSectionHeaderBlocks(introThenVerse)).toEqual([
      ['# Intro (x 2)'],
      ['# Verse 1', 'sing this'],
    ]);
  });

  test('alignChordBlocksToLyrics keeps headers with lyrics after a blank line', function() {
    const lyrics = ['# Verse 1', '', 'first verse line', '', '# Chorus 1', '', 'chorus line'];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS']);
    expect(aligned[0].header).toBe('# Verse 1');
    expect(aligned[0].lyricLines).toEqual(['first verse line']);
    expect(aligned[1].header).toBe('# Chorus 1');
    expect(aligned[1].lyricLines).toEqual(['chorus line']);
  });

  test('identifies lyric version separators', function() {
    expect(isLyricVersionSeparator('--------------')).toBe(true);
    expect(isLyricVersionSeparator('============')).toBe(true);
    expect(isLyricVersionSeparator('----')).toBe(true);
    expect(isLyricVersionSeparator('---')).toBe(false);
    expect(isLyricVersionSeparator('Verse 1')).toBe(false);
    expect(isLyricVersionSeparator('')).toBe(false);
  });

  test('truncates lyric lines at version separator', function() {
    const lines = [
      'First version line 1',
      'First version line 2',
      '--------------',
      'Second version line 1',
    ];
    expect(truncateLyricLinesAtVersionSeparator(lines)).toEqual([
      'First version line 1',
      'First version line 2',
    ]);
  });

  test('normalizeSectionType groups "#" headers with their plain form', function() {
    expect(normalizeSectionType('# Verse')).toBe('verse');
    expect(normalizeSectionType('## Chorus')).toBe('chorus');
    expect(normalizeSectionType('# Bridge')).toBe('bridge');
  });

  test('classifies a full chord/lyric sheet preserving blocks and all words', function() {
    const sheet = [
      '[Verse 1]',
      'F',
      'I really like Christmas',
      'Bb                               F',
      "It's sentimental I know, but I just really like it",
      '',
      '[Verse 2]',
      'F',
      "I don't go in for ancient wisdom",
    ];
    const result = classifyLyricChordLines(sheet);
    expect(result.map(function(r) { return r.type; })).toEqual([
      'header', 'chord', 'lyric', 'chord', 'lyric', 'blank', 'header', 'chord', 'lyric',
    ]);
    // every line is preserved (nothing dropped)
    expect(result.length).toBe(sheet.length);
    // chord-line whitespace alignment is preserved verbatim
    expect(result[3].text).toBe('Bb                               F');
    expect(result[2].tokens.map(function(token) { return token.text; })).toEqual(['I', 'really', 'like', 'Christmas']);
    expect(result[2].tokens[3].start).toBeGreaterThan(result[2].tokens[2].start);
    expect(hasChordLines(sheet)).toBe(true);
  });

  test('charOffsetToWordIndex maps a chord-space offset to the nearest lyric word', function() {
    expect(charOffsetToWordIndex('I really like Christmas', 0)).toBe(0);
    expect(charOffsetToWordIndex('I really like Christmas', 10)).toBe(2);
    expect(charOffsetToWordIndex('I really like Christmas', 100)).toBe(3);
  });

  test('plain lyrics report no chord lines', function() {
    const plain = ['Twinkle twinkle little star', 'How I wonder what you are'];
    expect(hasChordLines(plain)).toBe(false);
  });

  test('detects and tokenizes ChordPro inline lyric chords', function() {
    const line = '[G]Amazing grace how [C]sweet the [G]sound';
    expect(linesHaveChordProInlineChords([line])).toBe(true);
    expect(hasLyricEmbeddedChords([line])).toBe(true);
    expect(hasChordLines([line])).toBe(false);
    expect(parseChordProInlineLyricLine(line)).toEqual([
      { chord: 'G', text: 'Amazing grace how ' },
      { chord: 'C', text: 'sweet the ' },
      { chord: 'G', text: 'sound' },
    ]);
    expect(parseChordProInlineLyricLine('[Am]')).toEqual([
      { chord: 'Am', text: '' },
    ]);
  });

  test('stripLyricBeatMarkersPreservingChordPro keeps ChordPro and slash chords', function() {
    expect(stripLyricBeatMarkersPreservingChordPro([
      '[Verse]',
      '[G]a/mazing /grace how /sweet',
      '[Dm/C]hello /there',
      'C | / | G',
      '',
      'plain /line',
    ])).toEqual([
      '[Verse]',
      '[G]amazing grace how sweet',
      '[Dm/C]hello there',
      'C | / | G',
      '',
      'plain line',
    ])
    expect(lyricLinesHaveBeatMarkers(['[G]a/mazing /grace'])).toBe(true)
    expect(lyricLinesHaveBeatMarkers(['[Dm/C]hello there'])).toBe(false)
    expect(lyricLinesHaveBeatMarkers(['C | / | G'])).toBe(false)
  })

  test('stripChordsFromLyricLines removes chord rows and inline ChordPro markers', function() {
    const lines = [
      '[Verse]',
      'C G Am',
      '[G]Amazing grace how [C]sweet the [G]sound',
      '[Am]',
      '',
      'Plain lyrics only',
    ];
    expect(stripChordsFromLyricLines(lines)).toEqual([
      '[Verse]',
      'Amazing grace how sweet the sound',
      '',
      'Plain lyrics only',
    ]);
  });

  test('splitIntoBlocks groups lines on blank lines', function() {
    // Legacy: only single blanks → each blank starts a block
    expect(splitIntoBlocks(['a', 'b', '', 'c', '', 'd'])).toEqual([['a', 'b'], ['c'], ['d']]);
    // Double-blank stanza sheet: single blanks soft-join verse lines
    expect(splitIntoBlocks(['a', 'b', '', 'c', '', '', 'd'])).toEqual([['a', 'b', 'c'], ['d']]);
  });

  test('splitIntoBlocks soft-joins per-line double-spaced verses', function() {
    const doubledVerse = [
      'There were rooms of forgiveness',
      '',
      'In the house that we share',
      '',
      'But the space has been emptied',
      '',
      'Of whatever was there',
      '',
      '[Chorus]',
      '',
      'After today, consider me gone',
      '',
      '[Verse 2]',
      '',
      'Roses have thorns, and shining waters mud',
      '',
      'Clouds and eclipses stain the moon and the sun',
    ];
    expect(splitIntoBlocks(doubledVerse)).toEqual([
      doubledVerse.filter(function(line) { return String(line || '').trim().length > 0; }),
    ]);
    const blocks = normalizeLyricBlocks(doubledVerse);
    expect(blocks).toEqual([
      [
        'There were rooms of forgiveness',
        'In the house that we share',
        'But the space has been emptied',
        'Of whatever was there',
      ],
      ['[Chorus]', 'After today, consider me gone'],
      ['[Verse 2]', 'Roses have thorns, and shining waters mud', 'Clouds and eclipses stain the moon and the sun'],
    ]);
    const structure = normalizeLyricStructure(doubledVerse);
    expect(structure.length).toBe(3);
    expect(structure[0].lines.length).toBe(4);
    expect(structure[1].type).toBe('chorus');
  });

  test('shouldSoftJoinSingleBlanks distinguishes legacy from per-line doubling', function() {
    const { shouldSoftJoinSingleBlanks } = require('./chordSheetUtils');
    expect(shouldSoftJoinSingleBlanks(['a', 'b', '', 'c', '', 'd'])).toBe(false);
    expect(shouldSoftJoinSingleBlanks(['a', '', 'b', '', 'c'])).toBe(false);
    expect(shouldSoftJoinSingleBlanks(['a', '', 'b', '', 'c', '', 'd'])).toBe(true);
    expect(shouldSoftJoinSingleBlanks(['a', 'b', '', 'c', '', '', 'd'])).toBe(true);
    // Title double-blank + multi-line stanzas + # Chorus must not soft-join.
    expect(shouldSoftJoinSingleBlanks([
      'Ripples - Steve Ryan 08/10/2024',
      '',
      '',
      'verse line one',
      'verse line two',
      '',
      '# CHORUS',
      'hook one',
      'hook two',
    ])).toBe(false);
  });

  test('normalizeSectionType groups repeated sections', function() {
    expect(normalizeSectionType('[Verse 1]')).toBe('verse');
    expect(normalizeSectionType('[Verse 2]')).toBe('verse');
    expect(normalizeSectionType('Chorus')).toBe('chorus');
    expect(normalizeSectionType('[Bridge]')).toBe('bridge');
    expect(normalizeSectionType('Pre-Chorus')).toBe('prechorus');
  });

  test('identifies leading title/composer preface lines', function() {
    expect(isLeadingTitleComposerLine('Drinking White Wine In The Sun - Tim Minchin', {
      title: 'Drinking White Wine In The Sun',
      composer: 'Tim Minchin',
    })).toBe(true);
    expect(isLeadingTitleComposerLine('[Verse 1]', {
      title: 'Verse',
      composer: 'Someone',
    })).toBe(false);
  });

  test('identifies whitespace-separated title/composer/date first lines as preface', function() {
    expect(isLeadingTitleComposerLine('AI Opium Pipe - Steve Ryan 2024', {
      firstBlockLineCount: 1,
    })).toBe(true);
    expect(isLeadingTitleComposerLine('Acid Charlotte Lyngbye (2019)', {
      firstBlockLineCount: 1,
    })).toBe(true);
    expect(isLeadingTitleComposerLine('Since the earliest of days', {
      firstBlockLineCount: 1,
    })).toBe(false);
    // Title sung as first line of a multi-line stanza must stay.
    expect(isLeadingTitleComposerLine('Thula Mama', {
      title: 'Thula Mama',
      firstBlockLineCount: 3,
    })).toBe(false);
  });

  test('stripLeadingBibliographicLyricPreface drops blank-separated meta line', function() {
    const stripped = stripLeadingBibliographicLyricPreface([
      'Song Title - Artist Name 2020',
      '',
      'first real lyric line',
      '',
      'second lyric line',
    ]);
    expect(stripped[0]).toBe('first real lyric line');
    expect(stripped).not.toContain('Song Title - Artist Name 2020');
  });

  test('leading title/composer/date line does not consume first chord block', function() {
    const lyrics = [
      'Song Title - Composer Name 2018', '',
      '[Verse 1]', 'first verse words', '',
      '[Chorus]', 'chorus words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS']);
    expect(aligned.length).toBe(2);
    expect(aligned[0].prefaceLines).toEqual(['Song Title - Composer Name 2018']);
    expect(aligned[0]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS' });
    expect(aligned[1]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS' });
  });

  test('splitChordChartIntoBlocks splits at the blank lines emitted for double barlines', function() {
    const chart = 'F | F | Bb | F |\nBb | F | C |\n\nBb | F | Gm | C |\n\nGm | C | F |';
    expect(splitChordChartIntoBlocks(chart)).toEqual([
      'F | F | Bb | F |\nBb | F | C |',
      'Bb | F | Gm | C |',
      'Gm | C | F |',
    ]);
  });

  test('splitChordChartIntoBlocks splits at trailing repeat and double-bar section ends', function() {
    expect(splitChordChartIntoBlocks('C | G :|\nAm | F :|')).toEqual([
      'C | G :|',
      'Am | F :|',
    ]);
    expect(splitChordChartIntoBlocks('C | G ||\nAm | F ||')).toEqual([
      'C | G ||',
      'Am | F ||',
    ]);
    expect(splitChordChartIntoBlocks('C | G :|:\nAm | F :|')).toEqual([
      'C | G :|:',
      'Am | F :|',
    ]);
  });

  test('splitChordChartIntoBlocks keeps volta :| with following [2 in one block', function() {
    const chart = '|: C | G | [1 Am | F :|\n[2 G | C |';
    expect(splitChordChartIntoBlocks(chart)).toEqual([chart]);
  });

  test('chartBlockHasChords ignores bar-only blocks', function() {
    expect(chartBlockHasChords('F | Bb | C |')).toBe(true);
    expect(chartBlockHasChords('| | | |')).toBe(false);
    expect(chartBlockHasChords('. . . | . . . |')).toBe(false);
    expect(chartBlockHasChords('| / | / | / |')).toBe(false);
    expect(chartBlockHasChords('Dm/C | G |')).toBe(true);
    expect(chartBlockHasChords('VERSECHORDS')).toBe(true);
  });

  test('fillEmptyBarsWithSlash marks held bars with /', function() {
    expect(fillEmptyBarsWithSlash('Fm | | Am |')).toBe('Fm | / | Am |');
    expect(fillEmptyBarsWithSlash('Fm | . . . . | Am |')).toBe('Fm | / | Am |');
    expect(fillEmptyBarsWithSlash('| Am |')).toBe('/ | Am |');
    expect(fillEmptyBarsWithSlash('Fm | / | Am |')).toBe('Fm | / | Am |');
    expect(fillEmptyBarsWithSlash('Am G | D |')).toBe('Am G | D |');
  });

  test('expandHeldChordsForDisplay shows carried chord before mid-bar change', function() {
    expect(expandHeldChordsForDisplay('D . . . | . . A . |')).toBe('D | D A |');
    expect(formatChordChartForDisplay('D . . . | . . A . |')).toBe('D | D A |');
    expect(expandHeldChordsForDisplay('D . . . | . . . A |')).toBe('D | D / / A |');
    expect(expandHeldChordsForDisplay('G . F . |')).toBe('G F |');
  });

  test('expandHeldChordsForDisplay keeps 5/4 slash timing with leading [M:]', function() {
    expect(expandHeldChordsForDisplay('[M:5/4] C / / G / |')).toBe('[M:5/4] C / / G / |');
    expect(formatChordChartForDisplay('[M:5/4] C / / G / |')).toBe('[M:5/4] C / / G / |');
    expect(formatChordChartForDisplay('C | [M:5/4] C / / G / |')).toBe('C | [M:5/4] C / / G / |');
  });

  test('expandHeldChordsForDisplay keeps pulse-level 5/4 timing after [M:]', function() {
    expect(expandHeldChordsForDisplay('[M:5/4] C . . . . . . . G . |'))
      .toBe('[M:5/4] C / / / G |');
    expect(formatChordChartForDisplay('[M:5/4] C . . . . . . . G . |'))
      .toBe('[M:5/4] C / / / G |');
  });

  test('fillEmptyBarsWithSlash preserves leading [M:] on empty bars', function() {
    expect(fillEmptyBarsWithSlash('C | [M:5/4] | Am |')).toBe('C | [M:5/4] / | Am |');
  });

  test('formatBeatSoundingForDisplay omits slash when hold lengths are equal', function() {
    expect(formatBeatSoundingForDisplay(['D', 'D', 'D', 'D']).tokens).toEqual(['D']);
    expect(formatBeatSoundingForDisplay(['G', 'G', 'F', 'F']).tokens).toEqual(['G', 'F']);
    expect(formatBeatSoundingForDisplay(['D', 'D', 'A', 'A']).tokens).toEqual(['D', 'A']);
    expect(formatBeatSoundingForDisplay(['D', 'D', 'D', 'A']).tokens).toEqual(['D', '/', '/', 'A']);
    expect(formatBeatSoundingForDisplay(['G', 'A', 'A', 'A']).tokens).toEqual(['G', 'A', '/', '/']);
    expect(collapseSoundingToBeats(['D', 'D', 'D', 'D', 'D', 'D', 'D', 'A'], 4))
      .toEqual(['D', 'D', 'D', 'A']);
  });

  test('formatChordChartForDisplay drops blocks with no chord symbols', function() {
    const chart = '| | | |\n\nAm G | D |\n\n| | | |';
    expect(formatChordChartForDisplay(chart)).toBe('Am G | D |');
  });

  test('formatChordChartForDisplay drops bar-only lines inside mixed blocks', function() {
    const chart = 'Am G |\n| | |\n| | |\n\n| | | |';
    expect(formatChordChartForDisplay(chart)).toBe('Am G |');
  });

  test('formatChordChartForDisplay fills empty bars with /', function() {
    expect(formatChordChartForDisplay('Fm | | Am |\nBb | | | F |')).toBe('Fm | / | Am |\nBb | / | / | F |');
  });

  test('formatChordChartForDisplay preserves inline repeats and endings', function() {
    const chart = '|: C G | Am F | [1 Dm G :| [2 F C |';
    expect(formatChordChartForDisplay(chart)).toBe('|: C G | Am F | [1 Dm G :| [2 F C |');
    expect(extractChordBars(chart)).toEqual([['C', 'G'], ['Am', 'F'], ['Dm', 'G'], ['F', 'C']]);
    expect(extractChordSequence(chart)).toEqual(['C', 'G', 'Am', 'F', 'Dm', 'G', 'F', 'C']);
    expect(chartBlockHasChords('|: :| [1 [2')).toBe(false);
  });

  test('normalizeChordChartRepeatMarks removes spaces inside |: and :|', function() {
    expect(normalizeChordChartRepeatMarks('| : C G | Am F : |')).toBe('|: C G | Am F :|');
    expect(normalizeChordChartRepeatMarks('Am F : |')).toBe('Am F :|');
    expect(normalizeChordChartRepeatMarks('Am F :')).toBe('Am F :|');
    expect(normalizeChordChartRepeatMarks('Am F :\nG |')).toBe('Am F :|\nG |');
    expect(formatChordChartForDisplay('| : C | [1 Dm : | [2 F |')).toBe('|: C | [1 Dm :| [2 F |');
  });

  test('normalizeChordChartRepeatMarks does not turn bar-close plus :| into |:', function() {
    // renderChords joins empty bars as "Dm | | | :|" — must not become "Dm | | |:|".
    expect(normalizeChordChartRepeatMarks('Dm | | | :|')).toBe('Dm | | | :|');
    expect(formatChordChartForDisplay('Dm | | | :|')).toBe('Dm | / | / | / :|');
  });

  test('fillEmptyBarsWithSlash keeps ending markers on empty bars', function() {
    expect(fillEmptyBarsWithSlash('|: C | [1 :| [2 G |')).toBe('|: C | [1 / :| [2 G |');
  });

  test('stripChartStructureMarkers removes repeats and voltas', function() {
    expect(stripChartStructureMarkers('|: C G | [1 Am F :| [2 G C |')).toBe('C G | Am F | G C |');
  });

  test('splitChordChartLineIntoBars treats || as a section-end barline, not an empty bar', function() {
    expect(splitChordChartLineIntoBars('G | G | G | G | Dm | Dm ||')).toEqual({
      bars: ['G ', ' G ', ' G ', ' G ', ' Dm ', ' Dm '],
      barlines: ['|', '|', '|', '|', '|', '||'],
    });
    expect(splitChordChartLineIntoBars('A | A | A||')).toEqual({
      bars: ['A ', ' A ', ' A'],
      barlines: ['|', '|', '||'],
    });
    expect(stripChartStructureMarkers('G | G | Dm ||')).toBe('G | G | Dm ||');
    expect(stripChartStructureMarkers('G | G | Dm ||')).not.toMatch(/\|\s+\|/);
    expect(stripChartStructureMarkers('C G | Am F :|')).toBe('C G | Am F :|');
  });

  test('parseChartStructureMarkers extracts volta segments', function() {
    const parsed = parseChartStructureMarkers('|: C G | [1 Am F :| [2 G C |');
    expect(parsed.strainStartBarline).toBe('|:');
    expect(parsed.endingMarkers).toEqual([
      { label: 1, barIndex: 1, close: ':|' },
      { label: 2, barIndex: 2, close: null },
    ]);
  });

  test('decorateChartWithRepeatMarks inserts repeat and volta markers', function() {
    const decorated = decorateChartWithRepeatMarks('C G | Am F | G C |', {
      strainStartBarline: '|:',
      endingMarkers: [
        { label: 1, barIndex: 1, close: ':|' },
        { label: 2, barIndex: 2, close: '|' },
      ],
    });
    expect(decorated).toMatch(/\|:.*\[1.*:\|.*\[2/);
    expect(stripChartStructureMarkers(decorated)).toBe('C G | Am F | G C |');
  });

  test('decorateChartWithRepeatMarks keeps ABC system line breaks and pulse dots', function() {
    const decorated = decorateChartWithRepeatMarks(
      'C . . . | G . . . |\nAm . . . | F . . . |',
      { strainEndBarline: '||' }
    );
    expect(decorated).toBe('C . . . | G . . . |\nAm . . . | F . . . ||');
  });

  test('formatSectionChartForEditor keeps extracted chart newlines when adding ||', function() {
    const editor = formatSectionChartForEditor({
      chart: 'C . . . | G . . . |\nAm . . . | F . . . |',
      strainEndBarline: '||',
    });
    expect(editor).toBe('C . . . | G . . . |\nAm . . . | F . . . ||');
  });

  test('formatSectionChartForEditor and parseSectionChartFromEditor round-trip voltas', function() {
    const section = {
      chart: 'C G | Am F | G C |',
      strainStartBarline: '|:',
      endingMarkers: [
        { label: 1, barIndex: 1, close: ':|' },
        { label: 2, barIndex: 2, close: '|' },
      ],
    };
    const editor = formatSectionChartForEditor(section);
    expect(editor).toMatch(/\|:/);
    expect(editor).toMatch(/\[1/);
    expect(editor).toMatch(/\[2/);
    const parsed = parseSectionChartFromEditor(editor);
    expect(parsed.cleanBody).toBe('C G | Am F | G C |');
    expect(parsed.endingMarkers.length).toBe(2);
  });

  test('aligns repeated sections to the right chord block instead of running down the page', function() {
    const lyrics = [
      '[Verse 1]', 'first verse words', '',
      '[Chorus]', 'chorus words', '',
      '[Verse 2]', 'second verse words', '',
      '[Chorus]', 'chorus words again', '',
      '[Bridge]', 'bridge words',
    ];
    const chordBlocks = ['VERSECHORDS', 'CHORUSCHORDS', 'BRIDGECHORDS'];
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks);

    expect(aligned.length).toBe(5);
    // every section reuses the correct chord block by type; only the first
    // occurrence of each type shows a chart (Verse 2 / chorus repeats are revisits).
    expect(aligned[0]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS', inlineChords: true, chartRevisit: false });
    expect(aligned[1]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS', inlineChords: true, chartRevisit: false });
    expect(aligned[2]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS', inlineChords: true, chartRevisit: true });
    expect(aligned[3]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS', inlineChords: true, chartRevisit: true });
    expect(aligned[4]).toMatchObject({ type: 'bridge', chart: 'BRIDGECHORDS', inlineChords: true, chartRevisit: false });

    // every lyric line is preserved
    expect(aligned[2].lyricLines).toEqual(['second verse words']);
  });

  test('chartRevisit blocks with words still merge inline chords for lyrics display', function() {
    const lyrics = [
      '[Verse 1]', 'first verse words here', '',
      '[Chorus]', 'chorus words here now', '',
      '[Verse 2]', 'second verse words here', '',
      '[Chorus]', 'chorus words again now',
    ];
    const chordBlocks = [
      'C . . . | G . . . |',
      'Am . . . | F . . . |',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks);
    expect(aligned[2].chartRevisit).toBe(true);
    expect(aligned[2].inlineChords).toBe(true);
    expect(aligned[3].chartRevisit).toBe(true);
    expect(aligned[3].inlineChords).toBe(true);

    const verse2Merged = mergeAlignedLyricBlockChords(aligned[2], null);
    const chorus2Merged = mergeAlignedLyricBlockChords(aligned[3], null);
    expect(verse2Merged).toBeTruthy();
    expect(chorus2Merged).toBeTruthy();
    const verseChords = verse2Merged.map(function(row) {
      return row.map(function(t) { return t.chord; }).filter(Boolean).join(' ');
    }).join(' | ');
    const chorusChords = chorus2Merged.map(function(row) {
      return row.map(function(t) { return t.chord; }).filter(Boolean).join(' ');
    }).join(' | ');
    expect(verseChords).toMatch(/C/);
    expect(verseChords).toMatch(/G/);
    expect(chorusChords).toMatch(/Am/);
    expect(chorusChords).toMatch(/F/);
  });

  test('expanded bare chorus revisit keeps words for lyrics and chartRevisit for structure', function() {
    const lyrics = [
      '[Verse 1]', 'first verse words', '',
      '# Chorus', 'chorus line one', 'chorus line two', '',
      '[Verse 2]', 'second verse words', '',
      '# Chorus',
    ];
    const expanded = expandRepeatedSectionLyrics(lyrics);
    const aligned = alignChordBlocksToLyrics(expanded, [
      'C . . . | G . . . |',
      'Am . . . | F . . . |',
    ]);
    const lastChorus = aligned[aligned.length - 1];
    expect(lastChorus.type).toBe('chorus');
    expect(lastChorus.chartRevisit).toBe(true);
    expect(lastChorus.lyricLines).toEqual(['chorus line one', 'chorus line two']);
    expect(lastChorus.inlineChords).toBe(true);
    const merged = mergeAlignedLyricBlockChords(lastChorus, null);
    expect(merged).toBeTruthy();
    expect(merged.some(function(row) {
      return row.some(function(t) { return t.chord === 'Am' || t.chord === 'F'; });
    })).toBe(true);
  });

  test('a repeated section with no words of its own shows the chord chart, not inline', function() {
    const lyrics = [
      '[Verse 1]', 'first verse words', '',
      '[Chorus]', 'chorus words', '',
      '[Chorus]',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS']);
    expect(aligned.length).toBe(3);
    expect(aligned[2]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS', inlineChords: false, chartRevisit: true });
    expect(aligned[2].lyricLines).toEqual([]);
  });

  test('alignChordBlocksToLyrics infers verse types and matches charts when only chorus is labeled', function() {
    const lyrics = [
      'v1a', 'v1b', 'v1c', 'v1d', '',
      '[Chorus]',
      'c1a', 'c1b', 'c1c', 'c1d', 'c1e', 'c1f', '',
      'v2a', 'v2b', 'v2c', 'v2d', '',
      'c2a', 'c2b', 'c2c', 'c2d', 'c2e', 'c2f',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS'], {
      chordSectionLabels: [
        { header: '[Verse]', title: 'Verse', type: 'verse', chartRevisit: false },
        { header: '[Chorus]', title: 'Chorus', type: 'chorus', chartRevisit: false },
      ],
    });
    expect(aligned.map(function(b) { return b.type; })).toEqual(['verse', 'chorus', 'verse', 'chorus']);
    expect(aligned.map(function(b) { return b.chart; })).toEqual([
      'VERSECHORDS', 'CHORUSCHORDS', 'VERSECHORDS', 'CHORUSCHORDS',
    ]);
    expect(aligned[2].chartRevisit).toBe(true);
    expect(aligned[3].chartRevisit).toBe(true);
  });

  test('chordSectionLabels are ignored; lyric order maps charts sequentially', function() {
    // Charts are Verse then Chorus; lyrics are Chorus then Verse.
    // Labels must not rematch by name — first lyric section gets first chart.
    const lyrics = [
      '[Chorus]', 'chorus words', '',
      '[Verse 1]', 'first verse words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS'], {
      chordSectionLabels: [
        { header: '[Verse 1]', title: 'Verse 1', type: 'verse', chartRevisit: false },
        { header: '[Chorus]', title: 'Chorus', type: 'chorus', chartRevisit: false },
      ],
    });
    expect(aligned.length).toBe(2);
    expect(aligned[0]).toMatchObject({ type: 'chorus', chart: 'VERSECHORDS' });
    expect(aligned[1]).toMatchObject({ type: 'verse', chart: 'CHORUSCHORDS' });
  });

  test('incomplete chordSectionLabels that omit chorus fall back to lyric order (Cold Goodbye)', function() {
    // Melody strains are chorus then verse; lyrics start with # chorus.
    // Stale labels only tag the first strain as verse — ignored; lyric order wins.
    const lyrics = [
      '# chorus',
      'Strange affair, while we all stared',
      "Made up face and hair but she's not there",
      "She's cold and dead",
      '',
      '# verse',
      'The golden night, we said goodbye',
      'From afternoon of glowing color, warm and bright',
      'Down deep into the soil where you lie cold and dark',
      'To travel through the universe without a spark',
      '',
      '# chorus',
      '',
      '# verse',
      'The bite and spite, when we ignite',
    ];
    const chorusChart = 'Em | Am | Em | Am | F | F |';
    const verseChart = 'Em | Am | F | G | Am | Bm | C | Em |';
    const aligned = alignChordBlocksToLyrics(lyrics, [chorusChart, verseChart], {
      chordSectionLabels: [
        { header: '[verse]', title: 'verse', type: 'verse', chartRevisit: false },
        { header: '', title: '', type: null, chartRevisit: false },
      ],
    });
    expect(aligned[0]).toMatchObject({ type: 'chorus', chart: chorusChart, inlineChords: true });
    expect(aligned[1]).toMatchObject({ type: 'verse', chart: verseChart, inlineChords: true });
    expect(aligned[0].chart).not.toBe(aligned[1].chart);
  });

  test('empty chordSectionLabels fall back to sequential mapping', function() {
    const lyrics = [
      '[Verse 1]', 'first verse words', '',
      '[Chorus]', 'chorus words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS'], {
      chordSectionLabels: [
        { header: '', title: '', type: null, chartRevisit: false },
        { header: '', title: '', type: null, chartRevisit: false },
      ],
    });
    expect(aligned[0]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS' });
    expect(aligned[1]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS' });
    expect(aligned[1].extraChart).toBeFalsy();
  });

  test('leading title/composer line does not consume first chord block', function() {
    const lyrics = [
      'Song Title - Composer Name', '',
      '[Verse 1]', 'first verse words', '',
      '[Chorus]', 'chorus words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS'], {
      title: 'Song Title',
      composer: 'Composer Name',
    });
    expect(aligned.length).toBe(2);
    expect(aligned[0].prefaceLines).toEqual(['Song Title - Composer Name']);
    expect(aligned[0]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS', inlineChords: true });
    expect(aligned[1]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS', inlineChords: true });
  });

  test('leading title/composer line before section header in same block is preface', function() {
    const lyrics = [
      'Song Title by Composer Name',
      '[Verse 1]',
      'first verse words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS'], {
      title: 'Song Title',
      composer: 'Composer Name',
    });
    expect(aligned.length).toBe(1);
    expect(aligned[0].prefaceLines).toEqual(['Song Title by Composer Name']);
    expect(aligned[0]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS' });
    expect(aligned[0].lyricLines).toEqual(['first verse words']);
  });

  test('applies a single chord block to every verse (hymn pattern, no headers)', function() {
    // Amazing Grace: one melody/chord block, several verses, no [Section] headers.
    const lyrics = [
      'Amazing grace how sweet the sound', '',
      'Twas grace that taught my heart to fear', '',
      'Through many dangers toils and snares',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['G | G | C | G |']);
    expect(aligned.length).toBe(3);
    aligned.forEach(function(block, index) {
      expect(block.chart).toBe('G | G | C | G |');
      expect(block.inlineChords).toBe(true);
      expect(block.type).toBeNull();
      if (index === 0) {
        expect(block.chartRevisit).toBe(false);
      } else {
        expect(block.chartRevisit).toBe(true);
      }
    });
  });

  test('inferSectionTypesFromLineCounts labels alternating equal lengths as verse/chorus', function() {
    const blocks = [
      { lyricLines: ['v1a', 'v1b', 'v1c', 'v1d', 'v1e', 'v1f'], type: null, header: null },
      { lyricLines: ['c1a', 'c1b', 'c1c', 'c1d'], type: null, header: null },
      { lyricLines: ['v2a', 'v2b', 'v2c', 'v2d', 'v2e', 'v2f'], type: null, header: null },
      { lyricLines: ['c2a', 'c2b', 'c2c', 'c2d'], type: null, header: null },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks.map(function(b) { return b.type; })).toEqual(['verse', 'chorus', 'verse', 'chorus']);
    expect(blocks[0].header).toBe('[Verse]');
    expect(blocks[1].header).toBe('[Chorus]');
    expect(blocks[2].header).toBe('[Verse 2]');
    expect(blocks[3].header).toBe('[Chorus 2]');
  });

  test('inferSectionTypesFromLineCounts treats a shorter first stanza as the chorus', function() {
    const blocks = [
      { lyricLines: ['c1a', 'c1b', 'c1c', 'c1d'], type: null, header: null },
      { lyricLines: ['v1a', 'v1b', 'v1c', 'v1d', 'v1e', 'v1f'], type: null, header: null },
      { lyricLines: ['c2a', 'c2b', 'c2c', 'c2d'], type: null, header: null },
      { lyricLines: ['v2a', 'v2b', 'v2c', 'v2d', 'v2e', 'v2f'], type: null, header: null },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks.map(function(b) { return b.type; })).toEqual(['chorus', 'verse', 'chorus', 'verse']);
    expect(blocks[0].header).toBe('[Chorus]');
    expect(blocks[1].header).toBe('[Verse]');
    expect(blocks[2].header).toBe('[Chorus 2]');
    expect(blocks[3].header).toBe('[Verse 2]');
  });

  test('inferSectionTypesFromLineCounts leaves a third line-count group untitled', function() {
    const blocks = [
      { lyricLines: ['a', 'b', 'c', 'd', 'e', 'f'], type: null, header: null },
      { lyricLines: ['g', 'h', 'i', 'j'], type: null, header: null },
      { lyricLines: ['k', 'l', 'm', 'n', 'o', 'p'], type: null, header: null },
      { lyricLines: ['q', 'r', 's', 't'], type: null, header: null },
      { lyricLines: ['u', 'v', 'w', 'x', 'y'], type: null, header: null },
      { lyricLines: ['1', '2', '3', '4'], type: null, header: null },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks.map(function(b) { return b.type; })).toEqual([
      'verse', 'chorus', 'verse', 'chorus', null, 'chorus',
    ]);
    expect(blocks[4].header).toBeNull();
  });

  test('inferSectionTypesFromLineCounts skips when only two stanzas differ (no return to verse)', function() {
    const blocks = [
      { lyricLines: ['a', 'b', 'c', 'd'], type: null, header: null },
      { lyricLines: ['e', 'f', 'g', 'h', 'i', 'j'], type: null, header: null },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks[0].type).toBeNull();
    expect(blocks[1].type).toBeNull();
  });

  test('inferSectionTypesFromLineCounts labels single unlabeled verse when only chorus is labeled', function() {
    const blocks = [
      { lyricLines: ['v1a', 'v1b', 'v1c', 'v1d'], type: null, header: null },
      {
        lyricLines: ['c1a', 'c1b', 'c1c', 'c1d', 'c1e', 'c1f'],
        type: 'chorus',
        header: '[Chorus]',
      },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks.map(function(b) { return b.type; })).toEqual(['verse', 'chorus']);
    expect(blocks[0].header).toBe('[Verse]');
  });

  test('inferSectionTypesFromLineCounts fills unlabeled verses around a labeled chorus', function() {
    const blocks = [
      { lyricLines: ['v1a', 'v1b', 'v1c', 'v1d'], type: null, header: null },
      {
        lyricLines: ['c1a', 'c1b', 'c1c', 'c1d', 'c1e', 'c1f'],
        type: 'chorus',
        header: '[Chorus]',
      },
      { lyricLines: ['v2a', 'v2b', 'v2c', 'v2d'], type: null, header: null },
      { lyricLines: ['c2a', 'c2b', 'c2c', 'c2d', 'c2e', 'c2f'], type: null, header: null },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks.map(function(b) { return b.type; })).toEqual(['verse', 'chorus', 'verse', 'chorus']);
    expect(blocks[1].header).toBe('[Chorus]'); // never overwrite
    expect(blocks[0].header).toBe('[Verse]');
    expect(blocks[2].header).toBe('[Verse 2]');
  });

  test('inferSectionTypesFromLineCounts reuses type when unlabeled body matches a labeled stanza', function() {
    const chorusWords = ['hook line one', 'hook line two', 'hook line three'];
    const blocks = [
      { lyricLines: ['verse words a', 'verse words b'], type: 'verse', header: '[Verse 1]' },
      { lyricLines: chorusWords.slice(), type: 'chorus', header: '[Chorus]' },
      { lyricLines: ['verse two a', 'verse two b'], type: null, header: null },
      { lyricLines: chorusWords.slice(), type: null, header: null },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks[3].type).toBe('chorus');
    expect(blocks[3].header).toBe('[Chorus 2]');
    expect(blocks[2].type).toBe('verse');
  });

  test('isSectionHeader recognises parenthetical section markers', function() {
    expect(isSectionHeader('(chorus)')).toBe(true);
    expect(isSectionHeader('(Chorus)')).toBe(true);
    expect(isSectionHeader('(Outro)')).toBe(true);
    expect(isSectionHeader('(A Part)')).toBe(true);
    expect(isSectionHeader('  (Spoken Bridge)  ')).toBe(true);
    expect(isSectionHeader('(whispered)')).toBe(true);
    expect(isSectionHeader('sing (quietly)')).toBe(false);
    expect(isSectionHeader('()')).toBe(false);
  });

  test('splitIntoBlocks drops bare URL metadata lines', function() {
    const blocks = splitIntoBlocks(['verse one', 'https://lyricstranslate.com']);
    expect(blocks).toEqual([['verse one']]);
  });

  test('inferSectionTypesFromLineCounts labels cumulative folk verses', function() {
    const blocks = [
      { lyricLines: ['c1', 'c2'], type: null, header: null },
      { lyricLines: ['v1', 'v2', 'v3', 'v4'], type: null, header: null },
      { lyricLines: ['c1', 'c2'], type: null, header: null },
      { lyricLines: ['v1', 'v2', 'v3', 'v4', 'v5'], type: null, header: null },
      { lyricLines: ['c1', 'c2'], type: null, header: null },
      { lyricLines: ['v1', 'v2', 'v3', 'v4', 'v5', 'v6'], type: null, header: null },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks.map(function(b) { return b.type; })).toEqual([
      'chorus', 'verse', 'chorus', 'verse', 'chorus', 'verse',
    ]);
    expect(blocks[3].header).toBe('[Verse 2]');
  });

  test('inferSectionTypesFromLineCounts keeps first verse before explicit Verse 2/3', function() {
    const blocks = [
      { lyricLines: ['a', 'b', 'c', 'd'], type: null, header: null },
      { lyricLines: ['p1', 'p2'], type: 'prechorus', header: '[Pre-Chorus]' },
      { lyricLines: ['c1', 'c2'], type: 'chorus', header: '[Chorus]' },
      { lyricLines: ['e', 'f', 'g', 'h'], type: 'verse', header: '[Verse 2]' },
      { lyricLines: ['i', 'j', 'k', 'l'], type: 'verse', header: '[Verse 3]' },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks[0].header).toBe('[Verse]');
  });

  test('inferSectionTypesFromLineCounts does not label title/meta leftovers as bridge', function() {
    const blocks = [
      {
        lyricLines: ['Cold Goodbye - Steve Ryan 28/9/2025'],
        type: null,
        header: null,
      },
      {
        lyricLines: [
          'Strange affair, while we all stared',
          "Made up face and hair but she's not there",
          "She's cold and dead",
        ],
        type: 'chorus',
        header: '[chorus]',
      },
      {
        lyricLines: [
          'The golden night, we said goodbye',
          'From afternoon of glowing color, warm and bright',
          'Down deep into the soil where you lie cold and dark',
          'To travel through the universe without a spark',
        ],
        type: 'verse',
        header: '[verse]',
      },
      {
        lyricLines: [],
        type: 'chorus',
        header: '[chorus]',
      },
      {
        lyricLines: [
          'The bite and spite, when we ignite',
          'The words that hurt and spiral late into the night',
          'Our last goodbye, your words were filled with lye',
          'I bit my tongue in pain, it was a cold goodbye',
        ],
        type: 'verse',
        header: '[verse]',
      },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks[0].type).toBeNull();
    expect(blocks.map(function(b) { return b.type; })).toEqual([
      null, 'chorus', 'verse', 'chorus', 'verse',
    ]);
  });

  test('inferSectionTypesFromLineCounts leaves leftover stanzas untitled when verse and chorus lengths are known', function() {
    const blocks = [
      { lyricLines: ['a', 'b', 'c', 'd'], type: 'verse', header: '[Verse]' },
      { lyricLines: ['e', 'f', 'g', 'h', 'i', 'j'], type: 'chorus', header: '[Chorus]' },
      { lyricLines: ['k', 'l', 'm', 'n'], type: null, header: null },
      { lyricLines: ['o', 'p', 'q', 'r', 's', 't'], type: null, header: null },
      { lyricLines: ['u', 'v', 'w', 'x', 'y'], type: null, header: null },
    ];
    inferSectionTypesFromLineCounts(blocks);
    expect(blocks.map(function(b) { return b.type; })).toEqual([
      'verse', 'chorus', 'verse', 'chorus', null,
    ]);
    expect(blocks[4].header).toBeNull();
  });

  test('inferSectionTypesFromChartFingerprints labels by matching chord sequences', function() {
    const verseChart = 'C | G | Am | F |';
    const chorusChart = 'F | C | G | Am |';
    const blocks = [
      { lyricLines: ['v1'], type: 'verse', header: '[Verse]' },
      { lyricLines: ['c1'], type: 'chorus', header: '[Chorus]' },
      { lyricLines: ['v2'], type: null, header: null },
      { lyricLines: ['c2'], type: null, header: null },
    ];
    inferSectionTypesFromChartFingerprints(blocks, [verseChart, chorusChart, verseChart, chorusChart]);
    expect(blocks.map(function(b) { return b.type; })).toEqual(['verse', 'chorus', 'verse', 'chorus']);
    expect(chordChartFingerprint(verseChart)).toBe(chordChartFingerprint(verseChart));
  });

  test('alignChordBlocksToLyrics cycles charts positionally without section headers', function() {
    const lyrics = [
      'verse one line a', 'verse one line b', 'verse one line c', 'verse one line d', 'verse one line e', 'verse one line f', '',
      'chorus line a', 'chorus line b', 'chorus line c', 'chorus line d', '',
      'verse two line a', 'verse two line b', 'verse two line c', 'verse two line d', 'verse two line e', 'verse two line f', '',
      'chorus two a', 'chorus two b', 'chorus two c', 'chorus two d',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS']);
    expect(aligned.map(function(b) { return b.chart; })).toEqual([
      'VERSECHORDS', 'CHORUSCHORDS', 'VERSECHORDS', 'CHORUSCHORDS',
    ]);
    expect(aligned[2].chartRevisit).toBe(true);
    expect(aligned[3].chartRevisit).toBe(true);
  });

  test('alignChordBlocksToLyrics maps explicit section headers to charts', function() {
    const lyrics = [
      '[Verse]', 'v1a', 'v1b', 'v1c', 'v1d', 'v1e', 'v1f', '',
      '[Chorus]', 'c1a', 'c1b', 'c1c', 'c1d', '',
      '[Verse]', 'v2a', 'v2b', 'v2c', 'v2d', 'v2e', 'v2f', '',
      '[Chorus]', 'c2a', 'c2b', 'c2c', 'c2d', '',
      '[Bridge]', 'b1a', 'b1b', 'b1c', 'b1d', 'b1e', '',
      '[Chorus]', 'c3a', 'c3b', 'c3c', 'c3d',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS', 'BRIDGECHORDS']);
    expect(aligned.map(function(b) { return b.type; })).toEqual([
      'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus',
    ]);
    expect(aligned[4]).toMatchObject({ type: 'bridge', chart: 'BRIDGECHORDS', chartRevisit: false });
    expect(aligned[5]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS', chartRevisit: true });
  });

  test('falls back to positional mapping when there are no section headers', function() {
    const lyrics = ['line one', '', 'line two', '', 'line three'];
    const chordBlocks = ['A1', 'A2'];
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks);
    expect(aligned[0].chart).toBe('A1');
    expect(aligned[1].chart).toBe('A2');
    // both blocks have words and a chart, so both merge inline
    expect(aligned[0].inlineChords).toBe(true);
    expect(aligned[1].inlineChords).toBe(true);
    expect(aligned[2].chart).toBe('A1');
    expect(aligned[2].chartRevisit).toBe(true);
    expect(aligned[2].inlineChords).toBe(true);
    expect(aligned[2].lyricLines).toEqual(['line three']);
  });

  test('combines multiple chord blocks for a single headerless verse (Ashokan Farewell)', function() {
    // An instrumental-style tune whose melody splits into several chord blocks
    // at its double barlines, sung over one block of lyrics with no [Section]
    // headers. The verse spans the whole melody, so every chord block is
    // combined onto that one verse and distributed across its lines instead of
    // the surplus blocks being dumped as a separate chart.
    const lyrics = [
      'The sun is sinking low',
      'in the sky above Ashokan',
      'The pines and the willows know',
      'soon we will part',
    ];
    const chordBlocks = ['D | A | G | D |', 'G | D | A | D |'];
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks);

    expect(aligned.length).toBe(1);
    expect(aligned[0].inlineChords).toBe(true);
    expect(aligned[0].extraChart).toBe('');
    // the chart carries the bars from both melodic sections
    expect(aligned[0].chart).toContain('D | A | G | D |');
    expect(aligned[0].chart).toContain('G | D | A | D |');

    // distributing the combined bars across the verse lines reaches the chords
    // from the second section (eg. they are not stranded off the verse)
    const merged = mergeChordsIntoLyricLines(aligned[0].lyricLines, aligned[0].chart);
    const allChords = merged.flat().map(function(t) { return t.chord; }).filter(Boolean).join(' ');
    expect(allChords).toContain('G');
    // the last lyric line receives chords from the second melodic section
    const lastLineChords = merged[merged.length - 1].map(function(t) { return t.chord; }).filter(Boolean);
    expect(lastLineChords.length).toBeGreaterThan(0);
  });

  test('extractChordSequence collapses consecutive duplicates', function() {
    expect(extractChordSequence('F | F | Bb | F |')).toEqual(['F', 'Bb', 'F']);
  });

  test('buildUniqueChordsMap excludes slash placeholders and keeps slash chords', function() {
    const map = buildUniqueChordsMap('D | D / A / | Fm | / | Dm/C |');
    expect(Object.keys(map).sort()).toEqual(['A', 'D', 'Dm/C', 'Fm']);
    expect(map['/']).toBeUndefined();
  });

  test('extractChordBars preserves the bar grid including held (empty) bars', function() {
    expect(extractChordBars('Fm | Am | Em | F |')).toEqual([['Fm'], ['Am'], ['Em'], ['F']]);
    // an empty bar (no chord token) means the previous chord is held
    expect(extractChordBars('Fm | | Am |')).toEqual([['Fm'], [], ['Am']]);
    // newlines are flattened: a four-bar line is still four bars
    expect(extractChordBars('Fm | Am |\nEm | F |')).toEqual([['Fm'], ['Am'], ['Em'], ['F']]);
  });

  test('mergeChordsIntoLyricLines places chords above words and keeps every word', function() {
    const merged = mergeChordsIntoLyricLines(
      ['I really like Christmas', 'How wonderful it is'],
      'F | F | Bb | F | C |'
    );
    const allText = merged.flat().map(function(t) { return t.text; }).join('');
    expect(allText).toContain('I ');
    expect(allText).toContain('Christmas ');
    expect(allText).toContain('wonderful ');
    const chordsUsed = merged.flat().map(function(t) { return t.chord; }).filter(Boolean);
    expect(chordsUsed.length).toBeGreaterThan(0);
    expect(chordsUsed[0]).toBe('F');
  });

  test('mergeChordsIntoLyricLines keeps a blank lyric line as an empty token row', function() {
    const merged = mergeChordsIntoLyricLines(
      ['Last time last rhyme', '', 'One more for the road'],
      'Dm | C | Bb | F |'
    );
    expect(merged).toHaveLength(3);
    expect(merged[1]).toEqual([]);
    expect(merged[0].some(function(t) { return t.text && t.text.indexOf('Last') >= 0; })).toBe(true);
    expect(merged[2].some(function(t) { return t.text && t.text.indexOf('One') >= 0; })).toBe(true);
  });

  test('mergeAlignedLyricBlockChords keeps a blank between equal-length dual sections', function() {
    const merged = mergeAlignedLyricBlockChords({
      inlineChords: true,
      chart: 'C | G |\n\nAm | F |',
      lyricLines: [
        'one aa', 'one bb', 'one cc', 'one dd',
        '',
        'two aa', 'two bb', 'two cc', 'two dd',
      ],
    });
    expect(merged).not.toBeNull();
    const blankIndex = merged.findIndex(function(line) { return !line || line.length === 0; });
    expect(blankIndex).toBeGreaterThan(0);
    const firstText = merged.slice(0, blankIndex).flat().map(function(t) { return t.text; }).join('');
    const secondText = merged.slice(blankIndex + 1).flat().map(function(t) { return t.text; }).join('');
    expect(firstText).toContain('one');
    expect(secondText).toContain('two');
    expect(firstText).not.toContain('two');
  });

  test('mergeChordsIntoLyricLines can honor an explicit anchor callback', function() {
    const merged = mergeChordsIntoLyricLines(
      ['I really like Christmas'],
      'F | Bb | C |',
      {
        anchorWordIndexForBar: function(info) {
          return [0, 2, 3][info.barIndex];
        },
      }
    );
    expect(merged[0].map(function(token) { return token.chord; })).toEqual(['F', '', 'Bb', 'C']);
  });

  test('mergeChordsIntoLyricLines uses lyric / beat markers as bar anchors and keeps markers in text', function() {
    const merged = mergeChordsIntoLyricLines(
      ['/I really /like Christmas'],
      'F | Bb |'
    );
    expect(merged[0].map(function(token) { return token.text; })).toEqual(['/I ', 'really ', '/like ', 'Christmas ']);
    expect(merged[0].map(function(token) { return token.chord; })).toEqual(['F', '', 'Bb', '']);
  });

  test('mergeChordsIntoLyricLines honors mid-word / beat markers', function() {
    const merged = mergeChordsIntoLyricLines(
      ['a/mazing /grace how /sweet the /sound'],
      'G | C | Em | D |'
    );
    expect(merged[0].map(function(token) { return token.text; })).toEqual([
      'a/mazing ', '/grace ', 'how ', '/sweet ', 'the ', '/sound ',
    ]);
    expect(merged[0].map(function(token) { return token.chord; })).toEqual([
      'G', 'C', '', 'Em', '', 'D',
    ]);
  });

  test('mergeChordsIntoLyricLines places a whole-bar F on the first / when the line starts unmarked', function() {
    const merged = mergeChordsIntoLyricLines(
      ['A new /throne of the underworld for a fetid fungal /queen'],
      'G | F | C F | C F |'
    );
    const chords = merged[0].map(function(token) { return token.chord; });
    const texts = merged[0].map(function(token) { return token.text.trim(); });
    expect(chords[0]).toBe('G');
    expect(texts[2]).toBe('/throne');
    expect(chords[2]).toBe('F');
    expect(texts[texts.length - 1]).toBe('/queen');
    expect(chords).toContain('C');
    expect(chords.filter(function(c) { return c === 'F'; }).length).toBeGreaterThan(1);
  });

  test('mergeChordsIntoLyricLines spreads mid-bar chord changes across words', function() {
    const merged = mergeChordsIntoLyricLines(
      ['Pontentized by mass dilution, a memory trace in water,'],
      'F C | F C | F C | C Am | Am | Am |'
    );
    const chords = merged[0].map(function(token) { return token.chord; });
    const texts = merged[0].map(function(token) { return token.text; });
    expect(texts[0]).toBe('Pontentized ');
    // Do not jam both half-bar chords onto the first word as "F C".
    expect(chords[0]).toBe('F');
    expect(chords).toContain('C');
    expect(chords).toContain('Am');
    expect(chords.some(function(c) { return String(c).indexOf(' ') >= 0; })).toBe(false);
    // Later identical F C bars still emit the mid-bar C change.
    const fIndexes = [];
    const cIndexes = [];
    chords.forEach(function(c, i) {
      if (c === 'F') fIndexes.push(i);
      if (c === 'C') cIndexes.push(i);
    });
    expect(fIndexes.length).toBeGreaterThanOrEqual(2);
    expect(cIndexes.length).toBeGreaterThanOrEqual(2);
  });

  test('attaches unmapped chord blocks before the last unidentified lyric block', function() {
    const lyrics = ['[Verse 1]', 'only verse here'];
    const chordBlocks = ['VERSECHORDS', 'ORPHANCHORDS'];
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks);
    expect(aligned.length).toBe(1);
    expect(aligned[0].inlineChords).toBe(true);
    expect(aligned[0].extraChart).toBe('ORPHANCHORDS');
  });

  test('attaches orphan chords to last lyric block with no mapped chart as its chart', function() {
    const lyrics = [
      '[Verse 1]', 'verse words', '',
      'outro words with no section header',
    ];
    // One typed section maps to first chart; leftover untitled stanza takes the next strain.
    const chordBlocks = ['VERSECHORDS', 'OUTROCHORDS'];
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks);
    expect(aligned.length).toBe(2);
    expect(aligned[0].chart).toBe('VERSECHORDS');
    expect(aligned[1].type).toBeNull();
    expect(aligned[1].chart).toBe('OUTROCHORDS');
    expect(aligned[1].extraChart).toBeFalsy();
  });

  test('normalizeLyricBlocks keeps wordless repeat header as its own block', function() {
    const lyrics = ['[Verse 1]', 'first verse', '', '[Verse 2]'];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['[Verse 1]', 'first verse'],
      ['[Verse 2]'],
    ]);
  });

  test('wordless repeat section keeps chart for fallback display above plain lyrics', function() {
    const lyrics = [
      '[Verse 1]', 'first verse', '',
      '[Verse 2]',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS']);
    expect(aligned[1].inlineChords).toBe(false);
    expect(aligned[1].chart).toBe('VERSECHORDS');
  });

  test('expandRepeatedSectionLyrics fills in words after bare chorus headers', function() {
    const lyrics = [
      '[Verse 1]', 'first verse words', '',
      '# Chorus', 'chorus line one', 'chorus line two', '',
      '[Verse 2]', 'second verse words', '',
      '# Chorus',
    ];
    const expanded = expandRepeatedSectionLyrics(lyrics);
    expect(expanded).toContain('chorus line one');
    expect(expanded).toContain('chorus line two');
    const lastChorus = expanded.lastIndexOf('# Chorus');
    expect(expanded.slice(lastChorus)).toEqual([
      '# Chorus', 'chorus line one', 'chorus line two',
    ]);
  });

  test('lyricRepeatLookupKey treats verse heading variants as the same stanza', function() {
    expect(lyricRepeatLookupKey('#verse 2')).toBe('verse 2');
    expect(lyricRepeatLookupKey('# verse 2')).toBe('verse 2');
    expect(lyricRepeatLookupKey('# v2')).toBe('verse 2');
    expect(lyricRepeatLookupKey('# Verse II')).toBe('verse 2');
    expect(lyricRepeatLookupKey('#verse 1')).toBe('verse 1');
    expect(lyricRepeatLookupKey('# chorus')).toBe('chorus');
  });

  test('expandRepeatedSectionLyrics fills a blank numbered verse from that verse, not verse 1', function() {
    const lyrics = [
      '#verse 1',
      'When a tree falls, the monkeys scatter with the leaves',
      '',
      '#chorus',
      'A new throne of the underworld for a fetid fungal queen',
      '',
      '# verse 2',
      'Father fungi fruits, colorfully decorates the throne.',
      '',
      '# bridge',
      'in the silence that remains, there lies a noisy mosh',
      '',
      '#verse 2',
      '',
      '# chorus',
    ];
    const expanded = expandRepeatedSectionLyrics(lyrics);
    const lastVerse2 = expanded.lastIndexOf('#verse 2');
    expect(lastVerse2).toBeGreaterThan(expanded.indexOf('# verse 2'));
    expect(expanded.slice(lastVerse2, lastVerse2 + 2)).toEqual([
      '#verse 2',
      'Father fungi fruits, colorfully decorates the throne.',
    ]);
    expect(expanded.slice(lastVerse2).join('\n')).not.toMatch(/When a tree falls/);
    const lastChorus = expanded.lastIndexOf('# chorus');
    expect(expanded.slice(lastChorus)).toEqual([
      '# chorus',
      'A new throne of the underworld for a fetid fungal queen',
    ]);
  });

  test('applyChordProPatternToLine copies chords onto matching word indexes', function() {
    expect(applyChordProPatternToLine(
      '[C]In our younger days, we are taught to save',
      'Tendons, broken teeth, the aches and pains'
    )).toBe('[C]Tendons, broken teeth, the aches and pains');
    expect(applyChordProPatternToLine(
      '[C]Putting it away to compound for a rainy [D]day',
      'Feeling so much less like energetic play'
    )).toMatch(/^\[C\]Feeling/);
    expect(applyChordProPatternToLine(
      '[C]Putting it away to compound for a rainy [D]day',
      'Feeling so much less like energetic play'
    )).toMatch(/\[D\]play$/);
    expect(applyChordProPatternToLine('[C]already [D]chorded', '[Am]keep these')).toBe('[Am]keep these');
  });

  test('applyRepeatedSectionChordPro fills later verses from the first chorded verse (Worthwhile)', function() {
    const lyrics = [
      '# Chorus',
      '[C]Health and time and love',
      '',
      '# Verse I',
      '[C]In our younger days, we are taught to save',
      '[C]Putting it away to compound for a rainy [D]day',
      '[C]All the time to play but not enough to pay for all the [D]fancy things.',
      '',
      'As we [C]grow and take our form, find our place,',
      '[C]choices make it harder to replace the now with [D]what could be',
      '[C]I hope that you are living true existing as what is really meaningful for you',
      '',
      '# Chorus',
      '',
      '# Verse II',
      'Tendons, broken teeth, the aches and pains',
      'Feeling so much less like energetic play',
      'Going out with folks seems hard when I can cosy up and Netflix binge.',
      '',
      'The people that I love, I almost never see',
      'who generated many special treasured memories',
      'Now coffers full, I really wish I spent much more enriching all of my experience',
      '',
      '# Chorus',
      '',
      '# Verse III',
      'smoothing of consumption, from age to youth',
      'compounding of our memory dividend, the only truth',
      'when movement fails we still exist within our minds, with truths yet still to find',
    ];
    const filled = applyRepeatedSectionChordPro(expandRepeatedSectionLyrics(lyrics));
    const verse2 = filled.indexOf('# Verse II');
    const verse3 = filled.indexOf('# Verse III');
    expect(verse2).toBeGreaterThan(0);
    expect(verse3).toBeGreaterThan(verse2);
    expect(filled[verse2 + 1]).toMatch(/^\[C\]Tendons/);
    expect(filled[verse2 + 2]).toMatch(/\[C\]/);
    expect(filled[verse2 + 2]).toMatch(/\[D\]/);
    expect(filled[verse3 + 1]).toMatch(/^\[C\]smoothing/);
    expect(filled.some(function(line) {
      return /\[C\]Health and time/.test(line);
    })).toBe(true);
  });

  test('applyRepeatedSectionChordPro does not copy chords across different @N pins', function() {
    const lyrics = [
      '# v1 @2',
      '[Dm]wade in the water',
      '',
      '# v2 @3',
      'duck and dive when the gulls attack',
    ];
    const filled = applyRepeatedSectionChordPro(lyrics);
    const v2 = filled.find(function(line) { return /duck and dive/.test(line); });
    expect(v2).toBe('duck and dive when the gulls attack');
    expect(linesHaveChordProInlineChords([v2])).toBe(false);
  });

  test('section marker helpers detect chart and ABC forms', function() {
    const {
      isSectionMarkerToken,
      isSectionMarkerChordName,
      sectionMarkerChartLine,
      sectionMarkerAbcChordName,
      splitChartHeaderAndBody,
      rebalanceChartPulseSlots,
    } = require('./chordSheetUtils');
    expect(isSectionMarkerToken('# Verse 1')).toBe(true);
    expect(isSectionMarkerToken('[Chorus]')).toBe(true);
    expect(isSectionMarkerToken('Am')).toBe(false);
    expect(isSectionMarkerChordName('[Verse 1]')).toBe(true);
    expect(isSectionMarkerChordName('Am')).toBe(false);
    expect(sectionMarkerChartLine('[Bridge]')).toBe('# Bridge');
    expect(sectionMarkerChartLine('(Outro)')).toBe('# Outro');
    expect(sectionMarkerAbcChordName('Bridge')).toBe('[Bridge]');
    expect(sectionMarkerAbcChordName('(A Part)')).toBe('[A Part]');
    const split = splitChartHeaderAndBody('# Bridge\nC . . . |');
    expect(split.headerLine).toBe('# Bridge');
    expect(split.body).toContain('C');
  });

  test('normalizeLyricBlocks treats lone parenthetical lines as section headers', function() {
    const lyrics = ['(A Part)', 'first line', '', '(Spoken Bridge)', 'whispered words'];
    const blocks = normalizeLyricBlocks(lyrics);
    expect(blocks).toEqual([
      ['(A Part)', 'first line'],
      ['(Spoken Bridge)', 'whispered words'],
    ]);
    expect(normalizeSectionType('(A Part)')).toBe('a-part');
    expect(normalizeSectionType('(Spoken Bridge)')).toBe('spoken-bridge');
  });

  test('alignChordBlocksToLyrics maps strains in lyric order (Clawhammer)', function() {
    // Three melody strains appear as verse / pre-chorus / chorus in the lyrics.
    // A later bridge with no dedicated strain must not steal the chorus chart.
    const noteLines = [
      '"Em"zzzzzzzz|"F#m"zzzzzzzz|"Em"zzzzzzzz|"F#m"zzzzzzzz|',
      '"Am"zzzzzzzz|"C"zzzzzzzz|"Bm"zzzz"C"zzzz|"Em"zzzzzzzz||',
      '"Am"zzzzzzzz|"C"zzzzzzzz|"Bm"zzzzzzzz|"Em"zzzzzzzz|',
      '"Am"zzzzzzzz|"C"zzzzzzzz|"Bm"zzzzzzzz|"Em"zzzzzzzz||',
      '"F"zzzzzzzz|"E"zzzzzzzz|"G"zzzz"F"zzzz|"E"zzzzzzzz|',
      '"F"zzzzzzzz|"E"zzzzzzzz|"G"zzzz"F"zzzz|"E"zzzzzzzz||',
    ];
    const lyrics = [
      'In the shadows he emerges, a force to be reckoned',
      'A phantom of darkness, his presence not mistaken',
      'With eyes like a predator, he strikes with precision',
      'A villainous mastermind, the name is Clawhammer',
      '',
      '(Pre-Chorus)',
      "He's a man of secrets, hiding in the night",
      'A deadly touch that freezes',
      "He'll twist your every move, leaving no trace behind",
      "Clawhammer's reign of terror, there's no escape to find",
      '',
      '(Chorus)',
      'Clawhammer, the man with a heart of steel',
      "He'll break you down, no mercy he will feel",
      'From the ashes he rises, the ultimate foe',
      "Bond, beware, he's ready to overthrow",
      '',
      '(Verse 2)',
      'His lair is a fortress, guarded by loyal minions',
      'A web of deception, his empire keeps expanding',
      'He weaves intricate plans, with cunning and precision',
      'A symphony of chaos, orchestrated by Clawhammer',
      '',
      '(Bridge)',
      "He's got a taste for power, a hunger that won't fade",
      'No boundaries he respects, as darkness leads the way',
      "But Bond won't back down, he'll face him in the night",
      'With courage and resilience, he\'ll restore the light',
      '',
      '(Chorus)',
      'Clawhammer, the man with a heart of steel',
      "He'll break you down, no mercy he will feel",
      'From the ashes he rises, the ultimate foe',
      "Bond, beware, he's ready to overthrow",
    ];
    const verseChart = 'Em | F#m | Em | F#m | Am | C | Bm C | Em |';
    const preChorusChart = 'Am | C | Bm | Em | Am | C | Bm | Em |';
    const chorusChart = 'F | E | G F | E | F | E | G F | E |';
    const aligned = alignChordBlocksToLyrics(lyrics, [verseChart, preChorusChart, chorusChart], {
      melodyNoteLines: noteLines,
    });
    expect(aligned.map(function(b) { return b.type; })).toEqual([
      'verse', 'prechorus', 'chorus', 'verse', 'bridge', 'chorus',
    ]);
    expect(aligned[0].chart).toBe(verseChart);
    expect(aligned[1].chart).toBe(preChorusChart);
    expect(aligned[2].chart).toBe(chorusChart);
    expect(aligned[3].chart).toBe(verseChart);
    expect(aligned[4].chart).toBe('');
    expect(aligned[5].chart).toBe(chorusChart);
    expect(aligned[5].chartRevisit).toBe(true);
  });

  test('parseLyricBlockPinIndexes reads @N tokens in listed order', function() {
    const { parseLyricBlockPinIndexes, stripLyricBlockPinTokens } = require('./chordSheetUtils');
    expect(parseLyricBlockPinIndexes('# chorus @1')).toEqual([0]);
    expect(parseLyricBlockPinIndexes('# instrumental @1 @2')).toEqual([0, 1]);
    expect(parseLyricBlockPinIndexes('# instrumental @2 @1')).toEqual([1, 0]);
    expect(parseLyricBlockPinIndexes('# bridge @3', 3)).toEqual([2]);
    expect(parseLyricBlockPinIndexes('# bridge @3', 2)).toEqual([]);
    expect(parseLyricBlockPinIndexes('# verse @0')).toEqual([]);
    expect(parseLyricBlockPinIndexes('# chorus')).toEqual([]);
    expect(stripLyricBlockPinTokens('# chorus @1')).toBe('# chorus');
    expect(stripLyricBlockPinTokens('# instrumental @1 @2')).toBe('# instrumental');
    expect(normalizeSectionType('# chorus @1')).toBe('chorus');
    expect(normalizeSectionType('# instrumental verse and chorus @1 @2')).toBe('instrumental');
  });

  test('alignChordBlocksToLyrics @N overrides auto allocation (Shallow Hate Grave)', function() {
    const noteLines = [
      '"D"zzzzzzzz|"G"zzzz"D"zzzz|"G"zzzz"Bm"zzzz|"G"zzzz"D"zzzz|',
      '"D"zzzzzzzz|"G"zzzz"D"zzzz|"G"zzzz"Bm"zzzz|"G"zzzz"D"zzzz||',
      '"A"zzzz"D"zzzz|"A"zzzz"Bm"zzzz|"Bm"zzzzzzzz|"Bm"zzzzzzzz|',
      '"D"zzzz"G"zzzz|"D"zzzz"G"zzzz|"D"zzzzzzzz|"D"zzzzzzzz||',
      '"Bm"zzzzzzzz|"Bm"zzzzzzzz|"G"zzzzzzzz|"D"zzzzzzzz|',
      '"Bm"zzzzzzzz|"Bm"zzzzzzzz|"G"zzzzzzzz|"D"zzzzzzzz||',
    ];
    const verseChart = 'D | G D | G Bm | G D | D | G D | G Bm | G D |';
    const chorusChart = 'A D | A Bm | Bm | Bm | D G | D G | D | D |';
    const bridgeChart = 'Bm | Bm | G | D | Bm | Bm | G | D |';
    const lyrics = [
      '#verse',
      'The tone that you use',
      '',
      '# chorus 1',
      'It resonates to hate',
      '',
      '# instrumental verse and chorus @1 @2',
      '',
      '# bridge @3',
      'People in trouble',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, [verseChart, chorusChart, bridgeChart], {
      melodyNoteLines: noteLines,
    });
    expect(aligned.map(function(b) { return b.type; })).toEqual([
      'verse', 'chorus', 'instrumental', 'bridge',
    ]);
    expect(aligned[0].chart).toBe(verseChart);
    expect(aligned[1].chart).toBe(chorusChart);
    expect(aligned[2].chart).toBe(verseChart + '\n\n' + chorusChart);
    expect(aligned[2].chartSections).toEqual([verseChart, chorusChart]);
    expect(aligned[2].melodyStrainIndexes).toEqual([0, 1]);
    expect(aligned[2].header).toContain('@1 @2');
    expect(aligned[2].chartRevisit).toBe(true);
    expect(aligned[3].chart).toBe(bridgeChart);
    expect(aligned[3].melodyStrainIndex).toBe(2);
    expect(aligned[3].chartRevisit).toBe(false);
  });

  test('alignChordBlocksToLyrics unpinned instrumental still takes the next strain', function() {
    const noteLines = [
      '"D"zzzzzzzz|"G"zzzzzzzz||',
      '"A"zzzzzzzz|"Bm"zzzzzzzz||',
      '"Bm"zzzzzzzz|"G"zzzzzzzz||',
    ];
    const verseChart = 'D | G |';
    const chorusChart = 'A | Bm |';
    const bridgeChart = 'Bm | G |';
    const lyrics = [
      '#verse',
      'verse words',
      '',
      '# chorus',
      'chorus words',
      '',
      '# instrumental verse and chorus',
      '',
      '# bridge',
      'bridge words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, [verseChart, chorusChart, bridgeChart], {
      melodyNoteLines: noteLines,
    });
    expect(aligned[2].type).toBe('instrumental');
    expect(aligned[2].chart).toBe(bridgeChart);
    expect(aligned[3].chart).toBe('');
  });

  test('alignChordBlocksToLyrics @N overrides only the pinned block', function() {
    const verseChart = 'VERSECHORDS';
    const chorusChart = 'CHORUSCHORDS';
    const lyrics = [
      '# verse',
      'first verse words',
      '',
      '# chorus @1',
      'chorus words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, [verseChart, chorusChart]);
    expect(aligned[0]).toMatchObject({ type: 'verse', chart: verseChart, chartRevisit: false });
    expect(aligned[1]).toMatchObject({ type: 'chorus', chart: verseChart, melodyStrainIndex: 0, chartRevisit: true });
  });

  test('alignChordBlocksToLyrics @2 @1 joins charts in listed order', function() {
    const verseChart = 'VERSECHORDS';
    const chorusChart = 'CHORUSCHORDS';
    const lyrics = [
      '# verse',
      'verse words',
      '',
      '# chorus',
      'chorus words',
      '',
      '# instrumental @2 @1',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, [verseChart, chorusChart]);
    const instrumental = aligned.find(function(b) { return b.type === 'instrumental'; });
    expect(instrumental.chart).toBe(chorusChart + '\n\n' + verseChart);
    expect(instrumental.chartSections).toEqual([chorusChart, verseChart]);
    expect(instrumental.melodyStrainIndexes).toEqual([1, 0]);
    expect(instrumental.chartRevisit).toBe(true);
  });

  test('alignChordBlocksToLyrics later unmarked chorus reuses first pinned chart', function() {
    const verseChart = 'VERSECHORDS';
    const chorusChart = 'CHORUSCHORDS';
    const lyrics = [
      '# verse',
      'verse one',
      '',
      '# chorus @1',
      'chorus one',
      '',
      '# verse',
      'verse two',
      '',
      '# chorus',
      'chorus two',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, [verseChart, chorusChart]);
    expect(aligned[1].chart).toBe(verseChart);
    expect(aligned[1].chartRevisit).toBe(true);
    expect(aligned[3].chart).toBe(verseChart);
    expect(aligned[3].chartRevisit).toBe(true);
  });

  test('alignChordBlocksToLyrics does not split a labeled chorus that contains a minichorus hook', function() {
    const mini = [
      "And a rovin' a rovin' a rovin' I'll go",
      'For a pair of brown eyes',
    ];
    const fullChorus = [
      "And a rovin' a rovin' a rovin' I'll go",
      "And a rovin' a rovin' a rovin' I'll go",
      "And a rovin' a rovin' a rovin' I'll go",
      'For a pair of brown eyes',
      'For a pair of brown eyes',
    ];
    const noteLines = [
      '"G"zzzzzz|"G"zzzzzz|"G"zzzzzz|"G"zzzzzz||',
      '"G"zzzzzz|"Am"zzzzzz|"C"zzzzzz|"G"zzzzzz|"C"zzzzzz|"C"zzzzzz|"Am"zzzzzz|"Am"zzzzzz||',
      '"G"zzzzzz|"Am"zzzzzz|"C"zzzzzz|"G"zzzzzz|"G"zzzzzz|"Am"zzzzzz|"C"zzzzzz|"G"zzzzzz||',
      '"C"zzzzzz|"C"zzzzzz|"C"zzzzzz|"C"zzzzzz|"Am"zzzzzz|"Am"zzzzzz|"Am"zzzzzz|"Am"zzzzzz||',
    ];
    const verseChart = 'G | G | G | G |';
    const miniChart = 'G | Am | C | G | C | C | Am | Am |';
    const chorusChart = 'G | Am | C | G | G | Am | C | G |';
    const instrumentalChart = 'C | C | C | C | Am | Am | Am | Am |';
    const lyrics = [
      '# verse',
      'One summer evening drunk to hell',
      '',
      '# minichorus',
      ...mini,
      '',
      '# verse',
      'I looked at him he looked at me',
      '',
      '# chorus @3',
      ...fullChorus,
      '',
      '# instrumental @4',
      '',
      '# chorus @3',
      ...fullChorus,
    ];
    const aligned = alignChordBlocksToLyrics(
      lyrics,
      [verseChart, miniChart, chorusChart, instrumentalChart],
      { melodyNoteLines: noteLines }
    );
    expect(aligned.map(function(b) { return b.type; })).toEqual([
      'verse', 'minichorus', 'verse', 'chorus', 'instrumental', 'chorus',
    ]);
    expect(aligned[3].lyricLines).toEqual(fullChorus);
    expect(aligned[3].chart).toBe(chorusChart);
    expect(aligned[4].chart).toBe(instrumentalChart);
    expect(aligned[3].chart).not.toBe(instrumentalChart);
    expect(aligned[5].chart).toBe(chorusChart);
    expect(aligned[5].chartRevisit).toBe(true);
  });

  test('alignChordBlocksToLyrics @N still shows a chart that has not been displayed', function() {
    const verseChart = 'VERSECHORDS';
    const chorusChart = 'CHORUSCHORDS';
    const bridgeChart = 'BRIDGECHORDS';
    const lyrics = [
      '# verse',
      'verse words',
      '',
      '# chorus',
      'chorus words',
      '',
      '# bridge @3',
      'bridge words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, [verseChart, chorusChart, bridgeChart]);
    expect(aligned[2]).toMatchObject({ type: 'bridge', chart: bridgeChart, chartRevisit: false });
  });

  test('alignChordBlocksToLyrics @N on later verses shows distinct charts (Run Dotteral Run)', function() {
    const chorusChart = 'F | C | G | Dm |';
    const v1Chart = 'Dm | Dm | Dm | Gm Dm |';
    const v2Chart = 'C | G | C | Dm |';
    const v3Chart = 'C F | C F | A# F | C F |';
    const lyrics = [
      '# chorus',
      '[F] run [C]dotteral [G]run',
      '',
      '# v1 (wade in the water) @2',
      '[Dm]wade in the water',
      '',
      '# chorus',
      '',
      '# v2  @3',
      '[C]duck and dive when the [G]gulls attack',
      '',
      '# chorus',
      '',
      '# v3 (sin dje dje) @4',
      '[C]investment [F]in our [C]tiny [F]eggs',
      '',
      '# chorus',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, [chorusChart, v1Chart, v2Chart, v3Chart], {
      melodyNoteLines: [
        '"F"zzzzzzzz|"C"zzzzzzzz|"G"zzzzzzzz|"Dm"zzzzzzzz||',
        '"Dm"zzzzzzzz|"Dm"zzzzzzzz|"Dm"zzzzzzzz|"Gm"zzzz"Dm"zzzz||',
        '"C"zzzzzzzz|"G"zzzzzzzz|"C"zzzzzzzz|"Dm"zzzzzzzz||',
        '"C"zzzz"F"zzzz|"C"zzzz"F"zzzz|"A#"zzzz"F"zzzz|"C"zzzz"F"zzzz||',
      ],
    });
    expect(aligned.map(function(b) {
      return { type: b.type, chartRevisit: b.chartRevisit };
    })).toEqual([
      { type: 'chorus', chartRevisit: false },
      { type: 'verse', chartRevisit: false },
      { type: 'chorus', chartRevisit: true },
      { type: 'verse', chartRevisit: false },
      { type: 'chorus', chartRevisit: true },
      { type: 'verse', chartRevisit: false },
      { type: 'chorus', chartRevisit: true },
    ]);
    expect(aligned[1]).toMatchObject({ chart: v1Chart, melodyStrainIndex: 1 });
    expect(aligned[3]).toMatchObject({ chart: v2Chart, melodyStrainIndex: 2 });
    expect(aligned[5]).toMatchObject({ chart: v3Chart, melodyStrainIndex: 3 });
  });

  test('rebalanceChartPulseSlots adjusts slots on meter change', function() {
    const { rebalanceChartPulseSlots } = require('./chordSheetUtils');
    const result = rebalanceChartPulseSlots(
      'C . . . . . . . | [M:3/4] G . . . . . |',
      '4/4',
      '1/8'
    );
    expect(result.chart).toContain('[M:3/4]');
    const afterMeter = result.chart.split('[M:3/4]')[1] || '';
    const dots = (afterMeter.match(/\./g) || []).length;
    expect(dots).toBeGreaterThanOrEqual(5);
  });

  test('rebalanceChartPulseSlots preserves chord pulse indices', function() {
    const { rebalanceChartPulseSlots } = require('./chordSheetUtils');
    const result = rebalanceChartPulseSlots('C . G . . . . . |', '4/4', '1/8');
    const parts = result.chart.replace(/\|/g, '').trim().split(/\s+/);
    expect(parts[0]).toBe('C');
    expect(parts[2]).toBe('G');
    expect(parts.filter(function(p) { return p === '.'; }).length).toBe(6);
  });

  test('melodyTextHasSectionMarkerChord detects quoted section labels in ABC', function() {
    const { melodyTextHasSectionMarkerChord } = require('./chordSheetUtils');
    expect(melodyTextHasSectionMarkerChord('"[Verse 1]" z z z | "C" z z z |', '[Verse 1]')).toBe(true);
    expect(melodyTextHasSectionMarkerChord('"C" z z z |', '[Verse 1]')).toBe(false);
  });

  test('firstSectionMarkerHeaderInMelodyText returns first quoted section label', function() {
    const { firstSectionMarkerHeaderInMelodyText } = require('./chordSheetUtils');
    expect(firstSectionMarkerHeaderInMelodyText('"[Verse 1]" z z z | "C" z z z |')).toBe('[Verse 1]');
    expect(firstSectionMarkerHeaderInMelodyText('"C" z z z |')).toBe('');
    expect(firstSectionMarkerHeaderInMelodyText('"[Chorus]" z | "[Bridge]" z |')).toBe('[Chorus]');
  });

  test('expandLegacyBeatSlotsInChart expands beat-level bars to pulse slots', function() {
    const { expandLegacyBeatSlotsInChart } = require('./chordSheetUtils');
    expect(expandLegacyBeatSlotsInChart('C . . . |', '4/4', '1/8')).toBe('C . . . . . . . |');
    expect(expandLegacyBeatSlotsInChart('C G Am F |', '4/4', '1/8')).toBe('C . G . Am . F . |');
  });

  test('extractChordSequence excludes section marker chord names', function() {
    expect(extractChordSequence('[Verse] . . . | C . . . |')).toEqual(['C']);
  });

  test('inline meter rebalance mid-block contracts pulse slots', function() {
    const { rebalanceChartPulseSlots } = require('./chordSheetUtils');
    const result = rebalanceChartPulseSlots(
      'C . . . . . . . | [M:3/4] G . . . . . . |',
      '4/4',
      '1/8'
    );
    expect(result.chart).toContain('[M:3/4]');
    const afterMeter = result.chart.split('[M:3/4]')[1] || '';
    const dots = (afterMeter.match(/\./g) || []).length;
    expect(dots).toBeGreaterThanOrEqual(5);
    expect(dots).toBeLessThanOrEqual(6);
  });

  test('alignChordBlocksToLyrics assigns leftover untitled stanzas the next unused chart', function() {
    const lyrics = [
      'v1a', 'v1b', 'v1c', 'v1d', 'v1e', 'v1f', '',
      'c1a', 'c1b', 'c1c', 'c1d', '',
      'v2a', 'v2b', 'v2c', 'v2d', 'v2e', 'v2f', '',
      'c2a', 'c2b', 'c2c', 'c2d', '',
      'x1a', 'x1b', 'x1c', 'x1d', 'x1e', '',
      'c3a', 'c3b', 'c3c', 'c3d',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['VERSECHORDS', 'CHORUSCHORDS', 'LEFTOVERCHORDS']);
    expect(aligned.map(function(b) { return b.type; })).toEqual([
      'verse', 'chorus', 'verse', 'chorus', null, 'chorus',
    ]);
    expect(aligned[4].chart).toBe('LEFTOVERCHORDS');
    expect(aligned[4].header).toBeFalsy();
  });

  test('untitled [] and # @N headers start sections with empty display titles', function() {
    const lyrics = [
      '[]',
      'untitled words',
      '',
      '# @1',
      'pinned untitled',
      '',
      '[Chorus]',
      'chorus words',
    ];
    const aligned = alignChordBlocksToLyrics(lyrics, ['FIRSTCHORDS', 'SECONDCHORDS', 'CHORUSCHORDS']);
    expect(aligned.length).toBe(3);
    expect(aligned[0].header).toBe('[]');
    expect(aligned[0].type).toBeNull();
    expect(aligned[1].header).toBe('# @1');
    expect(aligned[1].type).toBeNull();
    expect(aligned[2].type).toBe('chorus');
  });

  test('normalizeLyricBlocks does not absorb unlabeled lyrics across a double blank', function() {
    const lyrics = [
      '[Verse]',
      'verse line one',
      'verse line two',
      '',
      '',
      'untitled after double blank',
      '',
      '[Chorus]',
      'chorus words',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['[Verse]', 'verse line one', 'verse line two'],
      ['untitled after double blank'],
      ['[Chorus]', 'chorus words'],
    ]);
  });

  test('normalizeLyricBlocks still absorbs a single-blank tag into the preceding verse', function() {
    const lyrics = [
      '[Verse]',
      'verse line one',
      'verse line two',
      '',
      'One more for the road',
      '',
      '[Chorus]',
      'chorus words',
    ];
    expect(normalizeLyricBlocks(lyrics)).toEqual([
      ['[Verse]', 'verse line one', 'verse line two', '', 'One more for the road'],
      ['[Chorus]', 'chorus words'],
    ]);
  });

  test('mergeAlignedLyricBlockChords pairs two lyrics per chord line when lyrics outnumber chords', function() {
    const merged = mergeAlignedLyricBlockChords({
      inlineChords: true,
      chart: 'C | G |\nAm | F |',
      lyricLines: ['one aa', 'one bb', 'two aa', 'two bb'],
    });
    expect(merged).toHaveLength(4);
    expect(merged[0].some(function(t) { return t.chord === 'C'; })).toBe(true);
    expect(merged[1].some(function(t) { return t.chord === 'G'; })).toBe(true);
    expect(merged[2].some(function(t) { return t.chord === 'Am'; })).toBe(true);
    expect(merged[3].some(function(t) { return t.chord === 'F'; })).toBe(true);
  });

  test('mergeAlignedLyricBlockChords maps 1:1 when chord lines cover every lyric', function() {
    const merged = mergeAlignedLyricBlockChords({
      inlineChords: true,
      chart: 'C |\nG |',
      lyricLines: ['one aa', 'two bb'],
    });
    expect(merged).toHaveLength(2);
    expect(merged[0].some(function(t) { return t.chord === 'C'; })).toBe(true);
    expect(merged[1].some(function(t) { return t.chord === 'G'; })).toBe(true);
  });

  test('mergeAlignedLyricBlockChords leaves a trailing lyric bare when a fifth line is leftover', function() {
    const merged = mergeAlignedLyricBlockChords({
      inlineChords: true,
      chart: 'C | G |\nAm | F |',
      lyricLines: ['one aa', 'one bb', 'two aa', 'two bb', 'bare line here'],
    });
    expect(merged).toHaveLength(5);
    expect(merged[4].every(function(t) { return !t.chord; })).toBe(true);
    expect(merged[4].some(function(t) { return String(t.text).indexOf('bare') >= 0; })).toBe(true);
  });

  test('mergeAlignedLyricBlockChords puts extra chord lines after the lyrics', function() {
    const merged = mergeAlignedLyricBlockChords({
      inlineChords: true,
      chart: 'C | G |\nAm | F |\nDm |',
      lyricLines: ['one aa', 'one bb', 'two aa', 'two bb'],
    });
    expect(merged.length).toBeGreaterThan(4);
    expect(merged.slice(0, 4).every(function(row) {
      return row.some(function(t) { return t.text && String(t.text).trim(); });
    })).toBe(true);
    const extra = merged.slice(4);
    expect(extra.length).toBe(1);
    expect(extra[0].some(function(t) { return t.chord === 'Dm'; })).toBe(true);
    expect(extra[0].every(function(t) { return !String(t.text || '').trim(); })).toBe(true);
  });

  test('mergeAlignedLyricBlockChords uses 1:1 then extras when chord lines exceed lyrics', function() {
    const merged = mergeAlignedLyricBlockChords({
      inlineChords: true,
      chart: 'C |\nG |\nAm |\nF |\nDm |',
      lyricLines: ['one aa', 'two bb', 'three cc', 'four dd'],
    });
    expect(merged).toHaveLength(5);
    expect(merged[0].some(function(t) { return t.chord === 'C'; })).toBe(true);
    expect(merged[3].some(function(t) { return t.chord === 'F'; })).toBe(true);
    expect(merged[4].some(function(t) { return t.chord === 'Dm'; })).toBe(true);
    expect(merged[4].every(function(t) { return !String(t.text || '').trim(); })).toBe(true);
  });

  test('mergeAlignedLyricBlockChords skips internal blank lyrics when pairing chords', function() {
    const merged = mergeAlignedLyricBlockChords({
      inlineChords: true,
      chart: 'C | G |\nAm | F |',
      lyricLines: ['one aa', 'one bb', '', 'two aa', 'two bb'],
    });
    expect(merged).toHaveLength(5);
    expect(merged[2]).toEqual([]);
    expect(merged[0].some(function(t) { return t.chord === 'C'; })).toBe(true);
    expect(merged[1].some(function(t) { return t.chord === 'G'; })).toBe(true);
    expect(merged[3].some(function(t) { return t.chord === 'Am'; })).toBe(true);
    expect(merged[4].some(function(t) { return t.chord === 'F'; })).toBe(true);
  });
});
