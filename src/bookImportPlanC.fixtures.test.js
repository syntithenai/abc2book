import {
  abcLooksIncomplete,
  convertEmbeddedScoreToAbc,
  markCrossPageContinuations,
} from './bookImportPipeline';
import {
  classifyPdfPageKind,
  collectEmbedsFromAnnotations,
  collectEmbedsFromPdfBytes,
  estimateStaffLikeInk,
  makeSyntheticStaffImageData,
  needsRasterizeForPageKind,
  splitTextLayerIntoSongs,
  PDF_PAGE_KINDS,
} from './pdfBookPageSniff';

const SAMPLE_MUSICXML = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE score-partwise PUBLIC "-//Recordare//DTD MusicXML 3.1 Partwise//EN" "http://www.musicxml.org/dtds/partwise.dtd">
<score-partwise version="3.1">
  <part-list><score-part id="P1"><part-name>Melody</part-name></score-part></part-list>
  <part id="P1">
    <measure number="1">
      <attributes>
        <divisions>1</divisions>
        <key><fifths>0</fifths></key>
        <time><beats>4</beats><beat-type>4</beat-type></time>
        <clef><sign>G</sign><line>2</line></clef>
      </attributes>
      <note><pitch><step>C</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>D</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>E</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
      <note><pitch><step>F</step><octave>4</octave></pitch><duration>1</duration><type>quarter</type></note>
    </measure>
  </part>
</score-partwise>`;

describe('Plan C PDF book import fixtures', function() {
  test('vector chord text route skips HOMR rasterize', function() {
    const kind = classifyPdfPageKind({
      textCharCount: 240,
      textScores: {
        chordLines: 4,
        lyricLines: 5,
        chordDensity: 0.3,
        chordProHints: 1,
        lineCount: 10,
      },
    });
    expect(kind).toBe(PDF_PAGE_KINDS.TEXT_CHORD);
    expect(needsRasterizeForPageKind(kind)).toBe(false);
    const songs = splitTextLayerIntoSongs([
      'Amazing Grace',
      '{title: Amazing Grace}',
      'G C',
      'Amazing grace how sweet the sound',
      '',
      'G D',
      'That saved a wretch like me',
    ], kind);
    expect(songs.length).toBeGreaterThanOrEqual(1);
    expect(songs[0].text).toMatch(/Amazing/i);
  });

  test('embedded MusicXML converts to ABC without OMR', async function() {
    const encoder = new TextEncoder();
    const abc = await convertEmbeddedScoreToAbc({
      kind: 'musicxml',
      filename: 'sample.musicxml',
      bytes: encoder.encode(SAMPLE_MUSICXML),
    });
    expect(abc).toBeTruthy();
    expect(abc).toMatch(/C/);
    expect(abc).toMatch(/K:/);
  });

  test('embedded ABC attachment passes through', async function() {
    const encoder = new TextEncoder();
    const abc = await convertEmbeddedScoreToAbc({
      kind: 'abc',
      filename: 'tune.abc',
      bytes: encoder.encode('X:1\nT:Demo\nM:4/4\nK:C\nCDEF|]\n'),
    });
    expect(abc).toContain('T:Demo');
    expect(abc).toContain('CDEF');
  });

  test('annotation FileAttachment embed extracts without OMR', async function() {
    const encoder = new TextEncoder();
    const embeds = collectEmbedsFromAnnotations([{
      subtype: 'FileAttachment',
      file: {
        filename: 'from-ann.musicxml',
        content: encoder.encode(SAMPLE_MUSICXML),
      },
    }]);
    expect(embeds.length).toBe(1);
    const abc = await convertEmbeddedScoreToAbc(embeds[0]);
    expect(abc).toMatch(/K:/);
  });

  test('raw PDF stream embed extracts MusicXML', function() {
    const encoder = new TextEncoder();
    const pdf = '%PDF-1.4\n1 0 obj<< /Type /EmbeddedFile /Length '
      + SAMPLE_MUSICXML.length + ' >>stream\n' + SAMPLE_MUSICXML + '\nendstream\nendobj\n%%EOF\n';
    const embeds = collectEmbedsFromPdfBytes(encoder.encode(pdf));
    expect(embeds.some(function(e) { return e.kind === 'musicxml'; })).toBe(true);
  });

  test('two-page continuation suggests merge', function() {
    const tunes = markCrossPageContinuations([
      { id: '1', title: 'untitled-p01-01', page: 1, tuneIndex: 1 },
      { id: '2', title: 'cont.', page: 2, tuneIndex: 1 },
    ]);
    expect(tunes[0].suggestedMergeWithNext).toBe(true);
  });

  test('mid-strain ABC + lowercase next suggests merge', function() {
    expect(abcLooksIncomplete('X:1\nT:A\nK:G\nABCD|EF')).toBe(true);
    const tunes = markCrossPageContinuations([
      {
        id: '1',
        title: 'March Of The Volunteers',
        page: 1,
        tuneIndex: 2,
        abc: 'X:1\nT:March\nM:4/4\nK:G\nABCD|EFGA|Bc',
      },
      { id: '2', title: 'and the second strain', page: 2, tuneIndex: 1 },
    ]);
    expect(tunes[0].suggestedMergeWithNext).toBe(true);
  });

  test('lyrics-only text route', function() {
    const kind = classifyPdfPageKind({
      textCharCount: 280,
      textScores: {
        chordLines: 0,
        lyricLines: 8,
        chordDensity: 0.01,
        chordProHints: 0,
        lineCount: 10,
      },
    });
    expect(kind).toBe(PDF_PAGE_KINDS.TEXT_LYRICS);
    expect(needsRasterizeForPageKind(kind)).toBe(false);
  });

  test('staff ink overrides lyrics-only toward OMR path', function() {
    const ink = estimateStaffLikeInk(makeSyntheticStaffImageData({
      staves: [{ top: 20, gap: 4 }, { top: 70, gap: 4 }],
    }));
    expect(ink.hasStaffLikeInk).toBe(true);
    const kind = classifyPdfPageKind({
      textCharCount: 280,
      textScores: {
        chordLines: 0,
        lyricLines: 8,
        chordDensity: 0.01,
        chordProHints: 0,
        lineCount: 10,
      },
      hasStaffLikeInk: ink.hasStaffLikeInk,
    });
    expect(kind).toBe(PDF_PAGE_KINDS.VECTOR_NOTATION);
  });

  test('synthetic multi-tune text page splits to >=2 titled songs', function() {
    const songs = splitTextLayerIntoSongs([
      'Ukrainian Dance Nign (Am)',
      'Am Dm',
      'First strain lyrics go here across the whole printed line of text',
      'Am E7 Am',
      'More of the first tune body continues with extra lyric words',
      '',
      'Freilach (Dm)',
      'Dm A7',
      'Second tune starts with these lyric words for the freilach strain',
      'Dm Gm Dm',
    ], PDF_PAGE_KINDS.TEXT_CHORD);
    expect(songs.length).toBeGreaterThanOrEqual(2);
    const titles = songs.map(function(s) { return s.title; }).join(' | ');
    expect(titles).toMatch(/Dance|Nign/i);
    expect(titles).toMatch(/Freilach/i);
  });
});
