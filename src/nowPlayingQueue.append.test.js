import {
  createQueue,
  appendTuneToQueue,
  insertTuneAfterCurrentInQueue,
  appendTunesToQueue,
  insertTunesAfterCurrentInQueue,
  isQueueActive,
} from './nowPlayingQueue'

describe('nowPlayingQueue append helpers', function() {
  test('appendTuneToQueue creates a queue when empty', function() {
    const queue = appendTuneToQueue(null, 'a')
    expect(isQueueActive(queue)).toBe(true)
    expect(queue.items.length).toBe(1)
    expect(queue.items[0].tuneId).toBe('a')
  })

  test('appendTuneToQueue adds to existing queue', function() {
    const base = createQueue({ tuneIds: ['a'] })
    const queue = appendTuneToQueue(base, 'b')
    expect(queue.items.length).toBe(2)
    expect(queue.items[1].tuneId).toBe('b')
  })

  test('insertTuneAfterCurrentInQueue inserts after current index', function() {
    const base = createQueue({ tuneIds: ['a', 'c'], currentIndex: 0 })
    const queue = insertTuneAfterCurrentInQueue(base, 'b')
    expect(queue.items.map(function(item) { return item.tuneId })).toEqual(['a', 'b', 'c'])
  })

  test('appendTunesToQueue appends multiple tunes', function() {
    const base = createQueue({ tuneIds: ['a'] })
    const queue = appendTunesToQueue(base, ['b', 'c'])
    expect(queue.items.map(function(item) { return item.tuneId })).toEqual(['a', 'b', 'c'])
  })

  test('insertTunesAfterCurrentInQueue inserts multiple tunes in order', function() {
    const base = createQueue({ tuneIds: ['a', 'd'], currentIndex: 0 })
    const queue = insertTunesAfterCurrentInQueue(base, ['b', 'c'])
    expect(queue.items.map(function(item) { return item.tuneId })).toEqual(['a', 'b', 'c', 'd'])
  })
})
