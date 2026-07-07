import {
  mergePerformanceSetsFromTuneBookAbc,
  importSinglePerformanceSetFromAbc,
} from './performanceSetSyncClient'
import {
  mergePlaylistsFromTuneBookAbc,
  importSinglePlaylistFromAbc,
} from './playlistSyncClient'

let pendingSideEffect = null

export function setPendingShareImportSideEffect(effect) {
  pendingSideEffect = effect || null
}

export function consumePendingShareImportSideEffect() {
  const effect = pendingSideEffect
  pendingSideEffect = null
  return effect
}

export function runPendingShareImportSideEffect() {
  const effect = consumePendingShareImportSideEffect()
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
