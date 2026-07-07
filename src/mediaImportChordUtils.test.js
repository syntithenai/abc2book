import { appendChordGrids, appendNotationLines } from './mediaImportChordUtils';

describe('mediaImportChordUtils', function() {
  test('appendChordGrids combines bar grids', function() {
    expect(appendChordGrids('C|F G|', 'Am|D|')).toBe('C|F G| Am|D|');
    expect(appendChordGrids('', 'Am|D|')).toBe('Am|D|');
    expect(appendChordGrids('C|F G|', '')).toBe('C|F G|');
  });

  test('appendNotationLines joins melody lines', function() {
    expect(appendNotationLines('CDEF |', 'GABc |')).toBe('CDEF |\nGABc |');
    expect(appendNotationLines('', 'GABc |')).toBe('GABc |');
    expect(appendNotationLines('CDEF |', '')).toBe('CDEF |');
  });
});
