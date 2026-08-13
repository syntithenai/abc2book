/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcjsParser from './useAbcjsParser';
import useAbcTools from './useAbcTools';
import { splitChordChartIntoBlocks } from './chordSheetUtils';

const REPEAT_STRAIN_LINE_A = '|:"Am"E2A2 ABcd|e2d2 c2A2|"G"B2G2 GFGA|"Em"B2AG E2D2|! "Am"E2A2 ABcd|e2d2 e2ag|"Em"e2d2 "G"BedB|"Am"A4 A4:|';
const REPEAT_STRAIN_LINE_B = ' |:"Am"a2e2 e2fg|abag e2fg|abaf "Em"g3e|"G"dedB G4|! "Am"a2e2 e2fg|abag e2d2|"Em"B2e2 "G"d2B2|"Am"A4 A4:|';

function repeatStrainAbc(abcTools) {
  return [
    'X:1',
    'T:RepeatStrain',
    'M:4/4',
    'L:1/4',
    'K:Am',
    REPEAT_STRAIN_LINE_A,
    REPEAT_STRAIN_LINE_B,
  ].join('\n');
}

function roundtripNotes(tune) {
  const abcjsParser = useAbcjsParser();
  const abcTools = useAbcTools();
  const abc = abcTools.json2abc(tune);
  const chords = abcjsParser.renderChords(abc, true);
  const merged = abcjsParser.mergeChords(chords, abc);
  return abcTools.justNotes(merged);
}

