import useAbcTools from './useAbcTools';
import { checkTuneAbcStructure } from './tuneAbcStructureCheck';
import {
  appendFinalBarlineInTune,
  collapseAnacrusisDoubleBarlinesInTune,
  collapseEmptyRepeatBarsInTune,
  convertScaffoldToRestsInTune,
  fillSparseBarsInTune,
  balanceEndingsInTune,
  fixSessionLineBreaksInTune,
  fixStanzaDoubleBarlinesInTune,
  normalizeMelodyRepeatMarks,
  previewStructureFix,
  removeEmptyBarsFromFlatMelody,
  removeEmptyBarsInTune,
  removeEmptyVoiceInTune,
  removeOrphanRepeatEndInTune,
  resolveHeaderConflictFromAbc,
  fixStrainRepeatEndsInTune,
  standardizeBarsAndRepeatsInTune,
  wrapEndingInRepeatInTune,
  convertSectionPickupsToVoltasInTune,
  structureFixAvailable,
} from './tuneAbcStructureFix';
import { buildTuneCheckReport } from './tuneBulkCheckReport';
import {
  ANACRUSIS_THREE_STRAINS,
  ANACRUSIS_TWO_STRAINS,
} from './testFixtures/anacrusisDoubleBarlineFixtures';

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

  test('pickup || after |: does not create empty_bar or stanza_strain_mismatch', function() {
    const tune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Pickup Strains') + 'C |'), {
      voices: { '1': { notes: ANACRUSIS_THREE_STRAINS.split('\n') } },
    });
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('empty_bar');
    expect(codes).not.toContain('stanza_strain_mismatch');
  });

  test('detects section_pickup_should_be_ending for two-strain pickup sections', function() {
    const tune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Volta Pickup') + 'C |', {
      meter: '4/4',
      key: 'D',
      noteLength: '1/8',
    }), {
      voices: { '1': { notes: ANACRUSIS_TWO_STRAINS.split('\n') } },
    });
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    const issues = result.issues.filter(function(i) { return i.code === 'section_pickup_should_be_ending'; });
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('de');
    expect(issues[0].message).toContain('second ending');
  });

  test('detects section_pickup_should_be_ending at A-B boundary in three-strain tune', function() {
    const tune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Volta Pickup 3') + 'C |', {
      meter: '4/4',
      key: 'D',
      noteLength: '1/8',
    }), {
      voices: { '1': { notes: ANACRUSIS_THREE_STRAINS.split('\n') } },
    });
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    const issues = result && result.issues
      ? result.issues.filter(function(i) { return i.code === 'section_pickup_should_be_ending'; })
      : [];
    expect(issues.length).toBe(1);
    expect(issues[0].message).toContain('de');
  });

  test('does not flag section pickup when voltas already present', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Has Volta') + '|: FG C D E F | [1 FG :| [2 de :|');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('section_pickup_should_be_ending');
  });

  test('does not flag single repeat section with pickup', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Single') + '|: FG C D E F | G A B c :|');
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('section_pickup_should_be_ending');
  });

  test('detects anacrusis_double_barline and fix rewrites stored notes', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Pickup Fix') + '|:FG||"D"AFDF AFDF|');
    const before = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(before.issues.some(function(i) { return i.code === 'anacrusis_double_barline'; })).toBe(true);

    const fixed = collapseAnacrusisDoubleBarlinesInTune(tune);
    expect(fixed).not.toBeNull();
    expect(fixed.voices[Object.keys(fixed.voices)[0]].notes.join(' ')).toContain('|:FG|"D"AFDF');
    const after = checkTuneAbcStructure(fixed, { abcTools: abcTools });
    const codes = after && after.issues ? after.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('anacrusis_double_barline');
  });

  test('detects mid_block_double_barline on every-bar || scaffolds', function() {
    const tune = tuneFromAbc(
      abcTools,
      abcTools.emptyABC('Concrete') + '"D"zzzzzzzz||"F"zzzzzzzz||"C"zzzzzzzz||"G"zzzzzzzz||'
    );
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(result).not.toBeNull();
    expect(result.issues.some(function(i) { return i.code === 'mid_block_double_barline'; })).toBe(true);
  });

  test('does not flag section-ending || as mid_block_double_barline', function() {
    const tune = tuneFromAbc(
      abcTools,
      abcTools.emptyABC('Sections')
        + '"Am"zzzz|"E7"zzzz|"C"zzzz|"D"zzzz||\n'
        + '"Fmaj7"zzzz|"C"zzzz|"E"zzzz|"E7"zzzz||'
    );
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('mid_block_double_barline');
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

  test('session double-strain repeats flag missing repeat end before double bar', function() {
    const body = [
      '|: "Am"E2A2 ABcd | e2d2 c2A2 | "G"B2G2 GFGA | "Em"B2AG E2D2 |',
      '"Am"E2A2 ABcd | e2d2 e2ag | "Em"e2d2 "G"BedB | "Am"A4 A4 ||',
      '|: "Am"a2e2 e2fg | abag e2fg | abaf "Em"g3e | "G"dedB G4 |',
      '"Am"a2e2 e2fg | abag e2d2 | "Em"B2e2 "G"d2B2 | "Am"A4 A4 ||',
    ].join('\n');
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Session Repeat') + body, { key: 'Am', meter: '4/4' });
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).toContain('strain_missing_repeat_end');
    expect(codes).not.toContain('unmatched_repeat_start');
  });

  test('adjacent repeat sections with :| then |: are valid (Aughrim pattern)', function() {
    const body = [
      '|: "Am"E2A2ABcd | e2d2c2A2 | "G"B2G2GFGA | "Em"B2AGE2D2 |',
      '"Am"E2A2ABcd | e2d2e2ag | "Em"e2d2"G"BedB | "Am"A4A4 :|',
      '|: "Am"a2e2e2fg | abage2fg | abaf"Em"g3e | "G"dedBG4 |',
      '"Am"a2e2e2fg | abage2d2 | "Em"B2e2"G"d2B2 | "Am"A4A4 :|',
    ].join('\n');
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('After The Battle Of Aughrim') + body, {
      key: 'Adorian',
      meter: '4/4',
      noteLength: '1/8',
    });
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('unmatched_repeat_end');
    expect(codes).not.toContain('unmatched_repeat_start');
    expect(codes).not.toContain('section_pickup_should_be_ending');
  });

  test('Amazing Grace: triplet bar and anacrusis+final are complete', function() {
    const body = [
      'D | "G"G2A/2G/2 | B2"D7"A | "Em"G2"C"E | "G"D2D |',
      'G2B/2G/2 | B2"D7"A/2B/2 | "D"(d3 | d)zB |',
      '"G"d2B/2G/2 | B2A | "C"G2E | "G"D2D |',
      '"Em"G2(3B/2A/2G/2 | "D"B2A | "G"(G3 | G2) ||',
    ].join('\n');
    const abc = [
      'X:1',
      'T:Amazing Grace',
      'M:3/4',
      'L:1/4',
      'K:G',
      body,
      'W: Amazing grace! how sweet the sound,',
      'W: That saved a wretch like me!',
    ].join('\n');
    const tune = tuneFromAbc(abcTools, abc, {
      meter: '3/4',
      key: 'G',
      noteLength: '1/4',
    });
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools, abcText: abc });
    const codes = result && result.issues ? result.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('overfull_bar');
    expect(codes).not.toContain('underfull_bar');
    expect(codes).not.toContain('session_linebreak_markers');
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

  test('collapseEmptyRepeatBarsInTune removes empty bar between || and |:', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Strain Gap'), {
      voices: { '1': { notes: ['"Am"A4 A4 || | |: "G"G4 G4 |]'] } },
    });
    const fixed = collapseEmptyRepeatBarsInTune(tune);
    expect(fixed).not.toBeNull();
    const notes = fixed.voices[Object.keys(fixed.voices)[0]].notes.join('\n');
    expect(notes).toMatch(/\|\|\s*\|:/);
    expect(notes).not.toMatch(/\|\|\s*\|\s*\|:/);
  });

  test('fixStrainRepeatEndsInTune inserts repeat end before strain double bar', function() {
    const body = [
      '|: "Am"E2A2 ABcd | e2d2 c2A2 | "G"B2G2 GFGA | "Em"B2AG E2D2 |',
      '"Am"E2A2 ABcd | e2d2 e2ag | "Em"e2d2 "G"BedB | "Am"A4 A4 ||',
      '|: "Am"a2e2 e2fg | abag e2fg | abaf "Em"g3e | "G"dedB G4 |',
      '"Am"a2e2 e2fg | abag e2d2 | "Em"B2e2 "G"d2B2 | "Am"A4 A4 ||',
    ].join('\n');
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Session Repeat') + body, { key: 'Am', meter: '4/4' });
    const before = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(before.issues.some(function(i) { return i.code === 'strain_missing_repeat_end'; })).toBe(true);

    const fixed = fixStrainRepeatEndsInTune(tune);
    expect(fixed).not.toBeNull();
    const notes = fixed.voices[Object.keys(fixed.voices)[0]].notes;
    expect(notes.length).toBe(4);
    expect(notes.join(' ')).toMatch(/:\|\|/);
    const after = checkTuneAbcStructure(fixed, { abcTools: abcTools });
    const codes = after && after.issues ? after.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('strain_missing_repeat_end');
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

  test('flattening structure fixes keep notation line breaks', function() {
    function noteLines(tune) {
      return tune.voices[Object.keys(tune.voices)[0]].notes.filter(function(line) {
        return String(line || '').trim();
      });
    }

    const stanzaTune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Stanza Lines') + 'C |', {
      words: ['Verse one line', '', 'Verse two line'],
    }), {
      voices: { '1': { notes: ['C D E F | G A B c |', 'D E F G | A B c d |'] } },
    });
    const stanzaFixed = fixStanzaDoubleBarlinesInTune(stanzaTune, abcTools);
    expect(stanzaFixed).not.toBeNull();
    expect(noteLines(stanzaFixed).length).toBe(2);
    expect(noteLines(stanzaFixed).join('\n')).toContain('||');

    const wrapTune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Wrap Lines') + 'C |'), {
      voices: { '1': { notes: ['C D E F | G A B c |', '[1 C D E F |]'] } },
    });
    const wrapFixed = wrapEndingInRepeatInTune(wrapTune);
    expect(wrapFixed).not.toBeNull();
    expect(noteLines(wrapFixed).length).toBe(2);
    expect(noteLines(wrapFixed).join('\n')).toContain('|:');
    expect(noteLines(wrapFixed).join('\n')).toContain('[1');

    const scaffoldTune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Scaffold Lines') + 'C |', {
      meter: '4/4',
      noteLength: '1/8',
    }), {
      voices: { '1': { notes: ['"C"zzzz | "G"zzzz |', '"Am"zzzz | "F"zzzz |'] } },
    });
    const scaffoldFixed = convertScaffoldToRestsInTune(scaffoldTune);
    expect(scaffoldFixed).not.toBeNull();
    expect(noteLines(scaffoldFixed).length).toBe(2);

    const orphanTune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Orphan Lines') + 'C |'), {
      voices: { '1': { notes: [':| C D E F |', 'G A B c |'] } },
    });
    const orphanFixed = removeOrphanRepeatEndInTune(orphanTune);
    expect(orphanFixed).not.toBeNull();
    expect(noteLines(orphanFixed).length).toBe(2);
    expect(noteLines(orphanFixed)[0].trim().startsWith(':|')).toBe(false);

    const balanceTune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Balance Lines') + 'C |'), {
      voices: { '1': { notes: ['C D E F | [1] G A B c |', '[2] D E F G | A B c d |'] } },
    });
    const balanceFixed = balanceEndingsInTune(balanceTune);
    expect(balanceFixed).not.toBeNull();
    expect(noteLines(balanceFixed).length).toBe(2);

    const sparseTune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Sparse Lines') + 'C |'), {
      voices: { '1': { notes: ['C D E F | |', 'G A B c | D E F G |'] } },
    });
    const sparseFixed = fillSparseBarsInTune(sparseTune);
    expect(sparseFixed).not.toBeNull();
    expect(noteLines(sparseFixed).length).toBe(2);
    expect(noteLines(sparseFixed).join('\n')).toMatch(/z/i);
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

  test('wrapEndingInRepeat wraps first ending in repeat marks', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Ending') + 'C D E F | [1 C D E F |]');
    const fixed = wrapEndingInRepeatInTune(tune);
    expect(fixed).not.toBeNull();
    const flat = fixed.voices[Object.keys(fixed.voices)[0]].notes.join(' ');
    expect(flat).toContain('|:');
    expect(flat).toContain('[1');
  });

  test('removeEmptyVoiceInTune removes empty secondary voice', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Voices') + 'C D E F |');
    tune.voices['2'] = { notes: [''] };
    const fixed = removeEmptyVoiceInTune(tune);
    expect(fixed).not.toBeNull();
    expect(fixed.voices['2']).toBeUndefined();
  });

  test('removeOrphanRepeatEndInTune removes leading orphan repeat end', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Orphan') + ':| C D E F |');
    const fixed = removeOrphanRepeatEndInTune(tune);
    expect(fixed).not.toBeNull();
    const flat = fixed.voices[Object.keys(fixed.voices)[0]].notes.join(' ');
    expect(flat.startsWith(':|')).toBe(false);
  });

  test('resolveHeaderConflictFromAbc prefers inline ABC meter marker', function() {
    const tune = tuneFromAbc(abcTools, abcTools.emptyABC('Meter') + '[M:3/4] C D E F |');
    tune.meter = '4/4';
    const abcText = abcTools.json2abc(tune);
    const fixed = resolveHeaderConflictFromAbc(tune, abcTools);
    expect(fixed).not.toBeNull();
    expect(fixed.meter).toBe(String(abcTools.getMetaValueFromAbc('M', abcText) || fixed.meter).trim());
  });

  test('convertSectionPickupsToVoltasInTune rewrites two-strain pickup sections', function() {
    const tune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Volta Fix') + 'C |', {
      meter: '4/4',
      key: 'D',
      noteLength: '1/8',
    }), {
      voices: { '1': { notes: ANACRUSIS_TWO_STRAINS.split('\n') } },
    });
    const before = checkTuneAbcStructure(tune, { abcTools: abcTools });
    expect(before.issues.some(function(i) { return i.code === 'section_pickup_should_be_ending'; })).toBe(true);

    const fixed = convertSectionPickupsToVoltasInTune(tune, abcTools);
    expect(fixed).not.toBeNull();
    const flat = fixed.voices[Object.keys(fixed.voices)[0]].notes.join('\n');
    expect(flat).toContain('[1 FG :|');
    expect(flat).toContain('[2 de :|');
    expect(flat).toContain('[2 FG :|');
    expect(flat.match(/\|:de\|\|/g)).toBeNull();
    expect(flat).toMatch(/\[[0-9]+/);

    const after = checkTuneAbcStructure(fixed, { abcTools: abcTools });
    const codes = after && after.issues ? after.issues.map(function(i) { return i.code }) : [];
    expect(codes).not.toContain('section_pickup_should_be_ending');
  });

  test('convertSectionPickupsToVoltas is not offered for three-strain tunes', function() {
    const tune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Volta 3') + 'C |', {
      meter: '4/4',
      key: 'D',
      noteLength: '1/8',
    }), {
      voices: { '1': { notes: ANACRUSIS_THREE_STRAINS.split('\n') } },
    });
    const result = checkTuneAbcStructure(tune, { abcTools: abcTools });
    const issues = result && result.issues ? result.issues : [];
    expect(structureFixAvailable('convertSectionPickupsToVoltas', tune, abcTools, issues)).toBe(false);
  });

  test('quantizeOverfullBarsInTune keeps notation line breaks', function() {
    const tune = Object.assign(tuneFromAbc(abcTools, abcTools.emptyABC('Overfull') + 'C |', {
      meter: '4/4',
      noteLength: '1/8',
    }), {
      voices: {
        '1': {
          notes: [
            'C5/8 D5/8 E5/8 F5/8 G5/8 A5/8 B5/8 c5/8 d5/8 |',
            'e2 f2 g2 a2 |',
            'b2 c2 d2 e2 |',
          ],
        },
      },
    });
    const preview = previewStructureFix('quantizeOverfullBars', tune, abcTools);
    expect(preview).not.toBeNull();
    const afterNotes = preview.tune.voices['1'].notes;
    expect(afterNotes.length).toBeGreaterThan(1);
    const bodyLines = String(preview.after || '').split('\n').filter(function(line) {
      const trimmed = String(line || '').trim();
      if (!trimmed) return false;
      if (/^[A-Z]:/.test(trimmed)) return false;
      if (/^%%/.test(trimmed)) return false;
      return true;
    });
    expect(bodyLines.length).toBeGreaterThan(1);
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
