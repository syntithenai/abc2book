/**
 * @jest-environment jsdom
 */

import {
  buildFiltersFromImportScope,
  collectTuneIdsFromImportResults,
  seedSourceSyncBaselinesAfterImport,
  stampSrcUrlOnImportResults,
} from './syncSourceImportUtils';
import { getSourceSyncBaseline } from './sourceSyncBaseline';

describe('syncSourceImportUtils', function() {
  beforeEach(function() {
    localStorage.clear();
  });

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

  test('seedSourceSyncBaselinesAfterImport seeds baselines for imported tunes', function() {
    seedSourceSyncBaselinesAfterImport(
      { url: 'https://example.com/book.abc' },
      { a: { id: 'a', lastUpdated: 100 } },
      { inserts: [{ id: 'a' }] }
    );
    expect(getSourceSyncBaseline('https://example.com/book.abc', 'a').appliedAt).toBe(100);
  });
});
