import useAbcTools from './useAbcTools';
import { checkTuneAbcStructure } from './tuneAbcStructureCheck';
import {
  appendFinalBarlineInTune,
  collapseEmptyRepeatBarsInTune,
  fixSessionLineBreaksInTune,
  fixStanzaDoubleBarlinesInTune,
  normalizeMelodyRepeatMarks,
  previewStructureFix,
  removeEmptyBarsFromFlatMelody,
  removeEmptyBarsInTune,
} from './tuneAbcStructureFix';
import { buildTuneCheckReport } from './tuneBulkCheckReport';

function tuneFromAbc(abcTools, abc, extras) {
  const json = abcTools.abc2json(abc);
  return Object.assign({
    id: 'test-tune',
    name: 'Test Tune',
    composer: 'Tester',
    meter: '4/4',
    key: 'C',
    noteLength: '1/4',
  }, json, extras || {});
}

describe('tuneAbcStructureCheck', function() {
  const abcTools = useAbcTools();

  test('detects empty bar in melody', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Empty Bar') + 'C D E F | | G A B c |');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'empty_bar'; })).toBe(true);
  });

  test('does not treat double barlines as empty bars', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Strain') + 'C D E F | G A B c || D E F G | A B c d |');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'empty_bar'; })).toBe(false);
  });

  test('detects underfull bar', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Underfull') + 'C D E | G A B c |');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'underfull_bar'; })).toBe(true);
  });

  test('detects unmatched repeat end', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Repeat') + 'C D E F :|');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'unmatched_repeat_end'; })).toBe(true);
  });

  test('detects ending without repeat', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Volta') + '[1 C D E F | [2 G A B c |');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'ending_without_repeat'; })).toBe(true);
  });

  test('detects pickup/anacrusis tune', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Pickup') + 'C | D E F G | A B c d |');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) {
      return i.code === 'underfull_bar' || i.code === 'anacrusis_inconsistent';
    })).toBe(true);
  });

  test('detects voice bar count mismatch', function() {
    const abc = [
      abcTools.emptyABC('Voices'),
      'V:1',
      'C D E F | G A B c |',
      'V:2',
      'C2 E2 |',
    ].join('\n');
    const tune = tuneFromAbc(abcTools, abc);
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'voice_bar_count_mismatch'; })).toBe(true);
  });

  test('detects missing final barline', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Finish') + 'C D E F | G A B c');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'missing_final_barline'; })).toBe(true);
  });

  test('detects spaced repeat marks', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Spacing') + '| : C D E F : | G A B c |');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'repeat_style_mixed'; })).toBe(true);
  });

  test('returns null for clean tune', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Clean') + 'C2 D2 E2 F2 | G2 A2 B2 c2 |]');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).toBeNull();
  });
});

