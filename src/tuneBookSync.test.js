import {
  parseDeletedTunesFromAbc,
  renderDeletedTunesToAbc,
  compareTuneBooks,
  mergeDeletedTuneMaps,
  createTombstone,
  tombstoneAllTunes,
} from './tuneBookSync'

describe('tuneBookSync', function() {
  test('parse and render tombstones round trip', function() {
    const tombs = {
      abc123: { id: 'abc123', deletedAt: 1000, name: 'Test Tune' },
      def456: { id: 'def456', deletedAt: 2000 },
    }
    const abc = renderDeletedTunesToAbc(tombs)
    const parsed = parseDeletedTunesFromAbc(abc)
    expect(parsed.abc123.deletedAt).toBe(1000)
    expect(parsed.abc123.name).toBe('Test Tune')
    expect(parsed.def456.deletedAt).toBe(2000)
  })

  test('remote delete removes local tune on merge', function() {
    const localTunes = {
      t1: { id: 't1', name: 'Local Tune', lastUpdated: 100 },
    }
    const remoteDeleted = {
      t1: { id: 't1', deletedAt: 500, name: 'Local Tune' },
    }
    const result = compareTuneBooks({
      localTunes,
      localDeleted: {},
      remoteTunes: {},
      remoteDeleted,
    })
    expect(Object.keys(result.deletes)).toEqual(['t1'])
    expect(Object.keys(result.localInserts)).toEqual([])
  })

  test('local-only tune is not treated as remote delete', function() {
    const localTunes = {
      t1: { id: 't1', name: 'Offline Tune', lastUpdated: 100 },
    }
    const result = compareTuneBooks({
      localTunes,
      localDeleted: {},
      remoteTunes: {},
      remoteDeleted: {},
    })
    expect(Object.keys(result.localInserts)).toEqual(['t1'])
    expect(Object.keys(result.deletes)).toEqual([])
  })

  test('local tombstone blocks remote insert', function() {
    const remoteTunes = {
      t1: { id: 't1', name: 'Remote Tune', lastUpdated: 100 },
    }
    const localDeleted = {
      t1: { id: 't1', deletedAt: 500, name: 'Remote Tune' },
    }
    const result = compareTuneBooks({
      localTunes: {},
      localDeleted,
      remoteTunes,
      remoteDeleted: {},
    })
    expect(Object.keys(result.inserts)).toEqual([])
  })

  test('newer remote tune restores over local tombstone', function() {
    const remoteTunes = {
      t1: { id: 't1', name: 'Restored', lastUpdated: 900 },
    }
    const localDeleted = {
      t1: { id: 't1', deletedAt: 500 },
    }
    const result = compareTuneBooks({
      localTunes: {},
      localDeleted,
      remoteTunes,
      remoteDeleted: {},
    })
    expect(Object.keys(result.inserts)).toEqual(['t1'])
  })

  test('mergeDeletedTuneMaps keeps newest tombstone', function() {
    const merged = mergeDeletedTuneMaps(
      { t1: { id: 't1', deletedAt: 100 } },
      { t1: { id: 't1', deletedAt: 300 } }
    )
    expect(merged.t1.deletedAt).toBe(300)
  })

  test('tombstoneAllTunes records every tune id', function() {
    const tombs = tombstoneAllTunes({
      a: { id: 'a', name: 'A' },
      b: { id: 'b', name: 'B' },
    }, 1234)
    expect(Object.keys(tombs)).toEqual(['a', 'b'])
    expect(tombs.a.deletedAt).toBe(1234)
  })

  test('createTombstone sets id and timestamp', function() {
    const tomb = createTombstone('x', 'Name', 42)
    expect(tomb).toEqual({ id: 'x', deletedAt: 42, name: 'Name' })
  })

  test('compareTuneBooks ignores newer remote timestamp when content matches', function() {
    const localTunes = {
      t1: {
        id: 't1',
        name: 'My Tune',
        lastUpdated: 100,
        meta: { X: 15 },
        links: [{ title: 'YouTube', link: 'https://youtu.be/abc12345678' }],
        voices: { '1': { notes: ['G2'] } },
      },
    }
    const remoteTunes = {
      t1: {
        id: 't1',
        name: 'My Tune',
        lastUpdated: 500,
        meta: { X: 16 },
        links: [{ title: 'YouTube', link: 'https://www.youtube.com/watch?v=abc12345678' }],
        voices: { '1': { notes: ['G2'] } },
      },
    }
    const result = compareTuneBooks({
      localTunes,
      localDeleted: {},
      remoteTunes,
      remoteDeleted: {},
    })
    expect(Object.keys(result.updates)).toEqual([])
    expect(Object.keys(result.localUpdates)).toEqual([])
  })

  test('own-upload echo with stale local lastUpdated is not an incoming update', function() {
    const localTunes = {
      t1: { id: 't1', name: 'Old Title', lastUpdated: 100, voices: { '1': { notes: ['C'] } } },
    }
    const remoteTunes = {
      t1: { id: 't1', name: 'New Title', lastUpdated: 500, voices: { '1': { notes: ['C'] } } },
    }
    const result = compareTuneBooks({
      localTunes,
      localDeleted: {},
      remoteTunes,
      remoteDeleted: {},
      lastUpdatedById: { t1: 500 },
    })
    expect(Object.keys(result.updates)).toEqual([])
    expect(Object.keys(result.inserts)).toEqual([])
    expect(Object.keys(result.deletes)).toEqual([])
  })

  test('own-upload echo does not insert a tune this browser already uploaded', function() {
    const result = compareTuneBooks({
      localTunes: {},
      localDeleted: {},
      remoteTunes: {
        t1: { id: 't1', name: 'Uploaded', lastUpdated: 500, voices: { '1': { notes: ['C'] } } },
      },
      remoteDeleted: {},
      lastUpdatedById: { t1: 500 },
    })
    expect(Object.keys(result.inserts)).toEqual([])
  })

  test('own-upload tombstone echo is not an incoming delete', function() {
    const result = compareTuneBooks({
      localTunes: {
        t1: { id: 't1', name: 'Still local', lastUpdated: 100 },
      },
      localDeleted: {},
      remoteTunes: {},
      remoteDeleted: {
        t1: { id: 't1', deletedAt: 500, name: 'Still local' },
      },
      lastDeletedAtById: { t1: 500 },
    })
    expect(Object.keys(result.deletes)).toEqual([])
  })

  test('newer other-device update still flags as incoming', function() {
    const localTunes = {
      t1: { id: 't1', name: 'Mine', lastUpdated: 500, voices: { '1': { notes: ['C'] } } },
    }
    const remoteTunes = {
      t1: { id: 't1', name: 'Theirs', lastUpdated: 900, voices: { '1': { notes: ['C'] } } },
    }
    const result = compareTuneBooks({
      localTunes,
      localDeleted: {},
      remoteTunes,
      remoteDeleted: {},
      lastUpdatedById: { t1: 500 },
    })
    expect(Object.keys(result.updates)).toEqual(['t1'])
  })
})
