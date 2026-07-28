import {
  buildSyncManifest,
  parseSyncManifest,
  buildShardedTuneAbc,
  iterateShardedTunesFromAbc,
  MANIFEST_PREFIX,
  MANIFEST_END,
} from './tuneShardSync'

function fakeTunesToAbc(tunes) {
  return Object.keys(tunes).map(function(id) {
    return 'X:1\nT:' + tunes[id].name + '\nK:C\n|:CDEF|]\n% tune-id ' + id
  }).join('\n')
}

function fakeAbc2json(abc) {
  const idMatch = abc.match(/% tune-id (\S+)/)
  const titleMatch = abc.match(/T:(.+)/)
  return {
    id: idMatch ? idMatch[1] : 'unknown',
    name: titleMatch ? titleMatch[1].trim() : 'Tune',
    lastUpdated: 1,
    voices: { V: { notes: ['CDEF|'] } },
  }
}

describe('tuneShardSync', function() {
  test('manifest round trip', function() {
    const manifest = buildSyncManifest([
      { name: 'tunebook-tunes-000.abc', tuneCount: 2, hash: 'abc' },
    ])
    expect(manifest.indexOf(MANIFEST_PREFIX)).toBe(0)
    expect(manifest.indexOf(MANIFEST_END)).toBeGreaterThan(0)
    const parsed = parseSyncManifest(manifest)
    expect(parsed.version).toBe(2)
    expect(parsed.shardCount).toBe(1)
  })

  test('sharded abc embeds and parses tunes', function() {
    const tunes = {
      a: { id: 'a', name: 'Alpha' },
      b: { id: 'b', name: 'Beta' },
    }
    const abc = buildShardedTuneAbc(tunes, fakeTunesToAbc, {})
    const collected = []
    const ok = iterateShardedTunesFromAbc(abc, fakeAbc2json, function(tune) {
      collected.push(tune.id)
    })
    expect(ok).toBe(true)
    expect(collected.sort()).toEqual(['a', 'b'])
  })
})
