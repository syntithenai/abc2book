import {
  normalizeMelodyBarlines,
  normalizeAbcTextForAbcjs,
  abcForAbcjs,
  melodyHasAnacrusisDoubleBarlines,
} from './melodyBarlineNormalize';
import { ANACRUSIS_STRAIN_A } from './testFixtures/anacrusisDoubleBarlineFixtures';

describe('melodyBarlineNormalize', function() {
  test('normalizeMelodyBarlines collapses pickup || after |: and ::', function() {
    expect(normalizeMelodyBarlines('|:FG||"D"AFDF|')).toBe('|:FG|"D"AFDF|');
    expect(normalizeMelodyBarlines('::de||fdAd|')).toBe('::de|fdAd|');
    expect(normalizeMelodyBarlines('C D E F | G A B c || d e f g |'))
      .toBe('C D E F | G A B c || d e f g |');
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

  test('melodyHasAnacrusisDoubleBarlines detects raw pickup ||', function() {
    expect(melodyHasAnacrusisDoubleBarlines([ANACRUSIS_STRAIN_A])).toBe(true);
    expect(melodyHasAnacrusisDoubleBarlines([normalizeMelodyBarlines(ANACRUSIS_STRAIN_A)])).toBe(false);
  });
});
