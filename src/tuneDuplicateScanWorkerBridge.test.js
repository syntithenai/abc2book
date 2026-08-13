import {
  filterTunesByBook,
  filterTunesHashByTunes,
  lookupImportHashFromTunesHash,
  shouldDefaultBookScope,
  stableTuneImportHash,
} from './tuneDuplicateScanWorkerBridge';
import { LARGE_LIST_WARNING_THRESHOLD } from './tuneScaleConstants';

describe('tuneDuplicateScanWorkerBridge', function() {
  test('filterTunesByBook keeps only matching books', function() {
    const tunes = {
      a: { id: 'a', books: ['Folk'] },
      b: { id: 'b', books: ['Jazz', 'Folk'] },
      c: { id: 'c', books: ['Jazz'] },
    };
    const filtered = filterTunesByBook(tunes, 'Folk');
    expect(Object.keys(filtered).sort()).toEqual(['a', 'b']);
  });

  test('filterTunesHashByTunes preserves importhashes for scoped tunes', function() {
    const tunes = {
      a: { id: 'a', books: ['Folk'] },
      b: { id: 'b', books: ['Folk'] },
    };
    const tunesHash = {
      ids: { a: 'h1', b: 'h1', c: 'h2' },
      hashes: { h1: ['a', 'b'], h2: ['c'] },
      importhashes: { shared: ['a', 'b', 'c'], other: ['c'] },
    };
    const scoped = filterTunesHashByTunes(tunesHash, tunes);
    expect(scoped.importhashes.shared).toEqual(['a', 'b']);
    expect(scoped.importhashes.other).toBeUndefined();
    expect(scoped.ids).toEqual({ a: 'h1', b: 'h1' });
    expect(scoped.hashes.h1).toEqual(['a', 'b']);
    expect(scoped.hashes.h2).toBeUndefined();
  });

  test('lookupImportHashFromTunesHash finds bucket for tune id', function() {
    const tunesHash = { importhashes: { abc: ['x', 'y'], def: ['z'] } };
    expect(lookupImportHashFromTunesHash(tunesHash, 'y')).toBe('abc');
    expect(lookupImportHashFromTunesHash(tunesHash, 'missing')).toBe('');
  });

  test('stableTuneImportHash prefers index and skips unhydrated bodies', function() {
    const tunesHash = { importhashes: { 'from-index': ['a'] } };
    expect(stableTuneImportHash({ id: 'a', voices: {} }, function() { return 'computed'; }, tunesHash)).toBe('from-index');
    expect(stableTuneImportHash({ id: 'b' }, function() { return 'computed'; }, {})).toBe('');
    const hydrated = { id: 'b', voices: { v1: { notes: ['C'] } } };
    expect(stableTuneImportHash(hydrated, function() { return 'computed'; }, {})).toBe('computed');
  });

  test('shouldDefaultBookScope requires large library and current book', function() {
    expect(shouldDefaultBookScope(LARGE_LIST_WARNING_THRESHOLD + 1, 'Folk')).toBe(true);
    expect(shouldDefaultBookScope(LARGE_LIST_WARNING_THRESHOLD + 1, '')).toBe(false);
    expect(shouldDefaultBookScope(10, 'Folk')).toBe(false);
  });
});
