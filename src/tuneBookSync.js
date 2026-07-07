import { tunePairHasDifferingImportFields } from './tuneImportMergeUtils'

const DELETED_TUNE_PREFIX = '% abcbook-deleted-tune '

export function parseDeletedTunesFromAbc(abcText) {
  const deleted = {}
  if (!abcText || !abcText.split) return deleted
  abcText.split('\n').forEach(function(line) {
    const trimmed = line.trim()
    if (!trimmed.startsWith(DELETED_TUNE_PREFIX)) return
    const rest = trimmed.slice(DELETED_TUNE_PREFIX.length)
    const space = rest.indexOf(' ')
    if (space === -1) return
    const id = rest.slice(0, space)
    const remainder = rest.slice(space + 1).trim()
    const secondSpace = remainder.indexOf(' ')
    const deletedAt = secondSpace === -1
      ? parseInt(remainder, 10) || 0
      : parseInt(remainder.slice(0, secondSpace), 10) || 0
    const name = secondSpace === -1 ? '' : remainder.slice(secondSpace + 1).trim()
    if (!id) return
    if (!deleted[id] || deletedAt >= deleted[id].deletedAt) {
      deleted[id] = { id: id, deletedAt: deletedAt, name: name || undefined }
    }
  })
  return deleted
}

export function renderDeletedTunesToAbc(deletedTunesMap) {
  if (!deletedTunesMap) return ''
  return Object.values(deletedTunesMap).map(function(t) {
    const namePart = t.name ? ' ' + t.name : ''
    return DELETED_TUNE_PREFIX + t.id + ' ' + t.deletedAt + namePart
  }).join('\n')
}

export function mergeDeletedTuneMaps(localDeleted, remoteDeleted) {
  const merged = Object.assign({}, localDeleted || {})
  Object.values(remoteDeleted || {}).forEach(function(t) {
    if (!merged[t.id] || t.deletedAt >= merged[t.id].deletedAt) {
      merged[t.id] = t
    }
  })
  return merged
}

export function toTuneUpdatedMs(ts) {
  return parseInt(ts, 10) || 0
}

export function isIncomingTuneNewer(localTune, incomingTune) {
  if (!incomingTune) return false
  if (!localTune) return true
  return toTuneUpdatedMs(incomingTune.lastUpdated) > toTuneUpdatedMs(localTune.lastUpdated)
}

function toMs(ts) {
  return toTuneUpdatedMs(ts)
}

function tombstoneWinsOverTune(tombAt, tuneAt) {
  return tombAt > 0 && tombAt >= tuneAt
}

/**
 * Classify differences between local state and remote/imported ABC content.
 * Returns buckets used by merge and import warning UIs.
 */
export function compareTuneBooks({ localTunes, localDeleted, remoteTunes, remoteDeleted }) {
  const inserts = {}
  const updates = {}
  const deletes = {}
  const localUpdates = {}
  const localInserts = {}

  const localDel = localDeleted || {}
  const remoteDel = remoteDeleted || {}
  const remoteActiveIds = {}

  Object.values(remoteTunes || {}).forEach(function(remoteTune) {
    if (!remoteTune || !remoteTune.id) return
    const id = remoteTune.id
    remoteActiveIds[id] = true

    const localTune = localTunes[id]
    const localTomb = localDel[id]
    const remoteTomb = remoteDel[id]
    const remoteTuneAt = toMs(remoteTune.lastUpdated)
    const localTuneAt = localTune ? toMs(localTune.lastUpdated) : 0
    const localTombAt = localTomb ? toMs(localTomb.deletedAt) : 0
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0

    if (tombstoneWinsOverTune(remoteTombAt, localTuneAt)) {
      if (localTune) {
        deletes[id] = Object.assign({}, localTune, { name: localTune.name || (remoteTomb && remoteTomb.name) })
      }
      return
    }

    if (tombstoneWinsOverTune(localTombAt, remoteTuneAt)) {
      return
    }

    if (localTune) {
      const hasFieldDiff = tunePairHasDifferingImportFields(localTune, remoteTune)
      if (remoteTuneAt > localTuneAt) {
        if (hasFieldDiff) updates[id] = [localTune, remoteTune]
      } else if (remoteTuneAt < localTuneAt) {
        if (hasFieldDiff) localUpdates[id] = [remoteTune, localTune]
      }
    } else {
      inserts[id] = remoteTune
    }
  })

  Object.keys(localTunes || {}).forEach(function(tuneId) {
    if (remoteActiveIds[tuneId]) return

    const localTune = localTunes[tuneId]
    const remoteTomb = remoteDel[tuneId]
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0
    const localTuneAt = toMs(localTune.lastUpdated)

    if (tombstoneWinsOverTune(remoteTombAt, localTuneAt)) {
      deletes[tuneId] = Object.assign({}, localTune, { name: localTune.name || (remoteTomb && remoteTomb.name) })
      return
    }

    localInserts[tuneId] = localTune
  })

  return { inserts, updates, deletes, localUpdates, localInserts }
}

export function createTombstone(tuneId, name, deletedAt) {
  return {
    id: tuneId,
    deletedAt: deletedAt || Date.now(),
    name: name || undefined,
  }
}

export function tombstoneAllTunes(tunes, deletedAt) {
  const ts = deletedAt || Date.now()
  const tombs = {}
  Object.values(tunes || {}).forEach(function(tune) {
    if (tune && tune.id) {
      tombs[tune.id] = createTombstone(tune.id, tune.name, ts)
    }
  })
  return tombs
}
