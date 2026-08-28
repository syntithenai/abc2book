import {
  classifyPdfPageKind,
  chooseRasterScale,
  collectEmbedsFromAnnotations,
  collectEmbedsFromAttachmentMap,
  collectEmbedsFromPdfBytes,
  detectScoreBytesKind,
  estimateStaffLikeInk,
  makeSyntheticStaffImageData,
  needsRasterizeForPageKind,
  pushScoreEmbed,
  scoreFilenameKind,
  splitTextLayerIntoSongs,
  PDF_PAGE_KINDS,
} from './pdfBookPageSniff';
import {
  abcLooksIncomplete,
  hasStrongTuneTitle,
  looksLikeContinuationTitle,
  markCrossPageContinuations,
} from './bookImportPipeline';
import { createBlankTuneRecord } from './bookImportReviewStore';

describe('pdfBookPageSniff', function() {
  test('classifyPdfPageKind detects chord text', function() {
    const kind = classifyPdfPageKind({
      textCharCount: 200,
      textScores: {
        chordLines: 3,
        lyricLines: 4,
        chordDensity: 0.25,
        chordProHints: 0,
        lineCount: 8,
      },
    });
    expect(kind).toBe(PDF_PAGE_KINDS.TEXT_CHORD);
    expect(needsRasterizeForPageKind(kind)).toBe(false);
  });

  test('classifyPdfPageKind detects lyrics', function() {
    const kind = classifyPdfPageKind({
      textCharCount: 300,
      textScores: {
        chordLines: 0,
        lyricLines: 6,
        chordDensity: 0.02,
        chordProHints: 0,
        lineCount: 8,
      },
    });
    expect(kind).toBe(PDF_PAGE_KINDS.TEXT_LYRICS);
    expect(needsRasterizeForPageKind(kind)).toBe(false);
  });

  test('lyrics with staff ink route to vector_notation', function() {
    const kind = classifyPdfPageKind({
      textCharCount: 300,
      textScores: {
        chordLines: 0,
        lyricLines: 6,
        chordDensity: 0.02,
        chordProHints: 0,
        lineCount: 8,
      },
      hasStaffLikeInk: true,
    });
    expect(kind).toBe(PDF_PAGE_KINDS.VECTOR_NOTATION);
    expect(needsRasterizeForPageKind(kind)).toBe(true);
  });

  test('classifyPdfPageKind scanned when little text', function() {
    expect(classifyPdfPageKind({
      textCharCount: 10,
      textScores: { chordLines: 0, lyricLines: 0, chordDensity: 0, chordProHints: 0, lineCount: 0 },
    })).toBe(PDF_PAGE_KINDS.SCANNED_IMAGE);
    expect(needsRasterizeForPageKind(PDF_PAGE_KINDS.SCANNED_IMAGE)).toBe(true);
  });

  test('vector_notation still needs rasterize for OMR', function() {
    const kind = classifyPdfPageKind({
      textCharCount: 120,
      textScores: {
        chordLines: 0,
        lyricLines: 2,
        chordDensity: 0.02,
        chordProHints: 0,
        lineCount: 4,
      },
    });
    expect(kind).toBe(PDF_PAGE_KINDS.VECTOR_NOTATION);
    expect(needsRasterizeForPageKind(kind)).toBe(true);
  });

  test('embedded_score only when embedOnlyPage', function() {
    expect(classifyPdfPageKind({
      textCharCount: 50,
      textScores: { chordLines: 0, lyricLines: 0, chordDensity: 0, chordProHints: 0, lineCount: 1 },
      hasEmbeddedScore: true,
    })).not.toBe(PDF_PAGE_KINDS.EMBEDDED_SCORE);
    expect(classifyPdfPageKind({
      textCharCount: 50,
      textScores: { chordLines: 0, lyricLines: 0, chordDensity: 0, chordProHints: 0, lineCount: 1 },
      hasEmbeddedScore: true,
      embedOnlyPage: true,
    })).toBe(PDF_PAGE_KINDS.EMBEDDED_SCORE);
  });

  test('chooseRasterScale bumps small pages', function() {
    expect(chooseRasterScale(900)).toBe(2.75);
    expect(chooseRasterScale(1600)).toBe(2);
  });

  test('splitTextLayerIntoSongs groups by blank lines', function() {
    const songs = splitTextLayerIntoSongs([
      'Song One',
      'C G',
      'Hello world',
      '',
      'Song Two',
      'Am F',
      'Another line',
    ], PDF_PAGE_KINDS.TEXT_CHORD);
    expect(songs.length).toBeGreaterThanOrEqual(2);
    expect(songs[0].title).toMatch(/Song One/i);
  });

  test('estimateStaffLikeInk finds synthetic staves', function() {
    const blank = makeSyntheticStaffImageData({ staves: [] });
    expect(estimateStaffLikeInk(blank).hasStaffLikeInk).toBe(false);
    const withStaff = makeSyntheticStaffImageData({
      staves: [{ top: 40, gap: 5 }, { top: 100, gap: 5 }],
    });
    const scored = estimateStaffLikeInk(withStaff);
    expect(scored.staffGroups).toBeGreaterThanOrEqual(1);
    expect(scored.hasStaffLikeInk).toBe(true);
  });

  test('collectEmbedsFromAnnotations reads FileAttachment payloads', function() {
    const encoder = new TextEncoder();
    const abc = encoder.encode('X:1\nT:Ann\nM:4/4\nK:C\nCDEF|]\n');
    const embeds = collectEmbedsFromAnnotations([
      {
        subtype: 'FileAttachment',
        file: { filename: 'ann.abc', content: abc },
      },
      { subtype: 'Link', url: 'http://example.com' },
    ]);
    expect(embeds.length).toBe(1);
    expect(embeds[0].kind).toBe('abc');
    expect(embeds[0].filename).toBe('ann.abc');
  });

  test('collectEmbedsFromAttachmentMap and dedupe', function() {
    const encoder = new TextEncoder();
    const bytes = encoder.encode('X:1\nT:A\nM:4/4\nK:C\nCDEF|]\n');
    const fromMap = collectEmbedsFromAttachmentMap({
      'tune.abc': { filename: 'tune.abc', content: bytes },
    });
    expect(fromMap.length).toBe(1);
    const embeds = [];
    const seen = new Set();
    pushScoreEmbed(embeds, seen, fromMap[0]);
    pushScoreEmbed(embeds, seen, { filename: 'tune-copy.abc', kind: 'abc', bytes: bytes });
    expect(embeds.length).toBe(1);
  });

  test('collectEmbedsFromPdfBytes finds uncompressed MusicXML stream', function() {
    const xml = '<?xml version="1.0"?><score-partwise version="3.1"><part-list>'
      + '<score-part id="P1"><part-name>M</part-name></score-part></part-list>'
      + '<part id="P1"><measure number="1"><note><pitch><step>C</step><octave>4</octave></pitch>'
      + '<duration>1</duration><type>quarter</type></note></measure></part></score-partwise>';
    const pdf = '%PDF-1.4\n'
      + '1 0 obj<< /Type /EmbeddedFile /Length ' + xml.length + ' >>stream\n'
      + xml
      + '\nendstream\nendobj\n'
      + '(sample.musicxml)\n%%EOF\n';
    const encoder = new TextEncoder();
    const embeds = collectEmbedsFromPdfBytes(encoder.encode(pdf));
    expect(embeds.length).toBeGreaterThanOrEqual(1);
    expect(embeds[0].kind).toBe('musicxml');
    expect(detectScoreBytesKind(embeds[0].bytes)).toBe('musicxml');
    expect(scoreFilenameKind('a.mxl')).toBe('mxl');
  });
});

