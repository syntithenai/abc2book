/**
 * Pure helpers for feed inject: near-top prepend vs pending queue + factHash dedupe.
 */

export function streamSeenMaps(stream) {
  const ids = {}
  const hashes = {}
  ;(stream || []).forEach(function(item) {
    if (!item) return
    if (item.id) ids[item.id] = true
    if (item.factHash) hashes[item.factHash] = true
  })
  return { ids: ids, hashes: hashes }
}

/**
 * Decide which new items prepend into the stream vs queue for the "N new stories" chip.
 * Always dedupes by id and factHash against stream + already-pending.
 */
export function planInjectWave(options) {
  const opts = options || {}
  const newItems = Array.isArray(opts.newItems) ? opts.newItems : []
  const injectCap = opts.injectCap > 0 ? opts.injectCap : 3
  const nearTop = !!opts.nearTop
  const streamIds = opts.streamIds || {}
  const streamHashes = opts.streamHashes || {}
  const pendingIds = opts.pendingIds || {}
  const pendingHashes = opts.pendingHashes || {}

  const add = []
  const seenIds = Object.assign({}, streamIds, pendingIds)
  const seenHashes = Object.assign({}, streamHashes, pendingHashes)

  newItems.forEach(function(item) {
    if (!item || !item.id || !item.isNew) return
    if (seenIds[item.id]) return
    if (item.factHash && seenHashes[item.factHash]) return
    seenIds[item.id] = true
    if (item.factHash) seenHashes[item.factHash] = true
    add.push(item)
  })

  if (nearTop) {
    return { prepend: add.slice(0, injectCap), pending: [] }
  }
  return { prepend: [], pending: add }
}
