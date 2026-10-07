import useAbcTools from './useAbcTools';
import { applyPersonalFieldPolicy } from './shareImportPersonalFields';
import { startAutoEnrichOnOpen } from './useAutoEnrichOnOpen';

jest.mock('./addTuneAutoEnrich', function() {
  return {
    __esModule: true,
    runAddTuneAutoEnrich: jest.fn(function() { return Promise.resolve(true); }),
    isAddTuneAutoEnrichPending: jest.fn(function() { return false; }),
  };
});

const addTuneAutoEnrich = require('./addTuneAutoEnrich');

const FLAGGED_ABC = [
  'X:1',
  'T:Spancil Hill',
  'C:Traditional',
  'R:waltz',
  'M:3/4',
  'L:1/8',
  'K:Edor',
  'B4 E2|B4 B2|',
  '% abcbook-tune_id 6ab4677d467716363bdeea51',
  '% abcbook-auto-enrich pending',
  '% abcbook-tags andrew kordas',
  '% abcbook-lastupdated 1791000000000',
  '',
].join('\n');

function makeTunebook() {
  const saved = [];
  return {
    saved: saved,
    saveTune: jest.fn(function(tune) {
      const copy = Object.assign({}, tune);
      saved.push(copy);
      return copy;
    }),
  };
}

describe('abcbook-auto-enrich flag', function() {
  beforeEach(function() {
    addTuneAutoEnrich.runAddTuneAutoEnrich.mockClear();
    addTuneAutoEnrich.isAddTuneAutoEnrichPending.mockReset();
    addTuneAutoEnrich.isAddTuneAutoEnrichPending.mockReturnValue(false);
  });

  test('parses and round-trips through json2abc only while set', function() {
    const abcTools = useAbcTools();
    const parsed = abcTools.abc2Tunebook(FLAGGED_ABC)[0];
    expect(parsed.autoEnrichOnOpen).toBe(true);

    const written = abcTools.json2abc(parsed);
    expect(written).toContain('% abcbook-auto-enrich pending');
    expect(abcTools.abc2Tunebook(written)[0].autoEnrichOnOpen).toBe(true);

    const cleared = abcTools.json2abc(Object.assign({}, parsed, { autoEnrichOnOpen: false }));
    expect(cleared).not.toContain('abcbook-auto-enrich');
    expect(abcTools.abc2Tunebook(cleared)[0].autoEnrichOnOpen).toBeFalsy();
  });

  test('survives the import personal-field policy for new tunes', function() {
    const abcTools = useAbcTools();
    const incoming = abcTools.abc2Tunebook(FLAGGED_ABC)[0];
    applyPersonalFieldPolicy(incoming, null, 'preserveLocal');
    expect(incoming.autoEnrichOnOpen).toBe(true);
  });

  test('starts enrichment once and clears the flag before searching', function() {
    const tunebook = makeTunebook();
    const tune = useAbcTools().abc2Tunebook(FLAGGED_ABC)[0];

    expect(startAutoEnrichOnOpen({ tune: tune, tunebook: tunebook })).toBe(true);
    expect(tunebook.saveTune).toHaveBeenCalledTimes(1);
    expect(tunebook.saved[0].autoEnrichOnOpen).toBe(false);
    expect(addTuneAutoEnrich.runAddTuneAutoEnrich).toHaveBeenCalledTimes(1);
    const runArgs = addTuneAutoEnrich.runAddTuneAutoEnrich.mock.calls[0][0];
    expect(runArgs.tune.id).toBe('6ab4677d467716363bdeea51');
    expect(runArgs.tune.autoEnrichOnOpen).toBe(false);
    expect(runArgs.tunebook).toBe(tunebook);

    expect(startAutoEnrichOnOpen({ tune: tunebook.saved[0], tunebook: tunebook })).toBe(false);
    expect(addTuneAutoEnrich.runAddTuneAutoEnrich).toHaveBeenCalledTimes(1);
  });

  test('does not start when a search is already pending for the tune', function() {
    addTuneAutoEnrich.isAddTuneAutoEnrichPending.mockReturnValue(true);
    const tunebook = makeTunebook();
    const tune = useAbcTools().abc2Tunebook(FLAGGED_ABC)[0];

    expect(startAutoEnrichOnOpen({ tune: tune, tunebook: tunebook })).toBe(false);
    expect(tunebook.saveTune).not.toHaveBeenCalled();
    expect(addTuneAutoEnrich.runAddTuneAutoEnrich).not.toHaveBeenCalled();
  });

  test('ignores tunes without the flag', function() {
    const tunebook = makeTunebook();
    expect(startAutoEnrichOnOpen({ tune: { id: 'x', name: 'Plain' }, tunebook: tunebook })).toBe(false);
    expect(tunebook.saveTune).not.toHaveBeenCalled();
  });
});
