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

  test('round-trips multi-voice tablature settings without corrupting legacy tablature field', function() {
    const tune = {
      id: 'tab-test',
      name: 'Copper Kettle',
      meter: '4/4',
      noteLength: '1/8',
      key: 'D',
      tablature: 'guitar',
      tabDisplay: 'tab',
      tablatureVoices: {
        '1': { instrumentId: 'guitar', presetId: 'standard', tuning: 'Standard' },
        '2': { instrumentId: 'violin', presetId: 'aeae', tuning: 'AEAE' },
      },
      voices: {
        '1': { notes: ['A2A2 |'] },
        '2': { notes: ['d2d2 |'] },
      },
    };
    const exported = abcTools.json2abc(tune);
    expect(exported).toContain('% abcbook-tablature-voices');
    expect(exported).toContain('% abcbook-tab-display tab');
    expect(exported).not.toContain('% abcbook-tablature -voices');

    const parsed = abcTools.abc2json(exported);
    expect(parsed.tablature).toBe('guitar');
    expect(parsed.tabDisplay).toBe('tab');
    expect(parsed.tablatureVoices['1'].instrumentId).toBe('guitar');
    expect(parsed.tablatureVoices['2'].instrumentId).toBe('violin');
    expect(parsed.tablatureVoices['2'].tuning).toBe('AEAE');
  });
});
