import useAbcTools from './useAbcTools';

describe('useAbcTools bibliographic fields', function() {
  const abcTools = useAbcTools();

  test('parses multiple T and C headers into name, aliases, composer, artists', function() {
    const abc = [
      'X:1',
      'T:Main Title',
      'T:Alt Title',
      'C:Composer One',
      'C:Performer Two',
      'M:4/4',
      'L:1/8',
      'K:G',
      'G A B |',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.name).toBe('Main Title');
    expect(parsed.aliases).toEqual(['Alt Title']);
    expect(parsed.composer).toBe('Composer One');
    expect(parsed.artists).toEqual(['Performer Two']);
  });

  test('imports N: AKA into aliases and exports as extra T lines', function() {
    const abc = [
      'X:1',
      'T:Main',
      'N: AKA: Legacy Alias',
      'M:4/4',
      'L:1/8',
      'K:G',
      'G |',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.aliases).toContain('Legacy Alias');

    const exported = abcTools.json2abc(parsed);
    expect(exported).toContain('T: Main');
    expect(exported).toContain('T: Legacy Alias');
    expect(exported).not.toContain('N: AKA:');
  });

  test('round-trips multiple bibliographic headers', function() {
    const abc = [
      'X:1',
      'T:Main',
      'T:Alias',
      'C:Writer',
      'C:Band',
      'M:4/4',
      'L:1/8',
      'K:D',
      'D |',
      '% abcbook-tune_id test-id',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    const exported = abcTools.json2abc(parsed);
    const reparsed = abcTools.abc2json(exported);

    expect(reparsed.name).toBe('Main');
    expect(reparsed.aliases).toEqual(['Alias']);
    expect(reparsed.composer).toBe('Writer');
    expect(reparsed.artists).toEqual(['Band']);
  });

  test('round-trips lyricsScrollDurationSec', function() {
    const abc = [
      'X:1',
      'T:Timed',
      'M:4/4',
      'L:1/8',
      'K:C',
      'C |',
      '% abcbook-lyrics-scroll-duration 158',
    ].join('\n');
    const parsed = abcTools.abc2json(abc);
    expect(parsed.lyricsScrollDurationSec).toBe(158);
    const exported = abcTools.json2abc(parsed);
    expect(exported).toContain('% abcbook-lyrics-scroll-duration 158');
    expect(abcTools.abc2json(exported).lyricsScrollDurationSec).toBe(158);
  });
});
