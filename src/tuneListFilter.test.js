import {
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

  test('buildListHashKey includes content revision', function() {
    const a = buildListHashKey(['', '', '', [], [], [], 10, 0])
    const b = buildListHashKey(['', '', '', [], [], [], 10, 3])
    expect(a).not.toBe(b)
  })
})
