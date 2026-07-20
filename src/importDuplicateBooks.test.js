import {
  importHashIds,
  mergeIncomingBooksOntoTune,
  applyDuplicateBookMerges,
} from './importDuplicateBooks'

describe('importDuplicateBooks', function() {
  function uniquify(arr) {
    const seen = {}
    const out = []
    ;(arr || []).forEach(function(item) {
      const key = String(item || '').trim().toLowerCase()
      if (!key || seen[key]) return
      seen[key] = true
      out.push(String(item).trim())
    })
    return out
  }

  test('importHashIds normalizes string or array entries', function() {
    expect(importHashIds({ a: 'id1' }, 'a')).toEqual(['id1'])
    expect(importHashIds({ a: ['id1', 'id2'] }, 'a')).toEqual(['id1', 'id2'])
    expect(importHashIds({ a: 'id1' }, 'missing')).toEqual([])
  })

  test('mergeIncomingBooksOntoTune adds only missing books', function() {
    const existing = { id: 't1', books: ['spukes'] }
    const first = mergeIncomingBooksOntoTune(
      existing,
      { books: ['spukes', 'lewe / olga'] },
      null,
      uniquify
    )
    expect(first.changed).toBe(true)
    expect(first.added).toEqual(['lewe / olga'])
    expect(existing.books).toEqual(['spukes', 'lewe / olga'])

    const second = mergeIncomingBooksOntoTune(
      existing,
      { books: ['SPUKES'] },
      null,
      uniquify
    )
    expect(second.changed).toBe(false)
    expect(second.added).toEqual([])
  })

  test('mergeIncomingBooksOntoTune accepts forceBook', function() {
    const existing = { id: 't1', books: [] }
    const result = mergeIncomingBooksOntoTune(
      existing,
      { books: [] },
      'lewe / george',
      uniquify
    )
    expect(result.changed).toBe(true)
    expect(existing.books).toEqual(['lewe / george'])
  })

  test('applyDuplicateBookMerges updates matching locals by import hash', function() {
    const existing = {
      id: 'local-1',
      books: ['spukes'],
      name: 'Girl',
      words: ['[Am]Who'],
      voices: { '1': { notes: ['|: z8 |]'] } },
    }
    const tunes = { 'local-1': existing }
    const incoming = {
      name: 'Girl',
      books: ['lewe / olga'],
      words: ['[Am]Who'],
      voices: { '1': { notes: ['|: z8 |]'] } },
    }
    const getHash = function(tune) {
      return (tune.name || '') + '|' + (Array.isArray(tune.words) ? tune.words.join('\n') : '')
    }
    const hash = getHash(incoming)
    const result = applyDuplicateBookMerges({
      tunes: tunes,
      duplicates: [incoming],
      importhashes: { [hash]: ['local-1'] },
      getTuneImportHash: getHash,
      uniquifyArray: uniquify,
      now: 12345,
    })
    expect(result.mergedTuneIds).toEqual(['local-1'])
    expect(result.addedBookCount).toBe(1)
    expect(existing.books).toEqual(['spukes', 'lewe / olga'])
    expect(existing.lastUpdated).toBe(12345)
  })

  test('mergeIncomingBooksOntoTune unions tags as well as books', function() {
    const existing = { id: 't1', books: ['session'], tags: ['old'] }
    const result = mergeIncomingBooksOntoTune(
      existing,
      { books: ['songs'], tags: ['chordpro', 'OLD'] },
      null,
      uniquify
    )
    expect(result.changed).toBe(true)
    expect(existing.books).toEqual(['session', 'songs'])
    expect(existing.tags).toEqual(['old', 'chordpro'])
    expect(result.addedTags).toEqual(['chordpro'])
  })
})