describe('tuneAbcStructureFix', function() {
  const abcTools = useAbcTools();

  test('normalizeMelodyRepeatMarks collapses spaced repeat tokens', function() {
    const out = normalizeMelodyRepeatMarks(['| : C D E F : |']);
    expect(out[0]).toBe('|: C D E F :|');
  });

  test('collapseEmptyRepeatBarsInTune merges empty bar between repeat marks', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Repeat Gap'), {
      voices: { '1': { notes: ['A2 B2 c2 d2 | e2 f2 g2 a2 :| | |: b2 c\'2 d\'2 e\'2 |]'] } },
    });
    const before = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(before.issues.some(function(i) { return i.code === 'empty_bar'; })).toBe(true);

    const fixed = collapseEmptyRepeatBarsInTune(tune);
    expect(fixed).not.toBeNull();
    const after = checkTuneAbcStructure(fixed, { abcTools: abcTools });
    const codes = after && after.issues ? after.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('empty_bar');
    expect(codes).not.toContain('repeat_style_mixed');
  });

  test('fixSessionLineBreaksInTune converts Session markers', function() {
    const body = '|:"Am"E2A2 ABcd|e2d2 c2A2|! "Am"E2A2|';
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Session') + body, { key: 'Am', meter: '4/4' });
    const fixed = fixSessionLineBreaksInTune(tune, abcTools);
    expect(fixed).not.toBeNull();
    const notes = fixed.voices[Object.keys(fixed.voices)[0]].notes.join('\n');
    expect(notes).toContain('|\n');
    const result = checkTuneAbcStructure(fixed, { abcTools: abcTools });
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('session_linebreak_markers');
  });

  test('fixStanzaDoubleBarlinesInTune inserts || between equal stanzas', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Stanzas') + 'C D E F | G A B c | D E F G | A B c d |', {
      words: ['Verse one line', '', 'Verse two line'],
    });
    const fixed = fixStanzaDoubleBarlinesInTune(tune, abcTools);
    expect(fixed).not.toBeNull();
    const flat = fixed.voices[Object.keys(fixed.voices)[0]].notes.join(' ');
    expect(flat).toContain('||');
  });

  test('appendFinalBarlineInTune adds |]', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Finish') + 'C D E F | G A B c |');
    const fixed = appendFinalBarlineInTune(tune, abcTools);
    expect(fixed).not.toBeNull();
    const flat = fixed.voices[Object.keys(fixed.voices)[0]].notes.join(' ');
    expect(flat).toMatch(/\|\]\s*$/);
  });

  test('previewStructureFix returns before and after ABC', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Finish') + 'C D E F | G A B c |');
    const preview = previewStructureFix('appendFinalBarline', tune, abcTools);
    expect(preview).not.toBeNull();
    expect(preview.before).toContain('G A B c');
    expect(preview.after).toContain('|]');
  });

  test('removeEmptyBarsFromFlatMelody removes spaced empty bars but keeps double barlines', function() {
    expect(removeEmptyBarsFromFlatMelody('C D E F | | G A B c |')).toBe('C D E F | G A B c |');
    expect(removeEmptyBarsFromFlatMelody('C D E F | G A B c || D E F G |')).toBe('C D E F | G A B c || D E F G |');
    expect(removeEmptyBarsFromFlatMelody('A2 B2 :| | |: c2 d2 |')).toBe('A2 B2 :: c2 d2 |');
    expect(removeEmptyBarsFromFlatMelody('CDEF GABc |\n| DEFG |')).toBe('CDEF GABc | DEFG |');
    expect(removeEmptyBarsFromFlatMelody('CDEF | DEFG |\nABCD |')).toBe('CDEF | DEFG |\nABCD |');
  });

  test('removeEmptyBarsInTune preserves melody content', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Empty Bar') + 'C D E F | | G A B c |');
    const fixed = removeEmptyBarsInTune(tune);
    expect(fixed).not.toBeNull();
    const flat = fixed.voices[Object.keys(fixed.voices)[0]].notes.join(' ');
    expect(flat).toContain('C D E F');
    expect(flat).toContain('G A B c');
    expect(flat).not.toMatch(/\|\s+\|/);
    const after = checkTuneAbcStructure(fixed, { abcTools: abcTools });
    const codes = after && after.issues ? after.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('empty_bar');
  });

  test('removeEmptyBarsInTune preserves note line breaks', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Lines'), {
      voices: { '1': { notes: ['CDEF GABc | DEFG |', 'ABCD EFGH |'] } },
    });
    const fixed = removeEmptyBarsInTune(tune);
    expect(fixed).toBeNull();

    const tuneWithEmptyLine = tuneFromAbc(abcTools, abcTools.emptyABC('Empty line'), {
      voices: { '1': { notes: ['CDEF GABc |', '|', 'DEFG ABcd |'] } },
    });
    const fixedLines = removeEmptyBarsInTune(tuneWithEmptyLine);
    expect(fixedLines).not.toBeNull();
    const notes = fixedLines.voices['1'].notes;
    expect(notes.join('\n')).toBe('CDEF GABc |\nDEFG ABcd |');
    const after = checkTuneAbcStructure(fixedLines, { abcTools: abcTools });
    const codes = after && after.issues ? after.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('empty_bar');
  });

  test('removeEmptyBarsInTune does not strip double barlines', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Strain') + 'C D E F | G A B c || D E F G | A B c d |');
    const fixed = removeEmptyBarsInTune(tune);
    expect(fixed).toBeNull();
    const flat = tune.voices[Object.keys(tune.voices)[0]].notes.join(' ');
    expect(flat).toContain('||');
  });
});

describe('tuneBulkCheckReport structure integration', function() {
  const abcTools = useAbcTools();

  test('includes structure issues in report', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Broken') + 'C D E F :|');
    const report = buildTuneCheckReport(tune, { abcTools: abcTools });
    expect(report.structureResult).not.toBeNull();
    expect(report.issues.some(function(i) { return i.code === 'unmatched_repeat_end'; })).toBe(true);
  });
});
