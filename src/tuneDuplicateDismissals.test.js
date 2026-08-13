import {
  duplicatePairKey,
  readDuplicateDismissals,
  writeDuplicateDismissals,
  recordDuplicateDismissal,
  getDuplicateDismissal,
  isDuplicatePairDismissed,
  clearDuplicateDismissal,
  clearDuplicateDismissalsForTuneIds,
  dismissDuplicateGroup,
} from './tuneDuplicateDismissals';

describe('tuneDuplicateDismissals', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('duplicatePairKey is order-independent', function() {
    expect(duplicatePairKey('b', 'a')).toBe('a|b');
    expect(duplicatePairKey('a', 'b')).toBe('a|b');
  });

  test('record and read dismissal with hash fingerprints', function() {
    recordDuplicateDismissal('t1', 't2', { hashA: 'h1', hashB: 'h2' });
    const stored = getDuplicateDismissal('t2', 't1');
    expect(stored).toMatchObject({ hashA: 'h1', hashB: 'h2' });
    expect(isDuplicatePairDismissed('t1', 't2', 'h1', 'h2')).toBe(true);
    expect(isDuplicatePairDismissed('t1', 't2', 'h1-changed', 'h2')).toBe(false);
  });

  test('recordDuplicateDismissal stores hashes in sorted id order', function() {
    recordDuplicateDismissal('b', 'a', { hashA: 'hash-b', hashB: 'hash-a' });
    const stored = getDuplicateDismissal('a', 'b');
    expect(stored).toMatchObject({ hashA: 'hash-a', hashB: 'hash-b' });
    expect(isDuplicatePairDismissed('a', 'b', 'hash-a', 'hash-b')).toBe(true);
    expect(isDuplicatePairDismissed('b', 'a', 'hash-b', 'hash-a')).toBe(true);
  });

  test('isDuplicatePairDismissed accepts reversed hash order from legacy records', function() {
    writeDuplicateDismissals({
      'a|b': { hashA: 'x', hashB: 'y', dismissedAt: 1 },
    });
    expect(isDuplicatePairDismissed('b', 'a', 'y', 'x')).toBe(true);
  });

  test('empty fingerprints keep pair dismissed', function() {
    recordDuplicateDismissal('a', 'b', { hashA: '', hashB: '' });
    expect(isDuplicatePairDismissed('a', 'b', 'real-a', 'real-b')).toBe(true);
    expect(isDuplicatePairDismissed('a', 'b', '', '')).toBe(true);
  });

  test('incomplete current hashes keep pair dismissed', function() {
    recordDuplicateDismissal('a', 'b', { hashA: 'h1', hashB: 'h2' });
    expect(isDuplicatePairDismissed('a', 'b', 'h1', '')).toBe(true);
    expect(isDuplicatePairDismissed('a', 'b', '', 'h2')).toBe(true);
  });

  test('clearDuplicateDismissal removes entry', function() {
    recordDuplicateDismissal('a', 'b', { hashA: 'x', hashB: 'y' });
    clearDuplicateDismissal('a', 'b');
    expect(readDuplicateDismissals()).toEqual({});
  });

  test('clearDuplicateDismissalsForTuneIds removes related pairs', function() {
    recordDuplicateDismissal('a', 'b', { hashA: '1', hashB: '2' });
    recordDuplicateDismissal('a', 'c', { hashA: '1', hashB: '3' });
    recordDuplicateDismissal('b', 'c', { hashA: '2', hashB: '3' });
    clearDuplicateDismissalsForTuneIds(['b']);
    const remaining = readDuplicateDismissals();
    expect(remaining['a|c']).toBeTruthy();
    expect(remaining['a|b']).toBeUndefined();
    expect(remaining['b|c']).toBeUndefined();
  });

  test('dismissDuplicateGroup records all pairs', function() {
    const getHash = function(tune) { return 'hash-' + tune.id; };
    dismissDuplicateGroup(['a', 'b', 'c'], getHash, {
      a: { id: 'a' },
      b: { id: 'b' },
      c: { id: 'c' },
    });
    const all = readDuplicateDismissals();
    expect(Object.keys(all)).toHaveLength(3);
  });

  test('writeDuplicateDismissals persists to localStorage', function() {
    writeDuplicateDismissals({ 'x|y': { dismissedAt: 1 } });
    expect(readDuplicateDismissals()).toEqual({ 'x|y': { dismissedAt: 1 } });
  });
});
