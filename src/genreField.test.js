import useAbcTools from './useAbcTools';
import { applyNotationTuneMeta } from './notationImportUtils';
import { allGenres } from './tuneBibliographicUtils';

describe('genre field', function() {
  test('round-trips single genre via G: header', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'genre-test-1',
      name: 'Test Tune',
      composer: 'Trad.',
      genres: ['Folk'],
      meter: '4/4',
      key: 'G',
      voices: { 1: { meta: '', notes: ['G A B c |'] } },
    };

    const abc = abcTools.json2abc(tune);
    expect(abc).toContain('G: Folk');

    const parsed = abcTools.abc2json(abc);
    expect(allGenres(parsed)).toEqual(['Folk']);
    expect(parsed.meta.G).toBeUndefined();
  });

  test('round-trips multiple genres via G: headers', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'genre-test-multi',
      name: 'Test Tune',
      composer: 'Trad.',
      genres: ['Folk', 'Jazz'],
      meter: '4/4',
      key: 'G',
      voices: { 1: { meta: '', notes: ['G A B c |'] } },
    };

    const abc = abcTools.json2abc(tune);
    expect(abc).toContain('G: Folk');
    expect(abc).toContain('G: Jazz');

    const parsed = abcTools.abc2json(abc);
    expect(allGenres(parsed)).toEqual(['Folk', 'Jazz']);
  });

  test('imports G: from external ABC', function() {
    const abcTools = useAbcTools();
    const abc = '\nX:1\nT:Reel\nG:Irish Traditional\nM:4/4\nL:1/8\nK:D\nD E F G |\n';
    const parsed = abcTools.abc2json(abc);
    expect(allGenres(parsed)).toEqual(['Irish Traditional']);
  });

  test('imports multiple G: lines from external ABC', function() {
    const abcTools = useAbcTools();
    const abc = '\nX:1\nT:Reel\nG:Folk\nG:Jazz\nM:4/4\nL:1/8\nK:D\nD E F G |\n';
    const parsed = abcTools.abc2json(abc);
    expect(allGenres(parsed)).toEqual(['Folk', 'Jazz']);
  });

  test('promotes legacy meta.G and tune.genre to genres', function() {
    const abcTools = useAbcTools();
    const tune = {
      id: 'genre-test-2',
      name: 'Legacy',
      meter: '4/4',
      key: 'C',
      genre: 'Bluegrass',
      meta: { G: 'Folk' },
      voices: { 1: { meta: '', notes: ['C D E F |'] } },
    };

    const abc = abcTools.json2abc(tune);
    expect(abc).toMatch(/G: (Bluegrass|Folk)/);
    expect(allGenres(tune)).toEqual(expect.arrayContaining(['Bluegrass', 'Folk']));
  });

  test('applyNotationTuneMeta merges genre', function() {
    const tune = { genres: [] };
    applyNotationTuneMeta(tune, { genre: 'Jazz' });
    expect(allGenres(tune)).toEqual(['Jazz']);
  });
});
