import { fixStrainRepeatEndsOnLines } from './repeatStrainFix';

describe('repeatStrainFix', function() {
  test('preserves note line breaks for session tune', function() {
    const lines = [
      '|: "Am"E2A2 ABcd | e2d2 c2A2 | "G"B2G2 GFGA | "Em"B2AG E2D2 |',
      '"Am"E2A2 ABcd | e2d2 e2ag | "Em"e2d2 "G"BedB | "Am"A4 A4 ||',
      '|: "Am"a2e2 e2fg | abag e2fg | abaf "Em"g3e | "G"dedB G4 |',
      '"Am"a2e2 e2fg | abag e2d2 | "Em"B2e2 "G"d2B2 | "Am"A4 A4 ||',
    ];
    const fixed = fixStrainRepeatEndsOnLines(lines);
    expect(fixed).not.toBeNull();
    expect(fixed.length).toBe(4);
    expect(fixed[1]).toMatch(/:\|\|/);
    expect(fixed[3]).toMatch(/:\|\|/);
    expect(fixed[0]).toBe(lines[0]);
    expect(fixed[2]).toBe(lines[2]);
  });

  test('does not duplicate repeat ends', function() {
    const lines = [
      '|: C D E F | G A B c :| ||',
      '|: e f g a |',
    ];
    const fixed = fixStrainRepeatEndsOnLines(lines);
    expect(fixed).toBeNull();
  });

  test('collapses empty bar between || and |: without adding duplicate :|', function() {
    const lines = ['"Am"A4 A4 || | |: "G"G4 G4 |'];
    const fixed = fixStrainRepeatEndsOnLines(lines);
    expect(fixed).not.toBeNull();
    expect(fixed[0]).toMatch(/\|\|\s*\|:/);
    expect(fixed[0]).not.toMatch(/:\|\s*:\|/);
  });

  test('does not add extra barline after repeat end before strain double bar', function() {
    const lines = [
      '|: "Am"E2A2 ABcd | e2d2 c2A2 |',
      '| "Am"A4A4 ||',
    ];
    const fixed = fixStrainRepeatEndsOnLines(lines);
    expect(fixed).not.toBeNull();
    expect(fixed[1]).toBe('| "Am"A4A4 :||');
    expect(fixed[1]).not.toMatch(/:\|\|\|/);
  });

  test('does not duplicate repeat end when line already ends with :||', function() {
    const lines = [
      '|: "Am"E2A2 ABcd |',
      '| "Am"A4A4 :||',
    ];
    const fixed = fixStrainRepeatEndsOnLines(lines);
    expect(fixed).toBeNull();
  });
});
