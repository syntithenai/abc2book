export const CURATOR_PHASES = [
  { id: 'folk-world', label: 'Folk & world' },
  { id: 'pop-rock', label: 'Pop & rock' },
  { id: 'remainder', label: 'Remainder' },
]

export const CURATOR_TABS = {
  overview: 'overview',
  artists: 'artists',
  folders: 'folders',
  tracks: 'tracks',
  duplicates: 'duplicates',
}

export function buildArtUrl(entryId, resolverBase) {
  if (!entryId || !resolverBase) return ''
  return String(resolverBase).replace(/\/$/, '') + '/music-collection-art/' + entryId
}

export function topStatItems(items, limit) {
  if (!Array.isArray(items)) return []
  return items.slice(0, limit || 8)
}

export function triageStatusLabel(status) {
  if (status === 'maybe') return 'Review later'
  if (status === 'keep') return 'Keep'
  if (status === 'cull') return 'Cull'
  return 'Unset'
}
