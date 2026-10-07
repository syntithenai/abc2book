import {
  shouldAcceptIndexPersist,
  countBookedTunes,
  countMissingBookIndexMemberships,
  bookIndexNeedsRepair,
  countMissingTagIndexMemberships,
  tagIndexNeedsRepair,
  unionIndexKeysWithTuneField,
} from './tuneIndexIntegrity'

function makeTune(id, books) {
  return { id: id, name: 'Tune ' + id, books: books || [] }
}

describe('tuneIndexIntegrity', function() {
  test('shouldAcceptIndexPersist blocks during reindex', function() {
    expect(shouldAcceptIndexPersist({
      reindexInProgress: true,
      writeGeneration: 1,
      currentGeneration: 1,
    })).toBe(false)
  })

  test('shouldAcceptIndexPersist blocks stale generation', function() {
    expect(shouldAcceptIndexPersist({
      reindexInProgress: false,
      writeGeneration: 1,
      currentGeneration: 2,
    })).toBe(false)
  })

  test('shouldAcceptIndexPersist allows matching generation', function() {
    expect(shouldAcceptIndexPersist({
      reindexInProgress: false,
      writeGeneration: 3,
      currentGeneration: 3,
    })).toBe(true)
  })

  test('countBookedTunes and missing memberships', function() {
    const tunes = {
      a: makeTune('a', ['Folk']),
      b: makeTune('b', ['Folk', 'Jazz']),
      c: makeTune('c', []),
      d: makeTune('d', ['MissingBook']),
    }
    expect(countBookedTunes(tunes)).toBe(3)
    expect(countMissingBookIndexMemberships(tunes, {
      Folk: ['a', 'b'],
      Jazz: ['b'],
    })).toBe(1)
  })

  test('bookIndexNeedsRepair detects empty index', function() {
    expect(bookIndexNeedsRepair({
      a: makeTune('a', ['songs']),
    }, {})).toBe(true)
    expect(bookIndexNeedsRepair({
      a: makeTune('a', ['songs']),
    }, { songs: ['a'] })).toBe(false)
    expect(bookIndexNeedsRepair({
      a: makeTune('a'),
    }, {})).toBe(false)
  })

  test('bookIndexNeedsRepair detects partial skew', function() {
    const tunes = {}
    const bookIndex = { Folk: [] }
    for (let i = 0; i < 100; i += 1) {
      const id = 't' + i
      tunes[id] = makeTune(id, ['Folk'])
      if (i < 20) bookIndex.Folk.push(id)
    }
    // 80 of 100 booked tunes missing from index → mass skew
    expect(bookIndexNeedsRepair(tunes, bookIndex)).toBe(true)
  })

  test('bookIndexNeedsRepair allows small skew', function() {
    const tunes = {}
    const bookIndex = { Folk: [] }
    for (let i = 0; i < 100; i += 1) {
      const id = 't' + i
      tunes[id] = makeTune(id, ['Folk'])
      if (i < 95) bookIndex.Folk.push(id)
    }
    expect(bookIndexNeedsRepair(tunes, bookIndex)).toBe(false)
  })

  test('unionIndexKeysWithTuneField merges index and tune fields', function() {
    const opts = unionIndexKeysWithTuneField(
      { IndexedOnly: 'IndexedOnly' },
      {
        a: makeTune('a', ['FromTune', 'IndexedOnly']),
        b: makeTune('b', ['Other']),
      },
      'books'
    )
    expect(opts.IndexedOnly).toBe('IndexedOnly')
    expect(opts.FromTune).toBe('FromTune')
    expect(opts.Other).toBe('Other')
  })

  test('tagIndexNeedsRepair flags tagged tunes missing from their tag bucket', function() {
    const tunes = {
      a: { id: 'a', tags: ['andrew kordas'] },
      b: { id: 'b', tags: ['andrew kordas', 'jig'] },
      c: { id: 'c', tags: [] },
    }
    expect(countMissingTagIndexMemberships(tunes, { 'andrew kordas': ['a', 'b'], jig: ['b'] })).toBe(0)
    expect(tagIndexNeedsRepair(tunes, { 'andrew kordas': ['a', 'b'], jig: ['b'] })).toBe(false)
    expect(countMissingTagIndexMemberships(tunes, { 'andrew kordas': ['a'], jig: ['b'] })).toBe(1)
    expect(tagIndexNeedsRepair(tunes, { 'andrew kordas': ['a'] })).toBe(true)
    expect(tagIndexNeedsRepair({}, {})).toBe(false)
  })
})