describe('markCrossPageContinuations', function() {
  test('marks untitled end + untitled start across pages', function() {
    const tunes = markCrossPageContinuations([
      { id: 'a', title: 'untitled-p01-02', page: 1, tuneIndex: 2 },
      { id: 'b', title: 'untitled-p02-01', page: 2, tuneIndex: 1 },
    ]);
    expect(tunes[0].suggestedMergeWithNext).toBe(true);
  });

  test('does not mark titled new tunes', function() {
    const tunes = markCrossPageContinuations([
      { id: 'a', title: 'Reel One', page: 1, tuneIndex: 1 },
      { id: 'b', title: 'Reel Two', page: 2, tuneIndex: 1 },
    ]);
    expect(tunes[0].suggestedMergeWithNext).toBeFalsy();
  });

  test('marks cont. titles', function() {
    const tunes = markCrossPageContinuations([
      { id: 'a', title: 'cont.', page: 3, tuneIndex: 1 },
      { id: 'b', title: 'continued', page: 4, tuneIndex: 1 },
    ]);
    expect(tunes[0].suggestedMergeWithNext).toBe(true);
  });

  test('suggests merge when titled ABC ends mid-strain', function() {
    expect(abcLooksIncomplete('X:1\nT:Demo\nM:4/4\nK:G\nABCD|EFGA|Bc')).toBe(true);
    expect(abcLooksIncomplete('X:1\nT:Demo\nM:4/4\nK:G\nABCD|EFGA|]')).toBe(false);
    expect(hasStrongTuneTitle('Demo Reel')).toBe(true);
    expect(looksLikeContinuationTitle('more of the A part')).toBe(true);
    const tunes = markCrossPageContinuations([
      {
        id: 'a',
        title: 'Demo Reel',
        page: 1,
        tuneIndex: 1,
        abc: 'X:1\nT:Demo Reel\nM:4/4\nK:G\nABCD|EFGA|Bc',
      },
      { id: 'b', title: 'untitled-p02-01', page: 2, tuneIndex: 1 },
    ]);
    expect(tunes[0].suggestedMergeWithNext).toBe(true);
  });

  test('does not merge complete titled tune into titled next', function() {
    const tunes = markCrossPageContinuations([
      {
        id: 'a',
        title: 'Demo Reel',
        page: 1,
        tuneIndex: 1,
        abc: 'X:1\nT:Demo Reel\nM:4/4\nK:G\nABCD|EFGA|]',
      },
      { id: 'b', title: 'Other Reel', page: 2, tuneIndex: 1 },
    ]);
    expect(tunes[0].suggestedMergeWithNext).toBeFalsy();
  });
});

describe('createBlankTuneRecord pdf persistence fields', function() {
  test('stores source pdf keys and format fields', function() {
    const tune = createBlankTuneRecord({
      book: 'demo',
      title: 'Tune',
      page: 2,
      bbox: { x: 0, y: 10, width: 100, height: 50 },
      sourcePdfBlobKey: 'pdf-abc',
      sourcePdfPage: 2,
      rasterScale: 2.75,
      sheetFormat: 'chord_chart',
      chordSheetText: 'C G\nHi',
      suggestedMergeWithNext: true,
    });
    expect(tune.sourcePdfBlobKey).toBe('pdf-abc');
    expect(tune.sourcePdfPage).toBe(2);
    expect(tune.rasterScale).toBe(2.75);
    expect(tune.sheetFormat).toBe('chord_chart');
    expect(tune.chordSheetText).toBe('C G\nHi');
    expect(tune.suggestedMergeWithNext).toBe(true);
    expect(tune.bbox.height).toBe(50);
  });
});
