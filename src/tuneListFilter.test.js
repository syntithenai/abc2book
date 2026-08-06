import {
  dedupeTunesById,
  filterTunes,
  sortTunesByName,
  filterSearchNoBooks,
  buildTagCollation,
  buildTuneStatusEntry,
  pruneSelectionForStatus,
  runTuneListFilterSync,
  buildListHashKey,
} from './tuneListFilter'

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

  test('pruneSelectionForStatus clears selections outside status map', function() {
    const result = pruneSelectionForStatus({ a: true, b: true }, { a: { hasNotes: true } })
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
