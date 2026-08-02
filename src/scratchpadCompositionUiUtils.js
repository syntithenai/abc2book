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

export function assignedNotationSourceItemIds(composition) {
  const ids = new Set()
  if (!composition) return ids
  const assignedChunkIds = assignedNotationChunkIds(composition)
  const chunks = Array.isArray(composition.notationChunks) ? composition.notationChunks : []
  chunks.forEach(function(chunk) {
    if (chunk && chunk.sourceItemId && assignedChunkIds.has(chunk.id)) {
      ids.add(String(chunk.sourceItemId))
    }
  })
  return ids
}

export function sortScratchpadItemsForNotationSelect(items, composition) {
  const assignedSources = assignedNotationSourceItemIds(composition)
  const suggested = []
  const other = []
  ;(Array.isArray(items) ? items : []).forEach(function(item) {
    if (!item) return
    if (assignedSources.has(String(item.id))) {
      suggested.push(item)
    } else {
      other.push(item)
    }
  })
  return suggested.concat(other)
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

export function truncatePreviewLine(line, maxLen) {
  const text = String(line || '').trim()
  const limit = maxLen || 72
  if (text.length <= limit) return text
  return text.slice(0, limit - 1) + '…'
}

export function twoTrimmedPreviewLines(text, maxLineLen) {
  const limit = maxLineLen || 72
  const lines = String(text || '').split(/\r?\n/).map(function(line) {
    return String(line || '').trim()
  }).filter(Boolean)
  const result = []
  for (let i = 0; i < lines.length && result.length < 2; i += 1) {
    result.push(truncatePreviewLine(lines[i], limit))
  }
  if (result.length === 0) {
    const flat = String(text || '').trim().replace(/\s+/g, ' ')
    if (!flat) return []
    if (flat.length <= limit) return [flat]
    result.push(truncatePreviewLine(flat.slice(0, limit), limit))
    if (flat.length > limit) {
      result.push(truncatePreviewLine(flat.slice(limit), limit))
    }
  }
  return result.slice(0, 2)
}

export function textScratchpadItemPreviewLines(item) {
  if (!item || item.type !== 'text' || !item.text) return []
  return twoTrimmedPreviewLines(item.text.body || '')
}

export function notationScratchpadItemPreviewLines(item) {
  if (!item || item.type !== 'notation' || !item.notation) return []
  const tune = item.notation.tuneSnapshot
  if (!tune || !tune.voices) return []
  const voiceKey = Object.keys(tune.voices)[0]
  const notes = tune.voices[voiceKey] && tune.voices[voiceKey].notes
  const lines = Array.isArray(notes) ? notes : []
  const flat = lines.map(function(line) {
    return String(line || '').trim().replace(/\|+/g, ' ')
  }).filter(Boolean).join(' ')
  return twoTrimmedPreviewLines(flat)
}
