import {
  mergePerformanceSetsFromTuneBookAbc,
  importSinglePerformanceSetFromAbc,
} from './performanceSetSyncClient'
import {
  mergePlaylistsFromTuneBookAbc,
  importSinglePlaylistFromAbc,
} from './playlistSyncClient'
import {
  registerSyncSourceAfterImport,
} from './syncSourceImportUtils'

let pendingSideEffect = null
let pendingSourceRegistration = null

export function setPendingShareImportSideEffect(effect) {
  pendingSideEffect = effect || null
}

export function setPendingShareImportSourceRegistration(registration) {
  pendingSourceRegistration = registration || null
}

export function consumePendingShareImportSourceRegistration() {
  const registration = pendingSourceRegistration
  pendingSourceRegistration = null
  return registration
}

export function clearPendingShareImportSourceRegistration() {
  pendingSourceRegistration = null
}

export function consumePendingShareImportSideEffect() {
  const effect = pendingSideEffect
  pendingSideEffect = null
  return effect
}

export function runPendingShareImportSideEffect() {
  const effect = consumePendingShareImportSideEffect()
  const registration = consumePendingShareImportSourceRegistration()
  if (registration) {
    registerSyncSourceAfterImport(registration)
  }
  if (!effect || !effect.abcText) return Promise.resolve()

  if (effect.scope === 'all') {
    return mergePerformanceSetsFromTuneBookAbc(effect.abcText, { interactive: false, applySilently: true })
      .then(function() {
        return mergePlaylistsFromTuneBookAbc(effect.abcText, { interactive: false, applySilently: true })
      })
  }
  if (effect.scope === 'set' && effect.setId) {
    return Promise.resolve(importSinglePerformanceSetFromAbc(effect.abcText, effect.setId))
  }
  if (effect.scope === 'playlist' && effect.playlistId) {
    return Promise.resolve(importSinglePlaylistFromAbc(effect.abcText, effect.playlistId))
  }
  return Promise.resolve()
}
