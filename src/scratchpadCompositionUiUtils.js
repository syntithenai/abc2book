/**
 * UI helpers for scratchpad composition association pickers.
 */
export function assignedNotationChunkIds(composition) {
  const ids = new Set()
  const explicit = Array.isArray(composition && composition.pairings) ? composition.pairings : []
  explicit.forEach(function(pair) {
    if (pair && pair.notationChunkId) ids.add(pair.notationChunkId)
  })
  return ids
}

export function sortNotationChunksForAssociation(notationChunks, composition, currentNotationId) {
  const assigned = assignedNotationChunkIds(composition)
  const chunks = Array.isArray(notationChunks) ? notationChunks.slice() : []
  return chunks.sort(function(a, b) {
    function score(chunk) {
      if (!chunk) return 0
      if (chunk.id === currentNotationId) return 3
      if (assigned.has(chunk.id)) return 2
      return 1
    }
    const aScore = score(a)
    const bScore = score(b)
    if (aScore !== bScore) return bScore - aScore
    return (Number(a.order) || 0) - (Number(b.order) || 0)
  })
}

export function partitionNotationChunksForSelect(notationChunks, composition, currentNotationId) {
  const sorted = sortNotationChunksForAssociation(notationChunks, composition, currentNotationId)
  const assigned = assignedNotationChunkIds(composition)
  const suggested = []
  const other = []
  sorted.forEach(function(chunk) {
    if (!chunk) return
    if (chunk.id === currentNotationId || assigned.has(chunk.id)) {
      suggested.push(chunk)
    } else {
      other.push(chunk)
    }
  })
  return { suggested: suggested, other: other }
}

export function sourceItemIdForCompositionChunk(chunk) {
  if (!chunk || !chunk.sourceItemId) return null
  return String(chunk.sourceItemId)
}

export function previewSnippet(text, maxLen) {
  const raw = String(text || '').trim()
  if (!raw) return ''
  const oneLine = raw.split(/\r?\n/).map(function(line) { return line.trim() }).filter(Boolean).join(' / ')
  const limit = maxLen || 120
  if (oneLine.length <= limit) return oneLine
  return oneLine.slice(0, limit - 1) + '…'
}
