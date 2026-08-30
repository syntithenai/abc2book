import useAbcTools from './useAbcTools';

describe('ABC typed bibliographic metadata', function() {
  test('parses O S Z D A and non-AKA N into typed fields (does not fold into background)', function() {
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
    expect(parsed.origin).toEqual(['Ireland']);
    expect(parsed.source).toEqual(["O'Neill's"]);
    expect(parsed.transcription).toEqual(['Transcribed by Pat']);
    expect(parsed.discography).toEqual(['The Bothy Band']);
    expect(parsed.area).toEqual(['Munster']);
    expect(parsed.infoNotes).toEqual(['Often played as a set dance']);
    expect(parsed.aliases).toContain('Other Name');
    expect(parsed.backgroundInfo || '').not.toContain('**Origin:**');
    expect(parsed.meta.O).toBeUndefined();
    expect(parsed.meta.S).toBeUndefined();
    expect(parsed.meta.N).toBeUndefined();
  });

  test('round-trips typed info headers and source books', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Test Tune',
      'O:Scotland',
      'S:Kerr\'s',
      'N:Session favorite',
      'M:4/4',
      'L:1/8',
      'K:D',
      'D E F G |',
      '% abcbook-tune_id keep-id',
      '% abcbook-source-book O\'Neill\'s 1001',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.origin).toEqual(['Scotland']);
    expect(parsed.sourceBooks).toEqual(["O'Neill's 1001"]);
    const exported = abcTools.json2abc(parsed);
    expect(exported).toContain('O: Scotland');
    expect(exported).toContain("S: Kerr's");
    expect(exported).toContain('N: Session favorite');
    expect(exported).toContain("% abcbook-source-book O'Neill's 1001");
    expect(exported).not.toMatch(/\*\*Origin:\*\*/);

    const reparsed = abcTools.abc2json(exported);
    expect(reparsed.origin).toEqual(['Scotland']);
    expect(reparsed.source).toEqual(["Kerr's"]);
    expect(reparsed.infoNotes).toEqual(['Session favorite']);
    expect(reparsed.sourceBooks).toEqual(["O'Neill's 1001"]);
  });

  test('salvages **Origin:** seeds from backgroundInfo when typed field empty', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Test Tune',
      'H:A well-known session tune.',
      'H:**Origin:** Scotland',
      'H:**Source:** Kerr\'s',
      'M:4/4',
      'L:1/8',
      'K:D',
      'D E F G |',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.origin).toEqual(['Scotland']);
    expect(parsed.source).toEqual(["Kerr's"]);
    expect(parsed.backgroundInfo).toContain('A well-known session tune.');
    expect(parsed.backgroundInfo).not.toContain('**Origin:**');
    expect(parsed.backgroundInfo).not.toContain('**Source:**');
  });

  test('bAsSourceBook remaps B: into sourceBooks when no abcbook-tune_id', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:External',
      'B: O\'Neill\'s',
      'M:4/4',
      'L:1/8',
      'K:G',
      'G |',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc, { bAsSourceBook: true });
    expect(parsed.sourceBooks).toEqual(["O'Neill's"]);
    expect(parsed.books).toEqual([]);
  });

  test('app-owned ABC keeps B: as tunebooks even with bAsSourceBook', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Owned',
      'B: songs',
      'M:4/4',
      'L:1/8',
      'K:G',
      'G |',
      '% abcbook-tune_id owned-id',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc, { bAsSourceBook: true });
    expect(parsed.books).toEqual(['songs']);
    expect(parsed.sourceBooks || []).toEqual([]);
  });

  test('pushMeta round-trips string catch-all headers like F:', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Url Tune',
      'F:https://example.com/tune.abc',
      'M:4/4',
      'L:1/8',
      'K:C',
      'C |',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.meta.F).toEqual(['https://example.com/tune.abc']);
    const exported = abcTools.json2abc(parsed);
    expect(exported).toContain('F: https://example.com/tune.abc');
  });

  test('slash title splits into name and aliases', function() {
    const abcTools = useAbcTools();
    const abc = [
      'X:1',
      'T:Ross Creek/Falls Of Richmond',
      'M:4/4',
      'L:1/8',
      'K:G',
      'G |',
      '',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.name).toBe('Ross Creek');
    expect(parsed.aliases).toContain('Falls Of Richmond');
    const exported = abcTools.json2abc(parsed);
    expect(exported).toContain('T: Ross Creek');
    expect(exported).toContain('T: Falls Of Richmond');
    expect(exported).not.toContain('Ross Creek/Falls');
  });
});
