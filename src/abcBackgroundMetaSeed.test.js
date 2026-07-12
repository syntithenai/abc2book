import useAbcTools from './useAbcTools';

describe('ABC bibliographic meta seed into backgroundInfo', function() {
  test('folds O S Z D A and non-AKA N into backgroundInfo', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Test Tune',
      'O:Ireland',
      'S:O\'Neill\'s',
      'Z:Transcribed by Pat',
      'D:The Bothy Band',
      'A:Munster',
      'N:Often played as a set dance',
      'N: AKA: Other Name',
      'M:4/4',
      'L:1/8',
      'K:G',
      'G A B c |',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.backgroundInfo).toContain('**Origin:** Ireland');
    expect(parsed.backgroundInfo).toContain("**Source:** O'Neill's");
    expect(parsed.backgroundInfo).toContain('**Transcription:** Transcribed by Pat');
    expect(parsed.backgroundInfo).toContain('**Discography:** The Bothy Band');
    expect(parsed.backgroundInfo).toContain('**Area:** Munster');
    expect(parsed.backgroundInfo).toContain('**Notes:** Often played as a set dance');
    expect(parsed.aliases).toContain('Other Name');
    expect(parsed.meta.O).toBeUndefined();
    expect(parsed.meta.S).toBeUndefined();
    expect(parsed.meta.Z).toBeUndefined();
    expect(parsed.meta.D).toBeUndefined();
    expect(parsed.meta.A).toBeUndefined();
    expect(parsed.meta.N).toBeUndefined();
  });

  test('appends bibliographic seed after existing H: background', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Test Tune',
      'H:A well-known session tune.',
      'O:Scotland',
      'S:Kerr\'s',
      'M:4/4',
      'L:1/8',
      'K:D',
      'D E F G |',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.backgroundInfo).toContain('A well-known session tune.');
    expect(parsed.backgroundInfo).toContain('**Origin:** Scotland');
    expect(parsed.backgroundInfo).toContain("**Source:** Kerr's");
    expect(parsed.meta.O).toBeUndefined();
    expect(parsed.meta.S).toBeUndefined();
  });
});
