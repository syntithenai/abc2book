import { isPdfTuneFileType } from './tuneFiles'

export function pendingSnapshotsFromCandidate(candidate) {
  const pending = candidate && candidate.pendingFile
  if (!pending || !pending.blob) return []
  return [{
    id: 'pending-snapshot',
    name: pending.name || 'Sheet file',
    type: pending.type || (pending.blob && pending.blob.type) || '',
    blob: pending.blob,
    pending: true,
  }]
}

export function importReviewSnapshotEntries(tuneFiles, pendingSnapshots) {
  const stored = Array.isArray(tuneFiles) ? tuneFiles.filter(function(file) {
    return file && (file.id || file.name)
  }).map(function(file) {
    return {
      id: file.id || file.name,
      name: file.name || 'File',
      type: file.type || '',
      pending: false,
    }
  }) : []
  const pending = Array.isArray(pendingSnapshots) ? pendingSnapshots.filter(Boolean) : []
  return stored.concat(pending)
}

export function describeSnapshotForCancel(file) {
  if (!file) return ''
  const name = String(file.name || 'Sheet file').trim()
  const kind = isPdfTuneFileType(file.type) ? 'PDF' : 'Image'
  return name + ' (' + kind + ' snapshot)'
}

export function snapshotKindLabel(type) {
  return isPdfTuneFileType(type) ? 'PDF' : 'Image'
}
