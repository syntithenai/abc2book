import { tokenIsChord, isChordLine, isSectionHeader, isLyricVersionSeparator, truncateLyricLinesAtVersionSeparator, classifyLyricChordLines, hasChordLines, splitIntoBlocks, coalesceSectionHeaderBlocks, splitBlocksOnInteriorHeaders, normalizeLyricBlocks, normalizeSectionType, isLeadingTitleComposerLine, splitChordChartIntoBlocks, alignChordBlocksToLyrics, extractChordSequence, extractChordBars, mergeChordsIntoLyricLines, expandRepeatedSectionLyrics, chartBlockHasChords, fillEmptyBarsWithSlash, formatChordChartForDisplay, charOffsetToWordIndex } from './chordSheetUtils';

describe('chordSheetUtils', function() {
  test('recognises chord tokens', function() {
    ['C', 'Bb', 'C7', 'Dm/C', 'Gm7', 'A7', 'F#m', 'Am/E', 'Am9'].forEach(function(c) {
      expect(tokenIsChord(c)).toBe(true);
    });
    ['I', 'really', 'like', 'Christmas', 'Oh'].forEach(function(w) {
      expect(tokenIsChord(w)).toBe(false);
    });
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

  test('identifies section headers', function() {
    expect(isSectionHeader('[Verse 1]')).toBe(true);
    expect(isSectionHeader('[Chorus]')).toBe(true);
    expect(isSectionHeader('Bridge')).toBe(true);
    expect(isSectionHeader('I really like Christmas')).toBe(false);
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
    expect(isSectionHeader('# I really like Christmas')).toBe(false);
    expect(isSectionHeader('first verse words here')).toBe(false);
  });

  test('splitBlocksOnInteriorHeaders separates consecutive section markers', function() {
    const blocks = splitIntoBlocks(['# Verse 3', '– solo', '', '# Chorus 3', 'sing']);
    expect(splitBlocksOnInteriorHeaders(blocks)).toEqual([
      ['# Verse 3'],
      ['– solo'],
      ['# Chorus 3', 'sing'],
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

  test('splitIntoBlocks groups lines on blank lines', function() {
    const blocks = splitIntoBlocks(['a', 'b', '', 'c', '', '', 'd']);
    expect(blocks).toEqual([['a', 'b'], ['c'], ['d']]);
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

  test('splitChordChartIntoBlocks splits at the blank lines emitted for double barlines', function() {
    const chart = 'F | F | Bb | F |\nBb | F | C |\n\nBb | F | Gm | C |\n\nGm | C | F |';
    expect(splitChordChartIntoBlocks(chart)).toEqual([
      'F | F | Bb | F |\nBb | F | C |',
      'Bb | F | Gm | C |',
      'Gm | C | F |',
    ]);
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
    expect(fillEmptyBarsWithSlash('| Am |')).toBe(' / | Am |');
    expect(fillEmptyBarsWithSlash('Fm | / | Am |')).toBe('Fm | / | Am |');
    expect(fillEmptyBarsWithSlash('Am G | D |')).toBe('Am G | D |');
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
    // every section reuses the correct chord block by type; first occurrence
    // and revisits with words both merge inline; structure uses chartRevisit.
    expect(aligned[0]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS', inlineChords: true, chartRevisit: false });
    expect(aligned[1]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS', inlineChords: true, chartRevisit: false });
    expect(aligned[2]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS', inlineChords: true, chartRevisit: true });
    expect(aligned[3]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS', inlineChords: true, chartRevisit: true });
    expect(aligned[4]).toMatchObject({ type: 'bridge', chart: 'BRIDGECHORDS', inlineChords: true, chartRevisit: false });

    // every lyric line is preserved
    expect(aligned[2].lyricLines).toEqual(['second verse words']);
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

  test('chordSectionLabels match charts by name when lyric order differs', function() {
    // Charts are Verse then Chorus; lyrics are Chorus then Verse.
    // Without labels, sequential mapping would put VERSECHORDS on the chorus.
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
    expect(aligned[0]).toMatchObject({ type: 'chorus', chart: 'CHORUSCHORDS' });
    expect(aligned[1]).toMatchObject({ type: 'verse', chart: 'VERSECHORDS' });
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
      if (index === 0) {
        expect(block.chartRevisit).toBe(false);
      } else {
        expect(block.chartRevisit).toBe(true);
      }
    });
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
    expect(aligned[2].chart).toBe(''); // no chord block left, but words still shown
    expect(aligned[2].inlineChords).toBe(false);
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

  test('attaches unmapped chord blocks before the last unidentified lyric block', function() {
    const lyrics = ['[Verse 1]', 'only verse here'];
    const chordBlocks = ['VERSECHORDS', 'ORPHANCHORDS'];
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks);
    expect(aligned.length).toBe(1);
    expect(aligned[0].inlineChords).toBe(true);
    expect(aligned[0].extraChart).toBe('ORPHANCHORDS');
  });

  test('attaches orphan chords before last lyric block with no mapped chart', function() {
    const lyrics = [
      '[Verse 1]', 'verse words', '',
      'outro words with no section header',
    ];
    // One typed section maps to first chart; second chart is orphan.
    // Second lyric block has no type/chart → receives orphan as extraChart.
    const chordBlocks = ['VERSECHORDS', 'OUTROCHORDS'];
    const aligned = alignChordBlocksToLyrics(lyrics, chordBlocks);
    expect(aligned.length).toBe(2);
    expect(aligned[0].chart).toBe('VERSECHORDS');
    expect(aligned[1].chart).toBe('');
    expect(aligned[1].extraChart).toBe('OUTROCHORDS');
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
});
