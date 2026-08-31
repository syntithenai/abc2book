import {
  dedupeTunesById,
  filterTunes,
  sortTunesByName,
  filterSearchNoBooks,
  buildTagCollation,
  buildTuneStatusEntry,
  buildTuneStatusGroupKey,
  buildGroupedTunes,
  pruneSelectionForStatus,
  runTuneListFilterSync,
  fillMissingTuneStatusEntries,
  buildListHashKey,
  shouldSkipListRebuildForTuneEdit,
  GROUP_BY_TUNE_STATUS,
  GROUP_BY_TUNE_STATUS_DETAILED,
  GROUP_BY_PAGE,
  GROUP_BY_NONE,
  resolveEffectiveGroupBy,
  shouldScanTuneStatusExtras,
  shouldScanTuneMusicalStatus,
} from './tuneListFilter'
import { LIST_PROTECTION_LIMIT } from './tuneScaleConstants'

function makeTune(id, name, extra) {
  return Object.assign({
    id: id,
    name: name,
    voices: { V: { notes: ['CDEF|'] } },
    books: [],
    tags: [],
  }, extra || {})
}

describe('tuneListFilter', function() {
  test('dedupeTunesById merges numeric and string ids', function() {
    const first = makeTune(42, 'Same Tune', { composer: 'Old Artist' })
    const second = makeTune('42', 'Same Tune', { composer: 'New Artist' })
    const deduped = dedupeTunesById([first, second])
    expect(deduped).toHaveLength(1)
    expect(deduped[0].composer).toBe('New Artist')
  })

  test('filterTunes keeps only one entry per tune id', function() {
    const shared = makeTune('same-id', 'After the Battle of Aughrim')
    const tunes = {
      key1: shared,
      key2: Object.assign({}, shared, { books: ['other book'] }),
    }
    const filtered = filterTunes(tunes, function() { return true })
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('same-id')
  })

  test('filterTunes and sortTunesByName handle large synthetic sets', function() {
    const tunes = {}
    for (let i = 0; i < 2000; i += 1) {
      const tune = makeTune('t' + i, 'Tune ' + String(2000 - i).padStart(4, '0'))
      tunes[tune.id] = tune
    }
    const filtered = sortTunesByName(filterTunes(tunes, function() { return true }))
    expect(filtered.length).toBe(2000)
    expect(filtered[0].name).toBe('Tune 0001')
    expect(filtered[filtered.length - 1].name).toBe('Tune 2000')
  })

  test('filterSearchNoBooks excludes tagged tunes', function() {
    const tune = makeTune('a', 'A', { tags: ['session'] })
    expect(filterSearchNoBooks(tune)).toBe(false)
    expect(filterSearchNoBooks(makeTune('b', 'B'))).toBe(true)
  })

  test('buildTagCollation collects tags from filtered list', function() {
    const tags = buildTagCollation([
      makeTune('a', 'A', { tags: ['irish', 'reel'] }),
      makeTune('b', 'B', { tags: ['irish'] }),
    ])
    expect(tags.irish).toBe(true)
    expect(tags.reel).toBe(true)
  })

  test('buildTuneStatusEntry detects notes', function() {
    const tunebook = {
      hasLyrics: function() { return false },
      hasLinks: function() { return false },
    }
    const status = buildTuneStatusEntry(makeTune('a', 'A'), tunebook)
    expect(status.hasNotes).toBe(true)
  })

  test('buildTuneStatusEntry ignores rest and bar scaffolds without letter notes', function() {
    const tunebook = {
      hasLyrics: function() { return false },
      hasLinks: function() { return false },
    }
    const restOnly = buildTuneStatusEntry(
      makeTune('a', 'A', { voices: { V: { notes: ['z z z z |', '| | |'] } } }),
      tunebook
    )
    expect(restOnly.hasNotes).toBe(false)
    expect(restOnly.hasChords).toBe(false)

    const chordRest = buildTuneStatusEntry(
      makeTune('b', 'B', { voices: { V: { notes: ['| "D" z2 "G" z "A" z |'] } } }),
      tunebook
    )
    expect(chordRest.hasNotes).toBe(false)
    expect(chordRest.hasChords).toBe(true)
  })

  test('buildTuneStatusEntry detects snapshot from tuneFiles', function() {
    const tunebook = {
      hasLyrics: function() { return false },
      hasLinks: function() { return false },
    }
    const without = buildTuneStatusEntry(makeTune('a', 'A'), tunebook)
    expect(without.hasSnapshot).toBe(false)
    const withFile = buildTuneStatusEntry(
      makeTune('b', 'B', { tuneFiles: [{ id: 'f1', name: 'crop.png', type: 'image/png' }] }),
      tunebook
    )
    expect(withFile.hasSnapshot).toBe(true)
  })

  test('buildTuneStatusEntry handles nested link objects via hasLinks', function() {
    const tunebook = {
      hasLyrics: function() { return false },
      hasLinks: function(tune) {
        const first = tune && Array.isArray(tune.links) && tune.links.length > 0 ? tune.links[0] : null
        if (!first) return false
        const link = first.link
        const uri = typeof link === 'string'
          ? link
          : (link && link.link != null ? String(link.link) : '')
        return uri.trim().length > 0
      },
    }
    const tune = makeTune('a', 'A', {
      links: [{ link: { link: 'abcbook-recording:rec1', recordingId: 'rec1' }, title: 'Rec' }],
    })
    const status = buildTuneStatusEntry(tune, tunebook)
    expect(status.hasLinks).toBe(true)
  })

  test('pruneSelectionForStatus clears selections outside filtered list', function() {
    const filtered = [makeTune('a', 'Alpha')]
    const result = pruneSelectionForStatus({ a: true, b: true }, filtered)
    expect(result.selected.a).toBe(true)
    expect(result.selected.b).toBe(false)
    expect(result.selectedCount).toBe(1)
  })

  test('runTuneListFilterSync groups by tunebook helper', function() {
    const tunes = {
      a: makeTune('a', 'Alpha', { books: ['Book'] }),
      b: makeTune('b', 'Beta'),
    }
    const result = runTuneListFilterSync({
      tunes: tunes,
      filterSearchFn: function(tune) { return tune.id === 'a' },
      groupBy: 'books',
      tunebook: {
        groupTunes: function(list, key) {
          expect(key).toBe('books')
          return { Book: [0] }
        },
        hasLyrics: function() { return false },
        hasLinks: function() { return false },
      },
    })
    expect(result.filtered.length).toBe(1)
    expect(result.grouped.Book).toEqual([0])
  })

  test('filterTunes uses candidate ids when provided', function() {
    const tunes = {
      a: makeTune('a', 'Alpha'),
      b: makeTune('b', 'Beta'),
    }
    const filtered = filterTunes(tunes, function() { return true }, ['b'])
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('b')
  })

  test('buildListHashKey includes content revision', function() {
    const a = buildListHashKey(['', '', '', [], [], [], 10, 0])
    const b = buildListHashKey(['', '', '', [], [], [], 10, 3])
    expect(a).not.toBe(b)
  })

  test('shouldSkipListRebuildForTuneEdit skips in-place edits unless starred filter is on', function() {
    const identity = buildListHashKey(['book', '', true])
    expect(shouldSkipListRebuildForTuneEdit(null, identity, false)).toBe(false)
    expect(shouldSkipListRebuildForTuneEdit(identity, identity, false)).toBe(true)
    expect(shouldSkipListRebuildForTuneEdit(identity, identity, true)).toBe(false)
    expect(shouldSkipListRebuildForTuneEdit(identity, buildListHashKey(['other', '', true]), false)).toBe(false)
  })

  test('buildTuneStatusEntry skips inline chords unless extras are requested', function() {
    const tunebook = {
      hasLyrics: function() { return true },
      hasLinks: function() { return false },
    }
    const tune = makeTune('a', 'A', { words: ['[G]Amazing grace'] })
    const simple = buildTuneStatusEntry(tune, tunebook)
    expect(simple.hasInlineChords).toBe(false)
    const detailed = buildTuneStatusEntry(tune, tunebook, { includeExtras: true, includeMusical: false })
    expect(detailed.hasInlineChords).toBe(true)
    expect(detailed.hasChords).toBe(false)
  })

  test('buildTuneStatusEntry detects COW chord lines as inline chords', function() {
    const tunebook = {
      hasLyrics: function() { return true },
      hasLinks: function() { return false },
    }
    const tune = makeTune('a', 'A', { words: ['G    C    D', 'Amazing grace how sweet'] })
    const status = buildTuneStatusEntry(tune, tunebook, { includeExtras: true, includeMusical: false })
    expect(status.hasInlineChords).toBe(true)
  })

  test('buildTuneStatusEntry keeps ABC quoted chords separate from inline lyrics', function() {
    const tunebook = {
      hasLyrics: function() { return false },
      hasLinks: function() { return false },
    }
    const tune = makeTune('a', 'A', { voices: { V: { notes: ['"Am"CDEF|'] } } })
    const status = buildTuneStatusEntry(tune, tunebook, { includeExtras: true, includeMusical: false })
    expect(status.hasChords).toBe(true)
    expect(status.hasInlineChords).toBe(false)
  })

  test('buildTuneStatusGroupKey omits extras unless detailed', function() {
    const status = {
      hasLyrics: true,
      hasNotes: true,
      hasChords: true,
      hasInlineChords: true,
      hasLinks: true,
      hasSnapshot: true,
      hasMusicalErrors: true,
      hasMusicalWarnings: true,
    }
    expect(buildTuneStatusGroupKey(status, false)).toBe('lyrics,notes,chords,media,snapshot')
    expect(buildTuneStatusGroupKey(status, true)).toBe('lyrics,notes,chords,inline,media,snapshot,errors')
  })

  test('buildTuneStatusGroupKey prefers errors over warnings', function() {
    expect(buildTuneStatusGroupKey({
      hasNotes: true,
      hasMusicalErrors: true,
      hasMusicalWarnings: true,
    }, true)).toBe('notes,errors')
    expect(buildTuneStatusGroupKey({
      hasNotes: true,
      hasMusicalWarnings: true,
    }, true)).toBe('notes,warnings')
  })

  test('buildTuneStatusGroupKey includes snapshot for both simple and detailed', function() {
    expect(buildTuneStatusGroupKey({ hasSnapshot: true }, false)).toBe('snapshot')
    expect(buildTuneStatusGroupKey({ hasNotes: true, hasSnapshot: true }, true)).toBe('notes,snapshot')
  })

  test('buildGroupedTunes uses simple vs detailed tune-status keys', function() {
    const tunes = [
      makeTune('a', 'A', { words: ['[G]Hello'] }),
    ]
    const tunebook = {
      hasLyrics: function() { return true },
      hasLinks: function() { return false },
    }
    const status = {}
    status.a = buildTuneStatusEntry(tunes[0], tunebook, { includeExtras: true, includeMusical: false })
    const simple = buildGroupedTunes(tunes, GROUP_BY_TUNE_STATUS, tunebook, status)
    const detailed = buildGroupedTunes(tunes, GROUP_BY_TUNE_STATUS_DETAILED, tunebook, status)
    expect(Object.keys(simple)).toEqual(['lyrics,notes'])
    expect(Object.keys(detailed)).toEqual(['lyrics,notes,inline'])
  })

  test('shouldScanTuneStatusExtras follows group-by and list display mode', function() {
    expect(shouldScanTuneStatusExtras({ listDisplayMode: 'compact' })).toBe(false)
    expect(shouldScanTuneStatusExtras({ listDisplayMode: 'detailed' })).toBe(true)
    expect(shouldScanTuneStatusExtras({ listDisplayMode: 'preview' })).toBe(true)
    expect(shouldScanTuneStatusExtras({ groupBy: GROUP_BY_TUNE_STATUS_DETAILED })).toBe(true)
    expect(shouldScanTuneStatusExtras({ includeExtras: false, listDisplayMode: 'detailed' })).toBe(false)
  })

  test('shouldScanTuneMusicalStatus caps at the list protection limit', function() {
    expect(shouldScanTuneMusicalStatus({ listDisplayMode: 'detailed' }, 10)).toBe(true)
    expect(shouldScanTuneMusicalStatus({ listDisplayMode: 'detailed' }, LIST_PROTECTION_LIMIT)).toBe(false)
    expect(shouldScanTuneMusicalStatus({ listDisplayMode: 'compact' }, 10)).toBe(false)
  })

  test('runTuneListFilterSync groups by detailed tune status', function() {
    const tunes = {
      a: makeTune('a', 'Alpha', { words: ['[C]Lyric'] }),
    }
    const result = runTuneListFilterSync({
      tunes: tunes,
      filterSearchFn: function() { return true },
      groupBy: GROUP_BY_TUNE_STATUS_DETAILED,
      tunebook: {
        hasLyrics: function() { return true },
        hasLinks: function() { return false },
      },
    })
    expect(result.tuneStatus.a.hasInlineChords).toBe(true)
    expect(result.grouped['lyrics,notes,inline']).toEqual([0])
  })

  test('fillMissingTuneStatusEntries upgrades simple entries with extras', async function() {
    const tunebook = {
      hasLyrics: function() { return true },
      hasLinks: function() { return false },
    }
    const tune = makeTune('a', 'A', { words: ['[G]Hello'] })
    const prev = {}
    prev.a = buildTuneStatusEntry(tune, tunebook)
    expect(prev.a.hasInlineChords).toBe(false)
    const next = await fillMissingTuneStatusEntries([tune], prev, tunebook, {
      includeExtras: true,
      includeMusical: false,
    })
    expect(next.a.hasInlineChords).toBe(true)
    expect(next.a.extrasScanned).toBe(true)
  })

  test('resolveEffectiveGroupBy applies page grouping for active book filters', function() {
    expect(resolveEffectiveGroupBy('', 'nff book 2009')).toBe(GROUP_BY_PAGE)
    expect(resolveEffectiveGroupBy(GROUP_BY_PAGE, 'nff book 2009')).toBe(GROUP_BY_PAGE)
    expect(resolveEffectiveGroupBy(GROUP_BY_NONE, 'nff book 2009')).toBe('')
    expect(resolveEffectiveGroupBy('tags', 'nff book 2009')).toBe('tags')
    expect(resolveEffectiveGroupBy('', '')).toBe('')
  })

  test('resolveEffectiveGroupBy applies page grouping for a single tag filter', function() {
    expect(resolveEffectiveGroupBy('', '', ['kameruka bush dance'])).toBe(GROUP_BY_PAGE)
    expect(resolveEffectiveGroupBy('', '', ['a', 'b'])).toBe('')
    expect(resolveEffectiveGroupBy(GROUP_BY_NONE, '', ['kameruka bush dance'])).toBe('')
    expect(resolveEffectiveGroupBy('', 'celtic', ['kameruka bush dance'])).toBe(GROUP_BY_PAGE)
  })

  test('runTuneListFilterSync auto-sorts by book page when a book filter is active', function() {
    const tunes = {
      a: makeTune('a', 'Alpha', {
        books: ['nff book 2009'],
        bookPages: { 'nff book 2009': { page: 1, tuneIndex: 2 } },
      }),
      b: makeTune('b', 'Beta', {
        books: ['nff book 2009'],
        bookPages: { 'nff book 2009': { page: 1, tuneIndex: 1 } },
      }),
    }
    const result = runTuneListFilterSync({
      tunes: tunes,
      filterSearchFn: function() { return true },
      groupBy: '',
      tunebook: {
        groupTunes: function(list, key) {
          if (key === GROUP_BY_PAGE) {
            return { 1: [0, 1] }
          }
          return {}
        },
        hasLyrics: function() { return false },
        hasLinks: function() { return false },
      },
      filterContext: { currentTuneBook: 'nff book 2009' },
    })
    expect(result.filtered.map(function(t) { return t.id })).toEqual(['b', 'a'])
    expect(result.grouped[1]).toEqual([0, 1])
  })
})