describe('mergeChords note length roundtrip', function() {
  test('preserves note lengths with explicit L:1/8', function() {
    const notes = roundtripNotes({
      id: 't1', name: 'RoundTrip', meter: '4/4', noteLength: '1/8', key: 'C',
      voices: { 1: { meta: '', notes: ['CDEF GABc | cBAG FEDC |'] } },
    });
    expect(notes).not.toMatch(/C\/2/);
    expect(notes).toMatch(/CDEF/);
  });

  test('preserves note lengths when no L: field present (4/4)', function() {
    const notes = roundtripNotes({
      id: 't2', name: 'NoUnitLength', meter: '4/4', noteLength: null, key: 'C',
      voices: { 1: { meta: '', notes: ['CDEF GABc | cBAG FEDC |'] } },
    });
    expect(notes).not.toMatch(/C\/2/);
    expect(notes).toMatch(/CDEF/);
  });

  // Regression: abcjs defaults the unit note length to 1/16 (not 1/8) for
  // meters below 3/4 when no explicit L: field is present. render() must use
  // the same default or every note length is halved on merge.
  test('preserves note lengths in 2/4 with no L: field', function() {
    const notes = roundtripNotes({
      id: 't3', name: 'TwoFourNoUnit', meter: '2/4', noteLength: null, key: 'C',
      voices: { 1: { meta: '', notes: ['CDEF | GABc |'] } },
    });
    expect(notes).not.toMatch(/C\/2/);
    expect(notes).toMatch(/CDEF/);
  });

  test('preserves explicit longer note lengths', function() {
    const notes = roundtripNotes({
      id: 't4', name: 'ExplicitLengths', meter: '4/4', noteLength: '1/8', key: 'C',
      voices: { 1: { meta: '', notes: ['C2 D2 E2 F2 | G4 c4 |'] } },
    });
    expect(notes).toMatch(/C2/);
    expect(notes).toMatch(/G4/);
  });

  test('mergeChords uses double barlines only at section ends', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const tune = {
      id: 'concrete', name: 'Concrete', meter: '4/4', noteLength: '1/8', key: 'D',
      voices: { 1: { meta: '', notes: [
        'zzzzzzzz | zzzzzzzz | zzzzzzzz | zzzzzzzz |',
        'zzzzzzzz | zzzzzzzz | zzzzzzzz | zzzzzzzz |',
      ] } },
    };
    const abc = abcTools.json2abc(tune);
    const chordGrid = 'D . . . | F . . . | C . . . | G . . . |\n\nEm . . . | G . . . | Am . . . | Em . . . |';
    const merged = abcjsParser.mergeChords(chordGrid, abc);
    const notes = abcTools.justNotes(merged);
    expect(notes.match(/\|\|/g)).toHaveLength(1);
    expect(notes).not.toMatch(/zzzzzzzz\|\|"[A-G#b]/);
    expect(notes).toContain('"D"zzzzzzzz');
    expect(notes).toContain('"G"zzzzzzzz||');
    expect(notes).toContain('"Em"zzzzzzzz');
  });

  test('buildAppendChordGrid places new chords after existing bars', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const tune = {
      id: 'append', name: 'Append', meter: '4/4', noteLength: '1/8', key: 'D',
      voices: { 1: { meta: '', notes: ['"D"zzzzzzzz | "G"zzzzzzzz |'] } },
    };
    const abc = abcTools.json2abc(tune);
    const combined = abcjsParser.buildAppendChordGrid(abc, 'Am . . . | F . . . |');
    const merged = abcjsParser.mergeChords(combined, abc);
    const notes = abcTools.justNotes(merged);
    expect(notes).toContain('"D"zzzzzzzz');
    expect(notes).toContain('"G"zzzzzzzz');
    expect(notes).toContain('"Am"zzzzzzzz');
    expect(notes).toContain('"F"zzzzzzzz');
    expect(notes.indexOf('"Am"')).toBeGreaterThan(notes.indexOf('"G"'));
  });

  // Regression: abcjs parses a rest filling an entire bar (e.g. z8 in 4/4)
  // as rest.type 'whole', which render() used to drop entirely. Merging
  // chords into such a tune produced bars containing only chord text and
  // barlines, so the chords never attached to anything in the notation.
  test('mergeChords places chords onto whole-bar rests', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const tune = {
      id: 'whole-rests', name: 'Whole Rests', meter: '4/4', noteLength: '1/8', key: 'C',
      voices: { 1: { meta: '', notes: ['z8 | z8 |'] } },
    };
    const abc = abcTools.json2abc(tune);
    const merged = abcjsParser.mergeChords('C . . . | G . D . |', abc);
    const notes = abcTools.justNotes(merged);
    expect(notes).toContain('"C"z');
    expect(notes).toContain('"G"z');
    expect(notes).toContain('"D"z');
    // mid-bar chord lands mid-bar, not stacked on beat one
    expect(notes).toMatch(/"G"z+"D"z+/);
  });

  test('render round-trips whole-bar rests as z', function() {
    const abcjsParser = useAbcjsParser();
    const abc = 'X:1\nM:4/4\nL:1/8\nK:C\nz8 | CDEF GABc |\n';
    const rendered = abcjsParser.render(abcjsParser.parse(abc), abc);
    expect(rendered).toContain('z8');
  });

  test('mergeChords does not double-bar every bar when extra bars are added', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const tune = {
      id: 'one-bar', name: 'One Bar', meter: '4/4', noteLength: '1/8', key: 'D',
      voices: { 1: { meta: '', notes: ['zzzzzzzz |'] } },
    };
    const abc = abcTools.json2abc(tune);
    const chordGrid = 'D . . . | F . . . | C . . . | G . . . |';
    const merged = abcjsParser.mergeChords(chordGrid, abc);
    const notes = abcTools.justNotes(merged);
    expect(notes.match(/\|\|/g) || []).toHaveLength(0);
    expect(notes).not.toMatch(/zzzzzzzz\|\|"[A-G#b]/);
    expect(notes).toMatch(/"D"zzzzzzzz\|"F"zzzzzzzz\|"C"zzzzzzzz\|"G"zzzzzzzz\|/);
  });

  test('renderChords emits [M:] for inline meter changes', function() {
    const abcjsParser = useAbcjsParser();
    const abc = 'X:1\nT:MeterChange\nM:4/4\nL:1/8\nK:C\n"C"z2"G"z2"C"z2"G"z2 | [M:3/4] "Am"z2"G"z2"F"z2 |\n';
    const chart = abcjsParser.renderChords(abc, true);
    expect(chart).toContain('[M:3/4]');
    // Meter marker is attached to the following bar, not an orphan empty bar.
    expect(chart).toMatch(/\[M:3\/4\]\s+Am/);
    expect(chart).not.toMatch(/\[M:3\/4\]\s+(\.(\s+\.)*\s+\|)/);
  });

  test('mergeChords writes inline [M:] from chord grid meter tokens', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const tune = {
      id: 'meter-change', name: 'Meter Change', meter: '4/4', noteLength: '1/8', key: 'C',
      voices: { 1: { meta: '', notes: ['zzzzzzzz | zzzzzz |'] } },
    };
    const abc = abcTools.json2abc(tune);
    const merged = abcjsParser.mergeChords('C . . . |\n[M:3/4] Am . . |', abc);
    const notes = abcTools.justNotes(merged);
    expect(notes).toContain('[M:3/4]');
    expect(notes).toContain('"C"');
    expect(notes).toContain('"Am"');
  });

  test('pulse slot round-trip places G on pulse 2', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const tune = {
      id: 'pulse', name: 'Pulse', meter: '4/4', noteLength: '1/8', key: 'C',
      voices: { 1: { meta: '', notes: ['z8 |'] } },
    };
    const abc = abcTools.json2abc(tune);
    const merged = abcjsParser.mergeChords('C . G . . . . . |', abc);
    const notes = abcTools.justNotes(merged);
    expect(notes).toContain('"C"');
    expect(notes).toContain('"G"');
    expect(notes.indexOf('"G"')).toBeGreaterThan(notes.indexOf('"C"'));
  });

  test('renderChords showDots uses pulse slots after inline meter change', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:MeterChange',
      'M:4/4',
      'L:1/8',
      'K:C',
      '"C" z z z z z z z | [M:3/4] "G" z z z z z |',
    ].join('\n');
    const chart = abcjsParser.renderChords(abc, true);
    expect(chart).toContain('[M:3/4]');
    const afterMeter = chart.split('[M:3/4]')[1] || '';
    const dots = (afterMeter.match(/\./g) || []).length;
    expect(dots).toBeGreaterThanOrEqual(5);
    expect(dots).toBeLessThanOrEqual(6);
    expect(afterMeter).toContain('G');
  });

  test('renderChords showDots emits separate blocks at repeat strain boundaries', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const abc = repeatStrainAbc(abcTools);
    const chart = abcjsParser.renderChords(abc, true);
    const blocks = splitChordChartIntoBlocks(chart);
    expect(blocks.length).toBe(2);
    expect(blocks[0]).toMatch(/Am/);
    expect(blocks[1]).toMatch(/Am/);
  });

  test('renderChords showDots false splits repeat strains like showDots true', function() {
    const abcjsParser = useAbcjsParser();
    const abcTools = useAbcTools();
    const abc = repeatStrainAbc(abcTools);
    const withDots = splitChordChartIntoBlocks(abcjsParser.renderChords(abc, true));
    const withoutDots = splitChordChartIntoBlocks(abcjsParser.renderChords(abc, false));
    expect(withoutDots.length).toBe(withDots.length);
    expect(withoutDots.length).toBe(2);
  });

  test('renderChords excludes section marker chords from display chart', function() {
    const abcjsParser = useAbcjsParser();
    const { extractChordSequence } = require('./chordSheetUtils');
    const abc = [
      'X:1',
      'T:Markers',
      'M:4/4',
      'L:1/8',
      'K:C',
      '"[Verse 1]" z8 | "C" z8 | "G" z8 |',
    ].join('\n');
    const editorChart = abcjsParser.renderChords(abc, true);
    const displayChart = abcjsParser.renderChords(abc, false);
    expect(editorChart).toContain('# Verse');
    expect(extractChordSequence(displayChart)).toEqual(['C', 'G']);
    expect(extractChordSequence(editorChart)).toEqual(['C', 'G']);
  });
});
