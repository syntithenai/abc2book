import {
  readIncomingMergePrefs,
  writeIncomingMergePrefs,
  getSourceMergePref,
  setSourceMergePref,
  normalizeSourceUrlKey,
} from './incomingMergePrefs';

describe('incomingMergePrefs', function() {
  beforeEach(function() {
    localStorage.clear();
  });

  test('normalizeSourceUrlKey trims trailing slashes', function() {
    expect(normalizeSourceUrlKey('https://Example.com/doc/')).toBe('https://example.com/doc');
  });

  test('setSourceMergePref persists per source key', function() {
    setSourceMergePref('source-a', 'alwaysAccept');
    expect(getSourceMergePref('source-a')).toBe('alwaysAccept');
    expect(getSourceMergePref('source-b')).toBe(null);
  });

  test('writeIncomingMergePrefs replaces stored prefs', function() {
    writeIncomingMergePrefs({ foo: 'alwaysReject' });
    expect(readIncomingMergePrefs()).toEqual({ foo: 'alwaysReject' });
    setSourceMergePref('foo', null);
    expect(readIncomingMergePrefs()).toEqual({});
  });
});
