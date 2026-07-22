/**
 * @jest-environment jsdom
 */

import {
  backfillSourcesFromTunes,
  buildGoogleDocUrl,
  countTunesForSource,
  formatSourceFilters,
  listActiveSyncSources,
  registerSourceFromImport,
  removeSyncSource,
  setSourcePaused,
  sourceFiltersActive,
  tuneMatchesSourceFilters,
  updateSyncSourceFilters,
  upsertSyncSource,
  writeSyncSources,
} from './syncSourcesStore';

describe('syncSourcesStore', function() {
  beforeEach(function() {
    localStorage.clear();
    writeSyncSources([]);
  });

  test('registerSourceFromImport creates google doc source with filters', function() {
    const source = registerSourceFromImport({
      googleDocumentId: 'doc123',
      label: 'Friend book',
      filters: { limitToBookName: 'Songs' },
      tuneIds: ['t1', 't2'],
    });
    expect(source.kind).toBe('googleDoc');
    expect(source.url).toBe(buildGoogleDocUrl('doc123'));
    expect(source.filters.limitToBookName).toBe('Songs');
    expect(source.tuneIds).toEqual(['t1', 't2']);
    expect(listActiveSyncSources()).toHaveLength(1);
  });

  test('registerSourceFromImport merges tune ids into existing source', function() {
    registerSourceFromImport({ url: 'https://example.com/book.abc', tuneIds: ['a'] });
    const updated = registerSourceFromImport({ url: 'https://example.com/book.abc', tuneIds: ['b'] });
    expect(updated.tuneIds).toEqual(['a', 'b']);
    expect(listActiveSyncSources()).toHaveLength(1);
  });

  test('pause and remove source', function() {
    const source = registerSourceFromImport({ url: 'https://example.com/a.abc' });
    setSourcePaused(source.id, true);
    expect(listActiveSyncSources()).toHaveLength(0);
    removeSyncSource(source.id);
    const stored = removeSyncSource(source.id);
    expect(stored.removed).toBe(true);
    expect(stored.paused).toBe(true);
  });

  test('backfillSourcesFromTunes creates url sources from srcUrl groups', function() {
    const created = backfillSourcesFromTunes({
      t1: { id: 't1', srcUrl: 'https://example.com/book.abc' },
      t2: { id: 't2', srcUrl: 'https://example.com/book.abc' },
    });
    expect(created).toBe(1);
    expect(listActiveSyncSources()).toHaveLength(1);
  });

  test('tuneMatchesSourceFilters applies additive filters', function() {
    const filters = { limitToBookName: 'Songs', limitToTagNames: ['fast'] };
    expect(sourceFiltersActive(filters)).toBe(true);
    expect(tuneMatchesSourceFilters({ id: '1', books: ['Songs'], tags: ['fast'] }, filters)).toBe(true);
    expect(tuneMatchesSourceFilters({ id: '1', books: ['Songs'], tags: [] }, filters)).toBe(false);
    expect(tuneMatchesSourceFilters({ id: '1', books: ['Other'], tags: ['fast'] }, filters)).toBe(false);
  });

  test('countTunesForSource respects filters and tuneIds', function() {
    const source = registerSourceFromImport({
      url: 'https://example.com/book.abc',
      filters: { limitToBookName: 'Songs' },
      tuneIds: ['t1', 't2'],
    });
    const tunes = {
      t1: { id: 't1', books: ['Songs'], srcUrl: 'https://example.com/book.abc' },
      t2: { id: 't2', books: ['Other'], srcUrl: 'https://example.com/book.abc' },
    };
    expect(countTunesForSource(source, tunes)).toBe(1);
  });

  test('updateSyncSourceFilters persists changes', function() {
    const source = registerSourceFromImport({ url: 'https://example.com/a.abc' });
    updateSyncSourceFilters(source.id, { limitToTagName: 'session' });
    expect(formatSourceFilters(source.filters)).toEqual([]);
    const updated = updateSyncSourceFilters(source.id, { limitToTagName: 'session' });
    expect(updated.filters.limitToTagName).toBe('session');
    expect(formatSourceFilters(updated.filters)).toEqual(['tag: session']);
  });
});
