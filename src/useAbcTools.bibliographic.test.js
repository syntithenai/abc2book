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

  test('round-trips abcbook-albums lines', function() {
    const abc = [
      'X:1',
      'T:Song',
      'M:4/4',
      'L:1/8',
      'K:C',
      'C |',
      '% abcbook-tune_id test-id',
      '% abcbook-albums Abbey Road (1969)',
      '% abcbook-albums Let It Be (1970)',
    ].join('\n');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.albums).toEqual(['Abbey Road (1969)', 'Let It Be (1970)']);

    const exported = abcTools.json2abc(parsed);
    expect(exported).toContain('% abcbook-albums Abbey Road (1969)');
    expect(exported).toContain('% abcbook-albums Let It Be (1970)');

    const reparsed = abcTools.abc2json(exported);
    expect(reparsed.albums).toEqual(['Abbey Road (1969)', 'Let It Be (1970)']);
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

  test('does not re-emit primary headers like X from tune.meta (avoids blank notation)', function() {
    const tune = {
      id: 'x-meta',
      name: 'Meta X Tune',
      meter: '6/8',
      noteLength: '1/8',
      rhythm: 'Jig',
      tempo: 100,
      key: 'D',
      meta: {
        X: 8,
        F: 'recording.mp3 Some title',
      },
      voices: {
        '1': { notes: ['A|"D"BAF DFA|'] },
      },
    };
    const exported = abcTools.json2abc(tune);
    const xHeaders = exported.split('\n').filter(function(line) {
      return /^X:/i.test(String(line || '').trim());
    });
    expect(xHeaders.length).toBe(1);
    expect(exported).toContain('BAF DFA');
    // File URL meta is still allowed as a catch-all header.
    expect(exported).toMatch(/^F:/m);
  });

  test('does not export tablature settings (device-local); still parses legacy ABC for migration', function() {
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
    expect(exported).not.toContain('% abcbook-tablature');
    expect(exported).not.toContain('% abcbook-tab-display');

    const legacyAbc = [
      exported.trim(),
      '% abcbook-tablature guitar',
      '% abcbook-tab-display tab',
      '% abcbook-tablature-voices {"1":{"instrumentId":"guitar","presetId":"standard","tuning":"Standard"},"2":{"instrumentId":"violin","presetId":"aeae","tuning":"AEAE"}}',
    ].join('\n');
    const parsed = abcTools.abc2json(legacyAbc);
    expect(parsed.tablature).toBe('guitar');
    expect(parsed.tabDisplay).toBe('tab');
    expect(parsed.tablatureVoices['1'].instrumentId).toBe('guitar');
    expect(parsed.tablatureVoices['2'].instrumentId).toBe('violin');
    expect(parsed.tablatureVoices['2'].tuning).toBe('AEAE');
  });
});
