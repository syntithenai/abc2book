import { compareTuneBooksStreaming } from './tuneBookSyncStreaming'

function makeTune(id, lastUpdated) {
  return {
    id: id,
    name: 'Tune ' + id,
    lastUpdated: lastUpdated,
    voices: { V: { notes: ['CDEF|'] } },
  }
}

describe('tuneBookSyncStreaming', function() {
  test('inserts remote tunes not present locally', async function() {
    const result = await compareTuneBooksStreaming({
      localTunes: {},
      localDeleted: {},
      remoteDeleted: {},
      remoteTuneIterator: async function(onTune) {
        onTune(makeTune('a', 100))
        onTune(makeTune('b', 200))
      },
    })
    expect(Object.keys(result.inserts)).toEqual(['a', 'b'])
  })

  test('detects local-only tunes', async function() {
    const result = await compareTuneBooksStreaming({
      localTunes: { x: makeTune('x', 100) },
      localDeleted: {},
      remoteDeleted: {},
      remoteTuneIterator: async function() {},
    })
    expect(Object.keys(result.localInserts)).toEqual(['x'])
  })

  test('applies remote tombstone over older local tune', async function() {
    const result = await compareTuneBooksStreaming({
      localTunes: { t1: makeTune('t1', 100) },
      localDeleted: {},
      remoteDeleted: { t1: { id: 't1', deletedAt: 500, name: 'Gone' } },
      remoteTuneIterator: async function() {},
    })
    expect(Object.keys(result.deletes)).toEqual(['t1'])
  })
})
