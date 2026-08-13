import {
  normalizeMelodyBarlines,
  normalizeAbcTextForAbcjs,
  abcForAbcjs,
  normalizeVoiceNoteLines,
  normalizeVoiceNotesText,
  melodyHasAnacrusisDoubleBarlines,
  melodyHasMidBlockDoubleBarlines,
  melodyLineHasMidBlockDoubleBarlines,
  ensureBarlinesAtMusicLineJoins,
} from './melodyBarlineNormalize';
import { ANACRUSIS_STRAIN_A } from './testFixtures/anacrusisDoubleBarlineFixtures';

describe('melodyBarlineNormalize', function() {
  test('normalizeMelodyBarlines collapses pickup || after |: and ::', function() {
    expect(normalizeMelodyBarlines('|:FG||"D"AFDF|')).toBe('|:FG|"D"AFDF|');
    expect(normalizeMelodyBarlines('::de||fdAd|')).toBe('::de|fdAd|');
    expect(normalizeMelodyBarlines('C D E F | G A B c || d e f g |'))
      .toBe('C D E F | G A B c || d e f g |');
  });

  test('ensureBarlinesAtMusicLineJoins inserts missing | between wrapped bars', function() {
    expect(ensureBarlinesAtMusicLineJoins([
      '"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz',
      '"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz ||',
    ])).toEqual([
      '"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|',
      '"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz ||',
    ]);
    expect(ensureBarlinesAtMusicLineJoins([
      '"Am"cdef|',
      '"G"gab c|',
    ])).toEqual([
      '"Am"cdef|',
      '"G"gab c|',
    ]);
    expect(ensureBarlinesAtMusicLineJoins([
      '"Gm"zzzzzzzzzz | "F"zzzzzzzzzz | "Gm"zzzzzz"Dm"zzzz || [M:4/4]',
      '"F"zzzzzzzz | "Dm"zzzzzzzz |',
    ])).toEqual([
      '"Gm"zzzzzzzzzz | "F"zzzzzzzzzz | "Gm"zzzzzz"Dm"zzzz || [M:4/4]',
      '"F"zzzzzzzz | "Dm"zzzzzzzz |',
    ]);
  });

  test('normalizeAbcTextForAbcjs inserts | so wrapped chorus bars stay separate', function() {
    const abc = [
      'X:1',
      'M:4/4',
      'K:Dm',
      '"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz',
      '"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz ||',
    ].join('\n');
    const out = normalizeAbcTextForAbcjs(abc);
    expect(out).toContain('"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|"Dm"zzzz"F"zzzz|');
    expect(out.split('\n')[3].endsWith('|')).toBe(true);
  });

  test('normalizeAbcTextForAbcjs leaves headers and normalizes music lines', function() {
    const abc = [
      'X:1',
      'M:4/4',
      'L:1/8',
      'K:D',
      ANACRUSIS_STRAIN_A,
    ].join('\n');
    const out = normalizeAbcTextForAbcjs(abc);
    expect(out).toContain('M:4/4');
    expect(out).toContain('|:FG|"D"AFDF');
    expect(out).not.toMatch(/\|:FG\|\|/);
    expect(abcForAbcjs(abc)).toBe(out);
  });

  test('normalizeAbcTextForAbcjs trims music lines and drops blank lines', function() {
    const abc = [
      'X:1',
      'K:C',
      '',
      '  "Am"cdef|',
      '',
      '  "G"gab c|',
      '',
    ].join('\n');
    const out = normalizeAbcTextForAbcjs(abc);
    expect(out).toBe([
      'X:1',
      'K:C',
      '"Am"cdef|',
      '"G"gab c|',
    ].join('\n'));
    expect(abcForAbcjs(abc)).toBe(out);
  });

  test('normalizeVoiceNoteLines trims and drops blanks', function() {
    expect(normalizeVoiceNoteLines([
      '',
      '  "Am"cdef|',
      '   ',
      '"G"gab c|',
      '',
    ])).toEqual(['"Am"cdef|', '"G"gab c|']);
    expect(normalizeVoiceNotesText('  "Am"cdef|\n\n"G"gab c|\n')).toBe('"Am"cdef|\n"G"gab c|');
  });

  test('melodyHasAnacrusisDoubleBarlines detects raw pickup ||', function() {
    expect(melodyHasAnacrusisDoubleBarlines([ANACRUSIS_STRAIN_A])).toBe(true);
    expect(melodyHasAnacrusisDoubleBarlines([normalizeMelodyBarlines(ANACRUSIS_STRAIN_A)])).toBe(false);
  });

  test('melodyHasMidBlockDoubleBarlines detects every-bar || chord scaffolds', function() {
    expect(melodyLineHasMidBlockDoubleBarlines(
      '"D"zzzzzzzz||"G"zzzzzzzz||"A"zzzzzzzz||"D"zzzzzzzz||'
    )).toBe(true);
    expect(melodyHasMidBlockDoubleBarlines([
      '"D"zzzzzzzz|"G"zzzzzzzz|"A"zzzzzzzz|"D"zzzzzzzz||',
      '"D"zzzzzzzz||"F"zzzzzzzz||"C"zzzzzzzz||"G"zzzzzzzz||',
    ])).toBe(true);
  });

  test('melodyHasMidBlockDoubleBarlines ignores section-end and anacrusis ||', function() {
    expect(melodyLineHasMidBlockDoubleBarlines(
      '"Am"zzzz|"E7"zzzz|"C"zzzz|"D"zzzz||'
    )).toBe(false);
    expect(melodyLineHasMidBlockDoubleBarlines(
      '"G"f3g f2 | "A7"e4 Ac || "D"d3c BA | "D7"F4 EF |'
    )).toBe(false);
    expect(melodyLineHasMidBlockDoubleBarlines(ANACRUSIS_STRAIN_A)).toBe(false);
    expect(melodyHasMidBlockDoubleBarlines([
      '"Am"zzzz|"E7"zzzz|"C"zzzz|"D"zzzz||',
      '"Fmaj7"zzzz|"C"zzzz|"E"zzzz|"E7"zzzz||',
    ])).toBe(false);
  });
});
