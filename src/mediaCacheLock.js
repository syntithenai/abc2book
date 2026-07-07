export function isMediaCacheLocked(tune) {
  return !!(tune && tune.mediaCacheLocked)
}

export function getLockedTuneIdSet(tunes) {
  const locked = {}
  Object.keys(tunes || {}).forEach(function(tuneId) {
    if (isMediaCacheLocked(tunes[tuneId])) {
      locked[tuneId] = true
    }
  })
  return locked
}

export function countMediaCacheLockedTunes(tunes) {
  let count = 0
  Object.keys(tunes || {}).forEach(function(tuneId) {
    if (isMediaCacheLocked(tunes[tuneId])) count += 1
  })
  return count
}

export function filterUnlockedTuneIds(tuneIds, lockedTuneIds) {
  if (!lockedTuneIds || Object.keys(lockedTuneIds).length === 0) {
    return (tuneIds || []).slice()
  }
  return (tuneIds || []).filter(function(tuneId) {
    return !lockedTuneIds[tuneId]
  })
}

export function setMediaCacheLockForTunes(tunebook, tunes, locked) {
  const updated = []
  ;(tunes || []).forEach(function(tune) {
    if (!tune || !tune.id) return
    const next = Object.assign({}, tune)
    if (locked) {
      next.mediaCacheLocked = true
    } else {
      delete next.mediaCacheLocked
    }
    tunebook.saveTune(next, false, {
      historyLabel: locked ? 'Lock media cache' : 'Unlock media cache',
    })
    updated.push(next)
  })
  return updated
}