describe('runTuneListFilterAsync catalog search', function() {
  const tuneStorageFlags = require('./tuneStorageFlags')
  const tuneRepository = require('./tuneRepository')

  beforeEach(function() {
    jest.spyOn(tuneStorageFlags, 'isCatalogStorageEnabled').mockReturnValue(true)
    jest.spyOn(tuneRepository, 'listCatalogPage').mockResolvedValue({ ids: [], rows: [] })
    jest.spyOn(tuneRepository, 'getTune').mockResolvedValue(null)
  })

  afterEach(function() {
    jest.restoreAllMocks()
  })

  test('uses hydrated monolith for text search when catalog rows are stale', async function() {
    const { runTuneListFilterAsync } = require('./tuneListFilter')
    const tunes = {
      abc: makeTune('abc', 'Ideas Run Free'),
    }
    const result = await runTuneListFilterAsync({
      tunes: tunes,
      filterSearchFn: function(tune) {
        return tune && tune.name && tune.name.toLowerCase().indexOf('free') !== -1
      },
      groupBy: null,
      tunebook: {
        hasLyrics: function() { return false },
        hasLinks: function() { return false },
      },
      filterContext: { filter: 'free', textFilter: 'free' },
    })
    expect(result.filtered).toHaveLength(1)
    expect(result.filtered[0].name).toBe('Ideas Run Free')
    expect(tuneRepository.listCatalogPage).not.toHaveBeenCalled()
  })
})
