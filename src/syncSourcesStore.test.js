/**
 * @jest-environment jsdom
 */

import {
  backfillSourcesFromTunes,
  buildGoogleDocUrl,
  countTunesForSource,
  formatSourceFilters,
  isManagedSyncSource,
  isStaticTunebookNetUrl,
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

const STATIC_SOURCE_URL = 'https://tunebook.net/scrape/book.abc';

describe('syncSourcesStore', function() {
  beforeEach(function() {
    localStorage.clear();
    writeSyncSources([]);
  });

  test('isStaticTunebookNetUrl accepts tunebook.net scrape paths', function() {
    expect(isStaticTunebookNetUrl('https://tunebook.net/scrape/tunes.abc')).toBe(true);
    expect(isStaticTunebookNetUrl('/scrape/tunes.abc')).toBe(true);
    expect(isStaticTunebookNetUrl('scrape/tunes.abc')).toBe(true);
    expect(isStaticTunebookNetUrl('https://example.com/book.abc')).toBe(false);
  });

  test('isManagedSyncSource accepts only tunebook, google docs, and static tunebook.net urls', function() {
    expect(isManagedSyncSource({ kind: 'ownTunebook' })).toBe(true);
    expect(isManagedSyncSource({ kind: 'googleDoc', googleDocumentId: 'doc123' })).toBe(true);
    expect(isManagedSyncSource({ kind: 'url', url: STATIC_SOURCE_URL })).toBe(true);
    expect(isManagedSyncSource({ kind: 'url', url: 'https://example.com/book.abc' })).toBe(false);
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

  test('registerSourceFromImport rejects arbitrary external urls', function() {
    expect(registerSourceFromImport({ url: 'https://example.com/book.abc', tuneIds: ['a'] })).toBeNull();
    expect(listActiveSyncSources()).toHaveLength(0);
  });

  test('registerSourceFromImport merges tune ids into existing static source', function() {
    registerSourceFromImport({ url: STATIC_SOURCE_URL, tuneIds: ['a'] });
    const updated = registerSourceFromImport({ url: STATIC_SOURCE_URL, tuneIds: ['b'] });
    expect(updated.tuneIds).toEqual(['a', 'b']);
    expect(listActiveSyncSources()).toHaveLength(1);
  });

  test('pause and remove source', function() {
    const source = registerSourceFromImport({ url: STATIC_SOURCE_URL });
    setSourcePaused(source.id, true);
    expect(listActiveSyncSources()).toHaveLength(0);
    removeSyncSource(source.id);
    const stored = removeSyncSource(source.id);
    expect(stored.removed).toBe(true);
    expect(stored.paused).toBe(true);
  });

  test('backfillSourcesFromTunes creates sources only for static tunebook.net urls', function() {
    const created = backfillSourcesFromTunes({
      t1: { id: 't1', srcUrl: STATIC_SOURCE_URL },
      t2: { id: 't2', srcUrl: STATIC_SOURCE_URL },
      t3: { id: 't3', srcUrl: 'https://example.com/book.abc' },
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
      url: STATIC_SOURCE_URL,
      filters: { limitToBookName: 'Songs' },
      tuneIds: ['t1', 't2'],
    });
    const tunes = {
      t1: { id: 't1', books: ['Songs'], srcUrl: STATIC_SOURCE_URL },
      t2: { id: 't2', books: ['Other'], srcUrl: STATIC_SOURCE_URL },
    };
    expect(countTunesForSource(source, tunes)).toBe(1);
  });

  test('updateSyncSourceFilters persists changes', function() {
    const source = registerSourceFromImport({ url: STATIC_SOURCE_URL });
    updateSyncSourceFilters(source.id, { limitToTagName: 'session' });
    expect(formatSourceFilters(source.filters)).toEqual([]);
    const updated = updateSyncSourceFilters(source.id, { limitToTagName: 'session' });
    expect(updated.filters.limitToTagName).toBe('session');
    expect(formatSourceFilters(updated.filters)).toEqual(['tag: session']);
  });
});
