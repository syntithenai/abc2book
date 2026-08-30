import utilsFunctions from './utilsFunctions'
import {
  getTuneFiles,
  resolveTuneFileBlob,
  storeEmbeddedTuneFileFromMeta,
} from './tuneFiles'

const utils = utilsFunctions()

/** True when any tune has at least one snapshot (tuneFiles meta). */
export function tunesHaveSnapshots(tunes) {
  const list = Array.isArray(tunes) ? tunes : Object.values(tunes || {})
  return list.some(function(tune) {
    return getTuneFiles(tune).length > 0
  })
}

/** Default for the embed-snapshots checkbox on ABC download. */
export function shouldDefaultEmbedSnapshots(tunes) {
  return tunesHaveSnapshots(tunes)
}

/**
 * Clone tunes and, when embedSnapshots is true, attach base64 `.data` on each
 * tuneFile meta that can be resolved from local storage / cache / Drive.
 */
export async function prepareTunesForAbcExport(tunes, options) {
  const opts = options || {}
  const list = Array.isArray(tunes) ? tunes.filter(Boolean) : []
  if (!opts.embedSnapshots) {
    return list.slice()
  }

  const prepared = []
  for (let i = 0; i < list.length; i += 1) {
    const tune = list[i]
    const files = getTuneFiles(tune)
    if (!files.length) {
      prepared.push(tune)
      continue
    }
    const nextFiles = []
    for (let k = 0; k < files.length; k += 1) {
      const meta = files[k]
      if (!meta || !meta.id) {
        nextFiles.push(meta)
        continue
      }
      const copy = Object.assign({}, meta)
      try {
        const resolved = await resolveTuneFileBlob(meta, tune.id, opts)
        if (resolved && resolved.blob) {
          const dataUrl = await utils.blobToBase64(resolved.blob)
          if (dataUrl) copy.data = dataUrl
        }
      } catch (e) {
        // Keep meta-only when blob is unavailable.
      }
      nextFiles.push(copy)
    }
    prepared.push(Object.assign({}, tune, { tuneFiles: nextFiles }))
  }
  return prepared
}

/**
 * Persist any inline tuneFiles[].data from ABC into the tunefiles store,
 * then return a tune whose meta no longer carries `.data`.
 */
export async function hydrateEmbeddedTuneFileSnapshots(tune) {
  if (!tune) return tune
  const files = getTuneFiles(tune)
  if (!files.length) return tune

  let changed = false
  const nextFiles = []
  for (let i = 0; i < files.length; i += 1) {
    const meta = files[i]
    if (!meta || !meta.id || !meta.data) {
      nextFiles.push(meta)
      continue
    }
    changed = true
    nextFiles.push(await storeEmbeddedTuneFileFromMeta(tune, meta))
  }

  if (!changed) return tune
  return Object.assign({}, tune, { tuneFiles: nextFiles })
}

/**
 * Hydrate every tune object in an import-results bucket map (id → tune).
 */
export async function hydrateImportTuneMap(tuneMap) {
  if (!tuneMap || typeof tuneMap !== 'object') return tuneMap
  const ids = Object.keys(tuneMap)
  const next = Object.assign({}, tuneMap)
  for (let i = 0; i < ids.length; i += 1) {
    const id = ids[i]
    const tune = next[id]
    if (!tune) continue
    next[id] = await hydrateEmbeddedTuneFileSnapshots(tune)
  }
  return next
}

/**
 * Hydrate inserts/updates/duplicates/localUpdates/skippedUpdates in import results.
 */
export async function hydrateImportResultsSnapshots(data) {
  if (!data || typeof data !== 'object') return data
  const next = Object.assign({}, data)
  const keys = ['inserts', 'updates', 'duplicates', 'localUpdates', 'skippedUpdates']
  for (let i = 0; i < keys.length; i += 1) {
    const key = keys[i]
    if (next[key]) {
      next[key] = await hydrateImportTuneMap(next[key])
    }
  }
  return next
}
