import useAbcTools from './useAbcTools';
import { applyNotationTuneMeta } from './notationImportUtils';

describe('genre field', function() {
  test('round-trips genre via G: header', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'genre-test-1',
      name: 'Test Tune',
      composer: 'Trad.',
      genre: 'Folk',
      meter: '4/4',
      key: 'G',
      voices: { 1: { meta: '', notes: ['G A B c |'] } },
    };

    const abc = abcTools.json2abc(tune);
    expect(abc).toContain('G: Folk');

    const parsed = abcTools.abc2json(abc);
    expect(parsed.genre).toBe('Folk');
    expect(parsed.meta.G).toBeUndefined();
  });

  test('imports G: from external ABC', function() {
    const abcTools = useAbcTools();
    const abc = '\nX:1\nT:Reel\nG:Irish Traditional\nM:4/4\nL:1/8\nK:D\nD E F G |\n';
    const parsed = abcTools.abc2json(abc);
    expect(parsed.genre).toBe('Irish Traditional');
  });

  test('promotes legacy meta.G to genre', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'genre-test-2',
      name: 'Legacy',
      meter: '4/4',
      key: 'C',
      meta: { G: 'Bluegrass' },
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
    };

    const abc = abcTools.json2abc(tune);
    expect(abc).toContain('G: Bluegrass');
    expect(abc.match(/^G:/gm) || []).toHaveLength(1);
  });

  test('applyNotationTuneMeta merges genre', function() {
    const tune = { genre: '' };
    applyNotationTuneMeta(tune, { genre: 'Jazz' });
    expect(tune.genre).toBe('Jazz');
  });
});
