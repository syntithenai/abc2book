import {
  appendChordsEditorSection,
  applyChordSectionLabels,
  applyPasteSectionToTuneSections,
  buildTuneSectionsFromPaste,
  extractKeyFromChartBlock,
  extractMeterFromChartBlock,
  extractTempoFromChartBlock,
  firstSectionKey,
  firstSectionMeter,
  insertChordsEditorSectionAfter,
  listChordsEditorSections,
  listPasteChordSections,
  matchPasteSectionToTune,
  prependInlineSignatureMarkers,
  prependMeterMarker,
  rebuildChordGridFromSections,
  reconcileChordSectionsFromGrid,
  removeChordsEditorSection,
  lyricLinesAfterHeaderPatches,
  renameChordsEditorSection,
  replaceSectionChart,
  replaceSectionKey,
  replaceSectionMeter,
  prepareSectionChartDraft,
  prepareChordGridDraft,
  reorderChordsEditorSections,
  stripInlineSignatureMarkers,
} from './chordsEditorSections';

describe('chordsEditorSections', function() {
  test('no lyrics yields a single Chords section', function() {
    const sections = listChordsEditorSections({
      lyricLines: [],
      chordChart: 'C . . . | F . . . |\nG . . . | C . . . |',
      defaultMeter: '4/4',
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe('Chords');
    expect(sections[0].meter).toBe('4/4');
    expect(stripInlineSignatureMarkers(sections[0].chart)).toContain('C');
  });

  test('typed lyric sections align charts and mark revisits', function() {
    const lyricLines = [
      '[Verse 1]',
      'hello world',
      '',
      '[Chorus]',
      'sing along',
      '',
      '[Verse 2]',
      'again here',
    ];
    const chordChart = 'Am . . . | G . . . |\n\nC . . . | F . . . |';
    const sections = listChordsEditorSections({
      lyricLines: lyricLines,
      chordChart: chordChart,
      defaultMeter: '4/4',
    });
    expect(sections.length).toBeGreaterThanOrEqual(3);
    const verse1 = sections.find(function(s) { return s.title.indexOf('Verse 1') >= 0; });
    const chorus = sections.find(function(s) { return s.title.indexOf('Chorus') >= 0; });
    const verse2 = sections.find(function(s) { return s.title.indexOf('Verse 2') >= 0; });
    expect(verse1).toBeTruthy();
    expect(chorus).toBeTruthy();
    expect(verse2).toBeTruthy();
    expect(verse2.chartRevisit).toBe(true);
    expect(verse1.chartRevisit).toBe(false);
  });

  test('replaceSectionChart updates shared type including revisits', function() {
    const sections = [
      { key: 'verse-0', title: 'Verse 1', type: 'verse', sourceTypeKey: 'verse', chart: 'Am|', meter: '4/4', chartRevisit: false },
      { key: 'chorus-1', title: 'Chorus', type: 'chorus', sourceTypeKey: 'chorus', chart: 'C|', meter: '4/4', chartRevisit: false },
      { key: 'verse-2', title: 'Verse 2', type: 'verse', sourceTypeKey: 'verse', chart: 'Am|', meter: '4/4', chartRevisit: true },
    ];
    const next = replaceSectionChart(sections, 'verse-2', 'Dm G|', '3/4');
    expect(next[0].chart).toBe('Dm G|');
    expect(next[0].meter).toBe('3/4');
    expect(next[2].chart).toBe('Dm G|');
    expect(next[2].chartRevisit).toBe(true);
    expect(next[1].chart).toBe('C|');
  });

  test('replaceSectionChart does not auto-set writeNotationMarker on chord edits', function() {
    const sections = [
      { key: 'verse-0', title: 'Verse', header: '[Verse]', type: 'verse', chart: 'Am|', meter: '4/4', chartRevisit: false },
    ];
    const next = replaceSectionChart(sections, 'verse-0', 'Dm G|', '4/4');
    expect(next[0].writeNotationMarker).toBeFalsy();
    expect(next[0].chart).toBe('Dm G|');
  });

  test('replaceSectionMeter blocks when rebalance would drop chords', function() {
    const sections = [
      {
        key: 'verse-0',
        title: 'Verse',
        chart: 'C D E F G A B C |',
        meter: '4/4',
        chartRevisit: false,
      },
    ];
    const result = replaceSectionMeter(sections, 'verse-0', '3/4', '1/8');
    expect(result.ok).toBe(false);
    expect(result.droppedChords && result.droppedChords.length).toBeGreaterThan(0);
  });

  test('replaceSectionMeter rebalances and prepends inline meter marker', function() {
    const sections = [
      {
        key: 'verse-0',
        title: 'Verse',
        chart: 'C . . . . . . . |',
        meter: '4/4',
        chartRevisit: false,
      },
    ];
    const result = replaceSectionMeter(sections, 'verse-0', '3/4', '1/8');
    expect(result.ok).toBe(true);
    expect(result.sections[0].meter).toBe('3/4');
    expect(result.sections[0].chart).toContain('[M:3/4]');
    const afterMeter = result.sections[0].chart.split('[M:3/4]')[1] || '';
    expect((afterMeter.match(/\./g) || []).length).toBeGreaterThanOrEqual(5);
  });

  test('renameChordsEditorSection sets writeNotationMarker', function() {
    const sections = [
      { key: 'verse-0', title: 'Verse', header: '[Verse]', type: 'verse', chart: 'Am|', meter: '4/4', chartRevisit: false },
    ];
    const renamed = renameChordsEditorSection(sections, 'verse-0', 'Verse 1', []);
    expect(renamed.ok).toBe(true);
    expect(renamed.sections[0].writeNotationMarker).toBe(true);
  });

  test('prepareSectionChartDraft rebalances on inline [M:] edit', function() {
    const section = {
      key: 'verse-0',
      chart: 'C . . . . . . . | G . . . . . . . |',
      meter: '4/4',
      header: '[Verse]',
      title: 'Verse',
    };
    const prep = prepareSectionChartDraft(
      section,
      'C . . . . . . . | [M:3/4] G . . . . . . |',
      '1/8'
    );
    expect(prep.ok).toBe(true);
    expect(prep.chart).toContain('[M:3/4]');
    const afterMeter = prep.chart.split('[M:3/4]')[1] || '';
    expect((afterMeter.match(/\./g) || []).length).toBeGreaterThanOrEqual(5);
  });

  test('prepareSectionChartDraft blocks when inline meter change drops chords', function() {
    const section = {
      key: 'verse-0',
      chart: 'C D E F G A B C |',
      meter: '4/4',
    };
    const prep = prepareSectionChartDraft(section, '[M:3/4] C D E F G A B C |', '1/8');
    expect(prep.ok).toBe(false);
    expect(prep.droppedChords && prep.droppedChords.length).toBeGreaterThan(0);
  });

  test('applyChordSectionLabels fuzzy match keeps melodyStrainIndex and charts', function() {
    const blocks = [
      { melodyStrainIndex: 0, chart: 'C . . . |', title: 'Verse 1', header: '[Verse 1]' },
      { melodyStrainIndex: 1, chart: 'G . . . |', title: 'Chorus', header: '[Chorus]' },
    ];
    const lyricLines = ['[Verse]', 'line one', '', '[Chorus]', 'chorus line'];
    const labels = [
      { header: '[Verse 1]', title: 'Verse 1', type: 'verse', chartRevisit: false },
      { header: '[Chorus]', title: 'Chorus', type: 'chorus', chartRevisit: false },
    ];
    const labeled = applyChordSectionLabels(blocks, labels, lyricLines);
    expect(labeled[0].melodyStrainIndex).toBe(0);
    expect(labeled[1].melodyStrainIndex).toBe(1);
    expect(labeled[0].chart).toContain('C');
    expect(labeled[1].chart).toContain('G');
  });

  test('reconcileChordSectionsFromGrid preserves inline [M:] in stored chart', function() {
    const sections = [
      { key: 'verse-0', title: 'Verse', chart: 'C . . . . . . . |', meter: '4/4', chartRevisit: false },
    ];
    const next = reconcileChordSectionsFromGrid(
      sections,
      'C . . . . . . . | [M:3/4] G . . . . . . |',
      '4/4'
    );
    expect(next[0].chart).toContain('[M:3/4]');
    expect(next[0].chart).toContain('G');
  });

  test('prepareChordGridDraft rebalances inline meter in whole grid', function() {
    const sections = [
      { key: 'verse-0', title: 'Verse', chart: 'C . . . . . . . | G . . . . . . . |', meter: '4/4', chartRevisit: false },
    ];
    const prep = prepareChordGridDraft(
      sections,
      'C . . . . . . . | [M:3/4] G . . . . . . |',
      '1/8'
    );
    expect(prep.ok).toBe(true);
    expect(prep.grid).toContain('[M:3/4]');
    const afterMeter = prep.grid.split('[M:3/4]')[1] || '';
    expect((afterMeter.match(/\./g) || []).length).toBeGreaterThanOrEqual(5);
  });

  test('rebuildChordGridFromSections emits [M:] when meters differ', function() {
    const grid = rebuildChordGridFromSections([
      { chart: 'C . . . |', meter: '4/4', chartRevisit: false },
      { chart: 'G . . |', meter: '3/4', chartRevisit: false },
      { chart: 'C . . . |', meter: '4/4', chartRevisit: true },
    ]);
    expect(grid).toContain('C . . . |');
    expect(grid).toContain('[M:3/4]');
    expect(grid).not.toMatch(/\[M:4\/4\]/);
    const blocks = grid.split(/\n\n/);
    expect(blocks).toHaveLength(2);
  });

  test('rebuildChordGridFromSections emits [Q:] when tempos differ', function() {
    const grid = rebuildChordGridFromSections([
      { chart: 'C . . . |', meter: '4/4', tempo: 100, chartRevisit: false },
      { chart: 'G . . . |', meter: '4/4', tempo: 140, chartRevisit: false },
    ]);
    expect(grid).toContain('[Q:140]');
    expect(extractTempoFromChartBlock(grid.split('\n\n')[1])).toBe(140);
  });

  test('rebuildChordGridFromSections keeps empty section slots', function() {
    const grid = rebuildChordGridFromSections([
      { chart: 'C|', meter: '4/4', chartRevisit: false },
      { chart: '', meter: '4/4', chartRevisit: false, title: 'Bridge' },
      { chart: 'G|', meter: '4/4', chartRevisit: false },
    ]);
    const blocks = grid.split(/\n{2,}/);
    expect(blocks).toHaveLength(3);
    expect(blocks[1].trim()).toBe('|');
  });

  test('delete first section does not remove the last section chart', function() {
    const sections = [
      { key: 'intro-0', title: 'Intro', type: 'intro', header: '[Intro]', sourceTypeKey: 'intro', chart: 'G D|', meter: '4/4', chartRevisit: false },
      { key: 'verse-1', title: 'Verse', type: 'verse', header: '[Verse]', sourceTypeKey: 'verse', chart: 'Am|', meter: '4/4', chartRevisit: false },
      { key: 'outro-2', title: 'Outro', type: 'outro', header: '[Outro]', sourceTypeKey: 'outro', chart: 'C Em|', meter: '4/4', chartRevisit: false },
    ];
    const withBridge = insertChordsEditorSectionAfter(sections, 'intro-0', 'Bridge', '4/4');
    expect(withBridge.map(function(s) { return s.title; })).toEqual(['Intro', 'Bridge', 'Verse', 'Outro']);
    expect(withBridge[1].chart).toBe('');
    expect(withBridge[1].needsAbcExpand).toBe(true);
    expect(withBridge[1].melodyStrainIndex).toBe(-1);
    const removedFirst = removeChordsEditorSection(withBridge, withBridge[0].key);
    expect(removedFirst.map(function(s) { return s.title; })).toEqual(['Bridge', 'Verse', 'Outro']);
    expect(removedFirst[0].title).toBe('Bridge');
    expect(removedFirst[removedFirst.length - 1].title).toBe('Outro');
    expect(removedFirst[removedFirst.length - 1].chart).toContain('C Em');
  });

  test('renameChordsEditorSection refuses conflicting non-revisit names', function() {
    const sections = [
      { key: 'verse-0', title: 'Verse 1', type: 'verse', header: '[Verse 1]', sourceTypeKey: 'verse', chart: 'Am|', meter: '4/4', chartRevisit: false },
      { key: 'chorus-1', title: 'Chorus', type: 'chorus', header: '[Chorus]', sourceTypeKey: 'chorus', chart: 'C|', meter: '4/4', chartRevisit: false },
      { key: 'chorus-2', title: 'Chorus', type: 'chorus', header: '[Chorus]', sourceTypeKey: 'chorus', chart: 'C|', meter: '4/4', chartRevisit: true },
    ];
    const conflict = renameChordsEditorSection(sections, 'chorus-1', 'Verse 1');
    expect(conflict.ok).toBe(false);
    expect(conflict.error).toMatch(/already named/i);
    const ok = renameChordsEditorSection(sections, 'verse-0', 'Intro');
    expect(ok.ok).toBe(true);
    expect(ok.sections[0].title).toBe('Intro');
    expect(ok.sections[0].header).toBe('[Intro]');
    // Revisit may keep sharing Chorus with its source.
    const revisitOk = renameChordsEditorSection(sections, 'chorus-2', 'Chorus');
    expect(revisitOk.ok).toBe(true);
  });

  test('applyChordSectionLabels matches lyric bodies by name not index', function() {
    const blocks = [
      { key: 'a-0', title: 'A', chart: 'G|', lyricLines: ['wrong'] },
      { key: 'b-1', title: 'B', chart: 'C|', lyricLines: ['also wrong'] },
    ];
    const labeled = applyChordSectionLabels(
      blocks,
      [
        { header: '[Chorus]', title: 'Chorus', type: 'chorus' },
        { header: '[Verse 1]', title: 'Verse 1', type: 'verse' },
      ],
      [
        '[Verse 1]',
        'verse words',
        '',
        '[Chorus]',
        'chorus words',
      ]
    );
    expect(labeled[0].title).toBe('Chorus');
    expect(labeled[0].lyricLines).toEqual(['chorus words']);
    expect(labeled[1].title).toBe('Verse 1');
    expect(labeled[1].lyricLines).toEqual(['verse words']);
  });

  test('prependInlineSignatureMarkers preserves mid-chart inline tokens', function() {
    const chart = 'C | [M:3/4] Am . . |';
    const result = prependInlineSignatureMarkers(chart, { key: 'C', meter: '3/4' }, { key: 'C', meter: '4/4' });
    expect(result).toContain('[M:3/4] Am');
    expect(result.split('[M:3/4]').length).toBe(3);
  });

  test('prependInlineSignatureMarkers emits key and meter changes', function() {
    const withKey = prependInlineSignatureMarkers('Am G|', { key: 'Am', meter: '4/4' }, { key: 'C', meter: '4/4' });
    expect(withKey).toContain('[K:Am]');
    const withMeter = prependInlineSignatureMarkers('Am G|', { key: 'C', meter: '3/4' }, { key: 'C', meter: '4/4' });
    expect(withMeter).toContain('[M:3/4]');
    expect(prependInlineSignatureMarkers('Am G|', { key: 'C', meter: '4/4' }, { key: 'C', meter: '4/4' })).toBe('Am G|');
  });

  test('prependMeterMarker and extractMeterFromChartBlock round-trip', function() {
    const withMeter = prependMeterMarker('Am G|', '3/4', '4/4');
    expect(withMeter).toMatch(/^\[M:3\/4\]/);
    expect(extractMeterFromChartBlock(withMeter)).toBe('3/4');
    expect(stripInlineSignatureMarkers(withMeter)).toBe('Am G|');
    expect(prependMeterMarker('Am G|', '4/4', null)).toBe('Am G|');
  });

  test('prependMeterMarker emits tempo change markers', function() {
    const withTempo = prependMeterMarker('Am G|', '4/4', '4/4', 140, 100);
    expect(withTempo).toContain('[Q:140]');
    expect(extractTempoFromChartBlock(withTempo)).toBe(140);
    expect(stripInlineSignatureMarkers(withTempo)).toBe('Am G|');
  });

  test('firstSectionMeter reads the first section', function() {
    expect(firstSectionMeter([
      { meter: '6/8' },
      { meter: '4/4' },
    ], '4/4')).toBe('6/8');
  });

  test('firstSectionKey reads the first section', function() {
    expect(firstSectionKey([
      { abcKey: 'G' },
      { abcKey: 'Am' },
    ], 'C')).toBe('G');
    expect(firstSectionKey([], 'F')).toBe('F');
  });

  test('replaceSectionKey updates section abcKey', function() {
    const sections = [
      { key: 'a-0', title: 'A', chart: 'C|', meter: '4/4', abcKey: 'C', chartRevisit: false },
      { key: 'b-1', title: 'B', chart: 'G|', meter: '4/4', abcKey: 'G', chartRevisit: false },
    ];
    const next = replaceSectionKey(sections, 'b-1', 'Am');
    expect(next[1].abcKey).toBe('Am');
  });

  test('rebuildChordGridFromSections emits inline key change after first block', function() {
    const grid = rebuildChordGridFromSections([
      { chart: 'C|', meter: '4/4', abcKey: 'C', chartRevisit: false },
      { chart: 'Am|', meter: '4/4', abcKey: 'Am', chartRevisit: false },
    ]);
    expect(grid.split('\n\n')[1]).toContain('[K:Am]');
    expect(grid.split('\n\n')[0]).not.toContain('[K:');
  });

  test('append and insert inherit contiguous key and meter from previous section', function() {
    const sections = [
      { key: 'a-0', title: 'A', chart: 'C|', meter: '4/4', abcKey: 'C', tempo: 100, chartRevisit: false },
      { key: 'b-1', title: 'B', chart: 'G|', meter: '3/4', abcKey: 'Am', tempo: 120, chartRevisit: false },
    ];
    const appended = appendChordsEditorSection(sections, 'Bridge', '4/4');
    expect(appended[2].meter).toBe('3/4');
    expect(appended[2].abcKey).toBe('Am');
    expect(appended[2].tempo).toBe(120);
    const inserted = insertChordsEditorSectionAfter(sections, 'a-0', 'Bridge');
    expect(inserted[1].meter).toBe('4/4');
    expect(inserted[1].abcKey).toBe('C');
    expect(inserted[1].tempo).toBe(100);
  });

  test('reorder and append chord sections do not require lyrics', function() {
    const start = [
      { key: 'a-0', title: 'A', type: null, header: '', chart: 'C|', meter: '4/4', chartRevisit: false },
      { key: 'b-1', title: 'B', type: null, header: '', chart: 'G|', meter: '4/4', chartRevisit: false },
    ];
    const reordered = reorderChordsEditorSections(start, 0, 2);
    expect(reordered[0].title).toBe('B');
    expect(reordered[1].title).toBe('A');
    const withNew = appendChordsEditorSection(reordered, 'Bridge', '4/4');
    expect(withNew).toHaveLength(3);
    expect(withNew[2].title).toBe('Bridge');
    expect(withNew[2].chart).toBe('');
  });

  test('paste match by type and apply save/add', function() {
    const tuneSections = [
      { key: 'chorus-0', title: 'Chorus', type: 'chorus', sourceTypeKey: 'chorus', chart: 'C|', meter: '4/4', chartRevisit: false },
    ];
    const paste = { title: 'Chorus', type: 'chorus', header: '[Chorus]', chart: 'Am G|', meter: '4/4' };
    expect(matchPasteSectionToTune(paste, tuneSections).key).toBe('chorus-0');
    const saved = applyPasteSectionToTuneSections(tuneSections, paste, 'save');
    expect(saved[0].chart).toBe('Am G|');
    const bridge = { title: 'Bridge', type: 'bridge', header: '[Bridge]', chart: 'F|', meter: '4/4' };
    const added = applyPasteSectionToTuneSections(tuneSections, bridge, 'add');
    expect(added).toHaveLength(2);
    expect(added[1].chart).toBe('F|');
  });

  test('listPasteChordSections uses alignment blocks when present', function() {
    const sections = listPasteChordSections({
      meter: '4/4',
      chordSheetAlignment: [
        {
          header: '[Verse 1]',
          type: 'verse',
          lines: ['hello'],
          linePairs: [{ chordLines: ['Am    G'], lyricLine: 'hello', anchors: [] }],
        },
      ],
    });
    expect(sections).toHaveLength(1);
    expect(sections[0].type).toBe('verse');
    expect(sections[0].chart).toContain('Am');
  });

  test('buildTuneSectionsFromPaste keeps intro/outro and marks chorus revisits', function() {
    const paste = listPasteChordSections({
      meter: '4/4',
      chordSheetAlignment: [
        {
          header: '[Intro]',
          type: 'intro',
          lines: [],
          linePairs: [{ chordLines: ['G D G D'], lyricLine: '', anchors: [] }],
        },
        {
          header: '[Chorus]',
          type: 'chorus',
          lines: ['words'],
          linePairs: [
            { chordLines: ['C G'], lyricLine: 'words', anchors: [] },
            { chordLines: ['C Em7 Am G'], lyricLine: '', anchors: [] },
          ],
        },
        {
          header: '[Chorus]',
          type: 'chorus',
          lines: ['words'],
          linePairs: [{ chordLines: ['C G'], lyricLine: 'words', anchors: [] }],
        },
        {
          header: '[Outro]',
          type: 'outro',
          lines: [],
          linePairs: [{ chordLines: ['C Em7 Am G'], lyricLine: '', anchors: [] }],
        },
      ],
    });
    expect(paste.map(function(s) { return s.title; })).toEqual([
      'Intro',
      'Chorus',
      'Chorus',
      'Outro',
    ]);
    expect(paste[1].chart).toContain('C Em7 Am G');
    const built = buildTuneSectionsFromPaste(paste, '4/4');
    expect(built).toHaveLength(4);
    expect(built[0].chart).toContain('G D G D');
    expect(built[1].chartRevisit).toBe(false);
    expect(built[2].chartRevisit).toBe(true);
    expect(built[2].chart).toBe(built[1].chart);
    expect(built[3].type).toBe('outro');
  });

  test('reconcileChordSectionsFromGrid inserts without lyric remap', function() {
    const sections = [
      { key: 'a-0', title: 'A', chart: 'C |', meter: '4/4', chartRevisit: false },
      { key: 'b-1', title: 'B', chart: 'G |', meter: '4/4', chartRevisit: false },
    ];
    const next = reconcileChordSectionsFromGrid(
      sections,
      'C |\n\nF |\n\nG |',
      '4/4'
    );
    expect(next).toHaveLength(3);
    expect(next[1].chart).toContain('F');
    expect(next[2].chart).toContain('G');
  });

  test('reconcileChordSectionsFromGrid preserves section marker header in chart', function() {
    const sections = [
      { key: 'verse-0', title: 'Verse', header: '[Verse]', chart: 'C . . . . . . . |', meter: '4/4', chartRevisit: false },
    ];
    const next = reconcileChordSectionsFromGrid(
      sections,
      '# Bridge\nD . . . . . . . |',
      '4/4'
    );
    expect(next[0].chart).toContain('# Bridge');
    expect(next[0].chart).toContain('D');
    expect(next[0].writeNotationMarker).toBe(true);
    expect(next[0].title).toBe('Bridge');
  });

  test('renameChordsEditorSection rewrites matching lyric header', function() {
    const sections = [
      {
        key: 'verse-0',
        title: 'Verse 1',
        header: '[Verse 1]',
        type: 'verse',
        chart: 'C | G |',
        meter: '4/4',
        abcKey: 'C',
        tempo: 120,
        chartRevisit: false,
      },
    ];
    const lyrics = ['[Verse 1]', 'line one', '', '[Chorus]', 'chorus'];
    const renamed = renameChordsEditorSection(sections, 'verse-0', 'Intro', lyrics);
    expect(renamed.ok).toBe(true);
    expect(renamed.updateLyrics).toBe(true);
    expect(renamed.lyricLines[0]).toBe('[Intro]');
  });

  test('lyricLinesAfterHeaderPatches rewrites lyrics when chart # header changes', function() {
    const sections = [
      {
        key: 'verse-0',
        title: 'Verse 1',
        header: '[Verse 1]',
        type: 'verse',
        chart: 'C |',
        meter: '4/4',
        chartRevisit: false,
      },
    ];
    const lyrics = ['[Verse 1]', 'line one'];
    const result = lyricLinesAfterHeaderPatches(
      sections,
      [{
        index: 0,
        patch: {
          header: '[Bridge]',
          title: 'Bridge',
          type: 'bridge',
          writeNotationMarker: true,
        },
      }],
      lyrics
    );
    expect(result.updated).toBe(true);
    expect(result.lines[0]).toBe('[Bridge]');
  });

  test('buildTuneSectionsFromPaste preserves inline meter in chart', function() {
    const built = buildTuneSectionsFromPaste([
      {
        type: 'verse',
        header: '[Verse]',
        chart: 'C | [M:3/4] Am . . |',
        meter: '4/4',
      },
    ], '4/4');
    expect(built[0].chart).toContain('[M:3/4]');
  });

  test('listChordsEditorSections preserves mid-chart inline tokens on load', function() {
    const sections = listChordsEditorSections({
      lyricLines: [],
      chordChart: 'C . . . . . . . | [M:3/4] G . . . . . . |',
      defaultMeter: '4/4',
      defaultNoteLength: '1/8',
    });
    expect(sections[0].chart).toContain('[M:3/4]');
    expect(sections[0].chart).toContain('G');
  });

  test('listPasteChordSections preserves mid-chart inline tokens', function() {
    const sections = listPasteChordSections({
      chordText: 'C . . . . . . . | [M:3/4] G . . . . . . |',
      meter: '4/4',
      key: 'C',
    });
    expect(sections[0].chart).toContain('[M:3/4]');
    expect(sections[0].chart).toContain('G');
  });

  test('insertChordsEditorSectionAfter and removeChordsEditorSection', function() {
    const sections = [
      { key: 'verse-0', title: 'Verse', type: 'verse', header: '[Verse]', sourceTypeKey: 'verse', chart: 'Am|', meter: '4/4', chartRevisit: false },
      { key: 'chorus-1', title: 'Chorus', type: 'chorus', header: '[Chorus]', sourceTypeKey: 'chorus', chart: 'C|', meter: '4/4', chartRevisit: false },
    ];
    const withBridge = insertChordsEditorSectionAfter(sections, 'verse-0', 'Bridge', '4/4');
    expect(withBridge).toHaveLength(3);
    expect(withBridge[1].title).toBe('Bridge');
    expect(withBridge[1].chart).toBe('');
    const removed = removeChordsEditorSection(withBridge, withBridge[1].key);
    expect(removed).toHaveLength(2);
    expect(removed[0].title).toBe('Verse');
    expect(removed[1].title).toBe('Chorus');
  });
});
