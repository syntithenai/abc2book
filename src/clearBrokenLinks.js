/**
 * Helpers for removing broken playback links from tunes.
 */

export function linkLabel(link, linkIndex) {
  const title = link && link.title && String(link.title).trim()
  if (title) return title
  return 'Link ' + ((Number(linkIndex) || 0) + 1)
}

/** Remove one link by index; returns a new tune object. */
export function removeTuneLinkAtIndex(tune, linkIndex) {
  if (!tune) return tune
  const links = Array.isArray(tune.links) ? tune.links.slice() : []
  const idx = parseInt(linkIndex, 10)
  if (!(idx >= 0) || idx >= links.length) return tune
  links.splice(idx, 1)
  return Object.assign({}, tune, { links: links })
}

/**
 * Remove several link indexes from a tune (descending so indexes stay valid).
 * @param {object} tune
 * @param {number[]} linkIndexes
 */
export function removeTuneLinksAtIndexes(tune, linkIndexes) {
  if (!tune || !Array.isArray(linkIndexes) || !linkIndexes.length) return tune
  const unique = Array.from(new Set(linkIndexes.map(function(i) { return parseInt(i, 10) })
    .filter(function(i) { return i >= 0 })))
  unique.sort(function(a, b) { return b - a })
  let next = tune
  unique.forEach(function(idx) {
    next = removeTuneLinkAtIndex(next, idx)
  })
  return next
}

/**
 * Group link-check failures by tuneId.
 * @param {Array} failures
 * @returns {{ tuneId: string, tuneName: string, composer: string, failures: Array }[]}
 */
export function groupLinkFailuresByTune(failures) {
  const map = {}
  const order = []
  ;(Array.isArray(failures) ? failures : []).forEach(function(item) {
    if (!item || item.tuneId == null) return
    const key = String(item.tuneId)
    if (!map[key]) {
      map[key] = {
        tuneId: item.tuneId,
        tuneName: item.tuneName || 'Untitled',
        composer: item.composer || '',
        failures: [],
      }
      order.push(key)
    }
    map[key].failures.push(item)
  })
  return order.map(function(key) { return map[key] })
}
