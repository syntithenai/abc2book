/**
 * Sharded ABC sync: manifest + tune chunks for large libraries.
 */
import { SYNC_SHARD_SIZE } from './tuneScaleConstants'

export const SYNC_PROTOCOL_VERSION = 2
export const MANIFEST_PREFIX = '% abcbook-sync-manifest-begin'
export const MANIFEST_END = '% abcbook-sync-manifest-end'
export const SHARD_PREFIX = '% abcbook-tunes-shard '

export function buildSyncManifest(shards) {
  const payload = {
    version: SYNC_PROTOCOL_VERSION,
    shardCount: shards.length,
    shards: shards.map(function(s) {
      return { name: s.name, tuneCount: s.tuneCount, hash: s.hash || '' }
    }),
    builtAt: new Date().toISOString(),
  }
  return MANIFEST_PREFIX + '\n' + JSON.stringify(payload) + '\n' + MANIFEST_END
}

export function parseSyncManifest(abcText) {
  if (!abcText || abcText.indexOf(MANIFEST_PREFIX) < 0) return null
  const start = abcText.indexOf(MANIFEST_PREFIX) + MANIFEST_PREFIX.length
  const end = abcText.indexOf(MANIFEST_END, start)
  if (end < 0) return null
  try {
    return JSON.parse(abcText.slice(start, end).trim())
  } catch (e) {
    return null
  }
}

/**
 * Split tunes object into shard ABC strings (~SYNC_SHARD_SIZE tunes each).
 * tunesToAbcFn: (tunesMap) => abc string
 */
export function buildTuneShards(tunes, tunesToAbcFn) {
  const ids = Object.keys(tunes || {})
  const shards = []
  for (let i = 0; i < ids.length; i += SYNC_SHARD_SIZE) {
    const chunkIds = ids.slice(i, i + SYNC_SHARD_SIZE)
    const chunkMap = {}
    chunkIds.forEach(function(id) { chunkMap[id] = tunes[id] })
    const abc = tunesToAbcFn(chunkMap, {})
    const shardIndex = Math.floor(i / SYNC_SHARD_SIZE)
    shards.push({
      name: 'tunebook-tunes-' + String(shardIndex).padStart(3, '0') + '.abc',
      tuneCount: chunkIds.length,
      abc: abc,
      hash: simpleHash(abc),
    })
  }
  return shards
}

function simpleHash(text) {
  let h = 0
  const s = String(text || '')
  for (let i = 0; i < s.length; i += 1) {
    h = ((h << 5) - h) + s.charCodeAt(i)
    h |= 0
  }
  return String(h)
}

export function stripManifestFromAbc(abcText) {
  if (!abcText || abcText.indexOf(MANIFEST_PREFIX) < 0) return abcText
  const before = abcText.slice(0, abcText.indexOf(MANIFEST_PREFIX))
  const afterStart = abcText.indexOf(MANIFEST_END)
  const after = afterStart >= 0 ? abcText.slice(afterStart + MANIFEST_END.length) : ''
  return (before + after).trim()
}

/**
 * Build ABC with embedded manifest + shard sections (single Drive document).
 */
export function buildShardedTuneAbc(tunes, tunesToAbcFn, deletedTunes) {
  const shards = buildTuneShards(tunes, function(chunkMap) {
    return tunesToAbcFn(chunkMap, deletedTunes || {})
  })
  const manifest = buildSyncManifest(shards)
  const parts = [manifest]
  shards.forEach(function(shard) {
    parts.push(SHARD_PREFIX + shard.name)
    parts.push(shard.abc)
  })
  return parts.join('\n')
}

/**
 * Iterate tunes from sharded ABC (manifest + shard sections). Returns false if not sharded.
 */
export function iterateShardedTunesFromAbc(abcText, abc2json, onTune) {
  const manifest = parseSyncManifest(abcText)
  if (!manifest || !Array.isArray(manifest.shards)) return false
  const lines = String(abcText || '').split('\n')
  let shardLines = []
  let inShard = false
  function flushShard() {
    if (shardLines.length === 0) return
    const shardAbc = shardLines.join('\n')
    shardLines = []
    const parts = shardAbc.split('X:').filter(function(p) { return p && p.trim() })
    parts.forEach(function(part) {
      const tune = abc2json('X:' + part)
      if (tune && tune.id != null) onTune(tune)
    })
  }
  lines.forEach(function(line) {
    if (line.indexOf(SHARD_PREFIX) === 0) {
      if (inShard) flushShard()
      inShard = true
      return
    }
    if (line.indexOf(MANIFEST_PREFIX) === 0 || line.indexOf(MANIFEST_END) === 0) {
      inShard = false
      return
    }
    if (inShard) shardLines.push(line)
  })
  if (inShard) flushShard()
  return true
}
