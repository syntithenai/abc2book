/**
 * @jest-environment jsdom
 */

import {
  buildFiltersFromImportScope,
  collectTuneIdsFromImportResults,
  stampSrcUrlOnImportResults,
} from './syncSourceImportUtils';

describe('syncSourceImportUtils', function() {
  test('buildFiltersFromImportScope maps scopes', function() {
    expect(buildFiltersFromImportScope({ scope: 'book', bookName: 'Songs' })).toEqual({
      limitToBookName: 'Songs',
    });
    expect(buildFiltersFromImportScope({ scope: 'tag', tagName: 'fast' })).toEqual({
      limitToTagName: 'fast',
    });
  });

  test('stampSrcUrlOnImportResults adds srcUrl to buckets', function() {
    const results = {
      inserts: [{ id: '1', name: 'Tune' }],
      updates: {},
    };
    const stamped = stampSrcUrlOnImportResults(results, 'https://example.com/book.abc');
    expect(stamped.inserts[0].srcUrl).toBe('https://example.com/book.abc');
  });

  test('collectTuneIdsFromImportResults gathers ids', function() {
    const ids = collectTuneIdsFromImportResults({
      inserts: [{ id: 'a' }],
      updates: [{ id: 'b' }],
    });
    expect(ids).toEqual(['a', 'b']);
  });
});
