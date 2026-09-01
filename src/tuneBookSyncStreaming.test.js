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

  test('own-upload echo with stale local lastUpdated is not an incoming update', async function() {
    const result = await compareTuneBooksStreaming({
      localTunes: { t1: makeTune('t1', 100) },
      localDeleted: {},
      remoteDeleted: {},
      lastUpdatedById: { t1: 500 },
      remoteTuneIterator: async function(onTune) {
        onTune(Object.assign(makeTune('t1', 500), { name: 'Renamed' }))
      },
    })
    expect(Object.keys(result.updates)).toEqual([])
    expect(Object.keys(result.inserts)).toEqual([])
  })

  test('mass wipe recovery re-offers own-upload echoes as inserts', async function() {
    const lastUpdatedById = {}
    const result = await compareTuneBooksStreaming({
      localTunes: {},
      localDeleted: {},
      remoteDeleted: {},
      lastUpdatedById: lastUpdatedById,
      recoverFromWipe: true,
      remoteTuneIterator: async function(onTune) {
        for (let i = 0; i < 60; i += 1) {
          const id = 't' + i
          lastUpdatedById[id] = 500
          onTune(makeTune(id, 500))
        }
      },
    })
    expect(Object.keys(result.inserts).length).toBe(60)
  })
})
