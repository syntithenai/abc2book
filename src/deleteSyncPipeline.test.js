/* eslint-disable react-hooks/rules-of-hooks -- test helpers call pure hook factories */
import useAbcTools from './useAbcTools'
import { compareTuneBooks, createTombstone, parseDeletedTunesFromAbc } from './tuneBookSync'

// useAbcTools is a hook but only depends on useUtils() (pure functions), so it
// can be invoked directly in a node test to exercise the real ABC serializer.
const { tunesToAbc, abc2Tunebook } = useAbcTools()

function bookFromAbc(abc) {
  const tunes = {}
  abc2Tunebook(abc).forEach(function(tune) {
    if (tune && tune.id) tunes[tune.id] = tune
  })
  return tunes
}

const TUNE_ABC = [
  'X: 1',
  'T: Test Tune',
  '% abcbook-tune_id tune-1',
  '% abcbook-lastupdated 1000',
  'K: D',
  'abcd|',
].join('\n')

const OTHER_TUNE_ABC = [
  'X: 2',
  'T: Keeper',
  '% abcbook-tune_id tune-2',
  '% abcbook-lastupdated 1000',
  'K: G',
  'gfed|',
].join('\n')

describe('delete sync pipeline (real ABC serialization)', function() {
  test('remote delete is detected through a full serialize/parse round trip', function() {
    // device A starts with one tune, then deletes it and uploads a tombstone
    const localBook = bookFromAbc(TUNE_ABC)
    expect(Object.keys(localBook)).toEqual(['tune-1'])

    const tombstone = createTombstone('tune-1', 'Test Tune', 5000)
    const remoteAbc = tunesToAbc({}, { 'tune-1': tombstone })

    // device B parses what A uploaded
    const remoteTunes = bookFromAbc(remoteAbc)
    const remoteDeleted = parseDeletedTunesFromAbc(remoteAbc)

    expect(remoteTunes).toEqual({})
    expect(remoteDeleted['tune-1']).toBeTruthy()
    expect(remoteDeleted['tune-1'].deletedAt).toBe(5000)

    const changes = compareTuneBooks({
      localTunes: localBook,
      localDeleted: {},
      remoteTunes: remoteTunes,
      remoteDeleted: remoteDeleted,
    })

    expect(Object.keys(changes.deletes)).toEqual(['tune-1'])
    expect(Object.keys(changes.localInserts)).toEqual([])
    expect(Object.keys(changes.inserts)).toEqual([])
  })

  test('tombstones appended after surviving tunes do not corrupt active tunes', function() {
    const localBook = bookFromAbc(TUNE_ABC + '\n' + OTHER_TUNE_ABC)

    const tombstone = createTombstone('tune-1', 'Test Tune', 5000)
    const survivor = bookFromAbc(OTHER_TUNE_ABC)
    const remoteAbc = tunesToAbc(survivor, { 'tune-1': tombstone })

    const remoteTunes = bookFromAbc(remoteAbc)
    const remoteDeleted = parseDeletedTunesFromAbc(remoteAbc)

    expect(Object.keys(remoteTunes)).toEqual(['tune-2'])
    expect(remoteDeleted['tune-1']).toBeTruthy()

    const changes = compareTuneBooks({
      localTunes: localBook,
      localDeleted: {},
      remoteTunes: remoteTunes,
      remoteDeleted: remoteDeleted,
    })

    expect(Object.keys(changes.deletes)).toEqual(['tune-1'])
    expect(Object.keys(changes.inserts)).toEqual([])
    expect(Object.keys(changes.updates)).toEqual([])
  })
})
