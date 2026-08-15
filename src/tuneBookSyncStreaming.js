/**
 * Streaming merge/compare without holding full remote tune map in memory.
 */
import { tunePairHasDifferingImportFields } from './tuneImportMergeUtils'
import {
  compareTuneBooks,
  effectiveLocalUpdatedMs,
  toTuneUpdatedMs as toMs,
} from './tuneBookSync'

function tombstoneWinsOverTune(tombAt, tuneAt) {
  return tombAt > 0 && tombAt >= tuneAt
}

function emptyBuckets() {
  return {
    inserts: {},
    updates: {},
    deletes: {},
    localUpdates: {},
    localInserts: {},
  }
}

function classifyRemoteTune(
  localTunes,
  localDel,
  remoteDel,
  remoteTune,
  buckets,
  remoteActiveIds,
  uploadedUpdated,
  uploadedDeleted
) {
  if (!remoteTune || !remoteTune.id) return
  const id = remoteTune.id
  remoteActiveIds[id] = true

  const localTune = localTunes[id]
  const localTomb = localDel[id]
  const remoteTomb = remoteDel[id]
  const remoteTuneAt = toMs(remoteTune.lastUpdated)
  const uploadedTuneAt = toMs(uploadedUpdated[id])
  const uploadedDeletedAt = toMs(uploadedDeleted[id])
  const localTuneAt = effectiveLocalUpdatedMs(localTune && localTune.lastUpdated, uploadedTuneAt)
  const localTombAt = localTomb ? toMs(localTomb.deletedAt) : 0
  const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0

  if (tombstoneWinsOverTune(remoteTombAt, localTuneAt)) {
    if (uploadedDeletedAt > 0 && remoteTombAt <= uploadedDeletedAt) {
      return
    }
    if (localTune) {
      buckets.deletes[id] = Object.assign({}, localTune, { name: localTune.name || (remoteTomb && remoteTomb.name) })
    }
    return
  }

  if (tombstoneWinsOverTune(localTombAt, remoteTuneAt)) {
    return
  }

  if (localTune) {
    const hasFieldDiff = tunePairHasDifferingImportFields(localTune, remoteTune)
    if (remoteTuneAt > localTuneAt) {
      if (hasFieldDiff) buckets.updates[id] = [localTune, remoteTune]
    } else if (remoteTuneAt < localTuneAt) {
      if (hasFieldDiff) buckets.localUpdates[id] = [remoteTune, localTune]
    }
  } else if (!(uploadedTuneAt > 0 && remoteTuneAt <= uploadedTuneAt)) {
    buckets.inserts[id] = remoteTune
  }
}

function finalizeLocalOnly(
  localTunes,
  localDel,
  remoteDel,
  remoteActiveIds,
  buckets,
  uploadedUpdated,
  uploadedDeleted
) {
  Object.keys(localTunes || {}).forEach(function(tuneId) {
    if (remoteActiveIds[tuneId]) return
    const localTune = localTunes[tuneId]
    const remoteTomb = remoteDel[tuneId]
    const remoteTombAt = remoteTomb ? toMs(remoteTomb.deletedAt) : 0
    const uploadedTuneAt = toMs(uploadedUpdated[tuneId])
    const uploadedDeletedAt = toMs(uploadedDeleted[tuneId])
    const localTuneAt = effectiveLocalUpdatedMs(localTune && localTune.lastUpdated, uploadedTuneAt)

    if (tombstoneWinsOverTune(remoteTombAt, localTuneAt)) {
      if (uploadedDeletedAt > 0 && remoteTombAt <= uploadedDeletedAt) {
        return
      }
      buckets.deletes[tuneId] = Object.assign({}, localTune, { name: localTune.name || (remoteTomb && remoteTomb.name) })
      return
    }
    buckets.localInserts[tuneId] = localTune
  })
}

/**
 * Compare using a streaming remote iterator (onRemoteTune called per tune).
 */
export async function compareTuneBooksStreaming({
  localTunes,
  localDeleted,
  remoteDeleted,
  remoteTuneIterator,
  lastUpdatedById,
  lastDeletedAtById,
}) {
  const buckets = emptyBuckets()
  const remoteActiveIds = {}
  const localDel = localDeleted || {}
  const remoteDel = remoteDeleted || {}
  const uploadedUpdated = lastUpdatedById || {}
  const uploadedDeleted = lastDeletedAtById || {}

  if (typeof remoteTuneIterator === 'function') {
    await remoteTuneIterator(function(remoteTune) {
      classifyRemoteTune(
        localTunes,
        localDel,
        remoteDel,
        remoteTune,
        buckets,
        remoteActiveIds,
        uploadedUpdated,
        uploadedDeleted
      )
    })
  }

  finalizeLocalOnly(
    localTunes,
    localDel,
    remoteDel,
    remoteActiveIds,
    buckets,
    uploadedUpdated,
    uploadedDeleted
  )
  return buckets
}

/**
 * Fallback: delegate to compareTuneBooks when remote map already built.
 */
export function compareTuneBooksFromRemoteMap(params) {
  return compareTuneBooks(params)
}
