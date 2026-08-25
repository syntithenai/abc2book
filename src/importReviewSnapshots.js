import { isPdfTuneFileType } from './tuneFiles'
import { isMidiImportFile, isMidiMimeType, isMidiFileName } from './midiFileUtils'

function pendingFileAsFile(pending) {
  if (!pending || !pending.blob) return null
  if (pending.blob instanceof File) return pending.blob
  return new File(
    [pending.blob],
    pending.name || 'import.mid',
    { type: pending.type || pending.blob.type || 'audio/midi' }
  )
}

export function isMidiPendingFile(pendingFile) {
  if (!pendingFile || !pendingFile.blob) return false
  const file = pendingFileAsFile(pendingFile)
  if (file && isMidiImportFile(file)) return true
  if (isMidiMimeType(pendingFile.type)) return true
  return isMidiFileName(pendingFile.name)
}

export function pendingSnapshotsFromCandidate(candidate) {
  const pending = candidate && candidate.pendingFile
  if (!pending || !pending.blob || isMidiPendingFile(pending)) return []
  return [{
    id: 'pending-snapshot',
    name: pending.name || 'Sheet file',
    type: pending.type || (pending.blob && pending.blob.type) || '',
    blob: pending.blob,
    pending: true,
  }]
}

/** Pending MIDI import file shown as an attach-on-save media link (not a snapshot). */
export function pendingMidiLinkFromCandidate(candidate) {
  const pending = candidate && candidate.pendingFile
  if (!pending || !pending.blob || !isMidiPendingFile(pending)) return null
  const name = String(pending.name || 'import.mid').trim() || 'import.mid'
  return {
    id: 'pending-midi-link',
    title: name,
    name: name,
    link: '',
    mediaKind: 'midi',
    pending: true,
  }
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

export function describePendingMidiLinkForCancel(pendingLink) {
  if (!pendingLink) return ''
  const name = String(pendingLink.title || pendingLink.name || 'MIDI file').trim()
  return name + ' (MIDI link)'
}

export function snapshotKindLabel(type) {
  return isPdfTuneFileType(type) ? 'PDF' : 'Image'
}
